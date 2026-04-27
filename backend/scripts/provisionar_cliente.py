"""CLI idempotente que provisiona um cliente fim-a-fim:

  1. site no Postgres/SQLite (TenantsRepo) — cria se nao existir
  2. publishable_key default                  — cria se nao houver nenhuma ativa
  3. quotas + retencao_dias do plano          — atualiza
  4. bucket InfluxDB com retention            — cria ou atualiza
  5. token Influx escopado ao bucket (read)   — recria sempre (Grafana plaintext)
  6. organization no Grafana                  — cria se nao existir
  7. datasource Influx no Grafana             — cria/atualiza com novo token

Uso (dentro de docker-compose ou com os envs equivalentes):

    python -m scripts.provisionar_cliente \
        --slug acme-test --nome "Acme Test" --ambiente development \
        --dominio https://acme.test --plano free

Envs requeridos:
    INFLUXDB_URL, INFLUXDB_ORG, INFLUXDB_TOKEN  (admin token)
    GRAFANA_URL                                  (ex.: http://grafana:3000)
    GRAFANA_ADMIN_USER, GRAFANA_ADMIN_PASSWORD   (admin Basic Auth)
    TENANTS_DATABASE_URL                          (Postgres ou SQLite)
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from auth.tenants_repo import TenantsRepo, criar_tenants_repo  # noqa: E402
from config import config  # noqa: E402

from influxdb_client import (  # noqa: E402
    Authorization,
    BucketRetentionRules,
    InfluxDBClient,
    Permission,
    PermissionResource,
)


# Defaults por plano. Ver ark/docs/dashboard-cliente.md sec. 18.
PLANO_DEFAULTS = {
    "free":    {"retencao_dias":   7, "eventos_por_dia":    10_000, "eventos_por_minuto":   600},
    "pequeno": {"retencao_dias":  30, "eventos_por_dia":   100_000, "eventos_por_minuto":   600},
    "medio":   {"retencao_dias":  90, "eventos_por_dia": 1_000_000, "eventos_por_minuto":  6_000},
    "grande":  {"retencao_dias": 365, "eventos_por_dia":10_000_000, "eventos_por_minuto": 60_000},
}


@dataclass
class ProvisionResult:
    site_id: str
    slug: str
    plano: str
    bucket_name: str
    bucket_id: str
    retention_dias: int
    grafana_org_id: int
    grafana_org_name: str
    grafana_ds_uid: str
    grafana_ds_name: str
    influx_token_id: str
    influx_token_value: str
    publishable_key: Optional[str]


# ----------------------------- Postgres -----------------------------

def _ensure_site(repo: TenantsRepo, *, slug: str, nome: str, ambiente: str,
                 dominios: list[str], plano: str, bucket_name: str):
    site = repo.obter_site_por_slug(slug)
    publishable = None
    if site is None:
        site = repo.criar_site(slug=slug, nome=nome, ambiente=ambiente,
                               dominios=dominios, plano=plano, bucket_name=bucket_name)
        _, publishable = repo.criar_publishable_key(
            site_id=site.id, ambiente=ambiente, nome="default"
        )
    else:
        # Backfill do bucket_name se nao havia
        if not site.bucket_name:
            repo.definir_bucket_name(site.id, bucket_name)
        elif site.bucket_name != bucket_name:
            raise SystemExit(
                f"erro: site '{slug}' ja tem bucket_name='{site.bucket_name}', "
                f"diferente do solicitado '{bucket_name}'. "
                f"Para mudar bucket use --bucket explicitamente igual ao atual ou nao passe."
            )
        # Garante 1 publishable ativa; nao re-emite valor (so e visivel na criacao).
        keys = repo.listar_publishable_keys(site.id)
        if not any(not k.revogada for k in keys):
            _, publishable = repo.criar_publishable_key(
                site_id=site.id, ambiente=ambiente, nome="default"
            )

    # Aplica defaults do plano (sobrescreve quotas atuais)
    plano_cfg = PLANO_DEFAULTS.get(plano)
    if plano_cfg:
        repo.atualizar_quota(site.id, **plano_cfg)

    return site, publishable, plano_cfg


# ----------------------------- InfluxDB -----------------------------

def _ensure_bucket(client: InfluxDBClient, *, org_name: str, bucket_name: str,
                   retention_dias: int):
    org = _influx_org(client, org_name)
    buckets_api = client.buckets_api()
    bucket = buckets_api.find_bucket_by_name(bucket_name)
    every_seconds = retention_dias * 24 * 60 * 60
    rules = [BucketRetentionRules(type="expire", every_seconds=every_seconds)]
    if bucket is None:
        bucket = buckets_api.create_bucket(
            bucket_name=bucket_name,
            retention_rules=rules,
            org_id=org.id,
            description=f"bucket dedicado para cliente_slug={bucket_name}",
        )
        return bucket, org
    # idempotente: ajusta retencao se mudou
    if not bucket.retention_rules or bucket.retention_rules[0].every_seconds != every_seconds:
        bucket.retention_rules = rules
        bucket = buckets_api.update_bucket(bucket=bucket)
    return bucket, org


def _rotate_grafana_read_token(client: InfluxDBClient, *, org_id: str, bucket_id: str,
                               descricao: str):
    """Recria token escopado: plaintext so e visivel no momento da criacao."""
    auths_api = client.authorizations_api()
    # Revoga tokens antigos com mesma descricao.
    existentes = auths_api.find_authorizations(org_id=org_id) or []
    for a in existentes:
        if (a.description or "") == descricao:
            try:
                auths_api.delete_authorization(a)
            except Exception as exc:
                print(f"warn: falha ao deletar token antigo {a.id}: {exc}", file=sys.stderr)

    permissions = [
        Permission(action="read", resource=PermissionResource(
            type="buckets", id=bucket_id, org_id=org_id)),
    ]
    nova = auths_api.create_authorization(authorization=Authorization(
        org_id=org_id, permissions=permissions, description=descricao,
    ))
    return nova


def _influx_org(client: InfluxDBClient, org_name: str):
    orgs = client.organizations_api().find_organizations(org=org_name)
    if not orgs:
        raise SystemExit(f"erro: organizacao Influx '{org_name}' nao encontrada")
    return orgs[0]


# ----------------------------- Grafana -----------------------------

class GrafanaClient:
    def __init__(self, base_url: str, user: str, password: str):
        self.base_url = base_url.rstrip("/")
        token = base64.b64encode(f"{user}:{password}".encode()).decode()
        self.basic_auth = f"Basic {token}"

    def _req(self, method: str, path: str, *, body: Optional[dict] = None,
             org_id: Optional[int] = None, expect_status: tuple[int, ...] = (200, 201)):
        url = f"{self.base_url}{path}"
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Authorization", self.basic_auth)
        req.add_header("Accept", "application/json")
        if data is not None:
            req.add_header("Content-Type", "application/json")
        if org_id is not None:
            req.add_header("X-Grafana-Org-Id", str(org_id))
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                payload = resp.read()
                status = resp.status
                if status not in expect_status:
                    raise SystemExit(
                        f"grafana {method} {path} -> {status}: {payload.decode(errors='replace')}"
                    )
                return json.loads(payload) if payload else {}
        except urllib.error.HTTPError as exc:
            payload = exc.read().decode(errors="replace")
            return {"__http_error__": exc.code, "__body__": payload}

    def get_org_by_name(self, name: str) -> Optional[dict]:
        out = self._req("GET", f"/api/orgs/name/{urllib_quote(name)}", expect_status=(200,))
        if out.get("__http_error__") == 404:
            return None
        if "__http_error__" in out:
            raise SystemExit(f"grafana GET /api/orgs/name failed: {out}")
        return out

    def create_org(self, name: str) -> int:
        out = self._req("POST", "/api/orgs", body={"name": name}, expect_status=(200,))
        if out.get("__http_error__") == 409:
            existing = self.get_org_by_name(name)
            if existing:
                return existing["id"]
            raise SystemExit(f"grafana 409 ao criar org '{name}' mas GET nao encontrou")
        if "__http_error__" in out:
            raise SystemExit(f"grafana POST /api/orgs failed: {out}")
        return out["orgId"]

    def get_or_create_org(self, name: str) -> int:
        existing = self.get_org_by_name(name)
        if existing:
            return existing["id"]
        return self.create_org(name)

    def get_datasource_by_name(self, name: str, *, org_id: int) -> Optional[dict]:
        out = self._req("GET", f"/api/datasources/name/{urllib_quote(name)}",
                        org_id=org_id, expect_status=(200,))
        if out.get("__http_error__") == 404:
            return None
        if "__http_error__" in out:
            raise SystemExit(f"grafana GET datasource failed: {out}")
        return out

    def upsert_influx_datasource(self, *, org_id: int, name: str, influx_url: str,
                                  influx_org: str, bucket: str, token: str) -> dict:
        body = {
            "name": name,
            "type": "influxdb",
            "access": "proxy",
            "url": influx_url,
            "isDefault": False,
            "jsonData": {
                "version": "Flux",
                "organization": influx_org,
                "defaultBucket": bucket,
                "tlsSkipVerify": False,
            },
            "secureJsonData": {"token": token},
            "readOnly": False,
        }
        existing = self.get_datasource_by_name(name, org_id=org_id)
        if existing:
            uid = existing["uid"]
            body["uid"] = uid
            out = self._req("PUT", f"/api/datasources/uid/{uid}",
                            body=body, org_id=org_id, expect_status=(200,))
            if "__http_error__" in out:
                raise SystemExit(f"grafana PUT datasource failed: {out}")
            return out["datasource"]
        out = self._req("POST", "/api/datasources",
                        body=body, org_id=org_id, expect_status=(200, 201))
        if "__http_error__" in out:
            raise SystemExit(f"grafana POST datasource failed: {out}")
        return out["datasource"]


def urllib_quote(value: str) -> str:
    from urllib.parse import quote
    return quote(value, safe="")


# ----------------------------- main flow -----------------------------

def provisionar(args: argparse.Namespace) -> ProvisionResult:
    cfg_name = os.environ.get("FLASK_ENV", "development")
    cfg = config[cfg_name]

    repo = criar_tenants_repo(cfg.TENANTS_DATABASE_URL)
    bucket_name = args.bucket or f"cliente_{args.slug}"

    site, publishable, plano_cfg = _ensure_site(
        repo,
        slug=args.slug, nome=args.nome, ambiente=args.ambiente,
        dominios=args.dominio or [], plano=args.plano,
        bucket_name=bucket_name,
    )

    retencao = (plano_cfg or {}).get("retencao_dias", 30)

    influx_url = os.environ.get("INFLUXDB_URL") or cfg.INFLUXDB_URL
    influx_token = os.environ.get("INFLUXDB_TOKEN") or cfg.INFLUXDB_TOKEN
    influx_org_name = os.environ.get("INFLUXDB_ORG") or cfg.INFLUXDB_ORG
    if not (influx_url and influx_token and influx_org_name):
        raise SystemExit("erro: INFLUXDB_URL/INFLUXDB_TOKEN/INFLUXDB_ORG nao configurados")

    with InfluxDBClient(url=influx_url, token=influx_token, org=influx_org_name) as ic:
        bucket, org = _ensure_bucket(ic, org_name=influx_org_name,
                                     bucket_name=bucket_name, retention_dias=retencao)
        token = _rotate_grafana_read_token(
            ic, org_id=org.id, bucket_id=bucket.id,
            descricao=f"cliente_{args.slug}_grafana_read",
        )

    grafana_url = os.environ.get("GRAFANA_URL", "http://localhost:3001")
    gf_user = os.environ.get("GRAFANA_ADMIN_USER", "admin")
    gf_pass = os.environ.get("GRAFANA_ADMIN_PASSWORD", "admin")
    gf = GrafanaClient(grafana_url, gf_user, gf_pass)

    org_name = f"cliente_{args.slug}"
    gf_org_id = gf.get_or_create_org(org_name)
    ds_name = f"influxdb_{args.slug}"
    ds = gf.upsert_influx_datasource(
        org_id=gf_org_id, name=ds_name,
        influx_url=os.environ.get("INFLUXDB_URL_INTERNAL", influx_url),
        influx_org=influx_org_name, bucket=bucket_name, token=token.token,
    )

    return ProvisionResult(
        site_id=site.id, slug=args.slug, plano=args.plano,
        bucket_name=bucket_name, bucket_id=bucket.id, retention_dias=retencao,
        grafana_org_id=gf_org_id, grafana_org_name=org_name,
        grafana_ds_uid=ds.get("uid", ""), grafana_ds_name=ds_name,
        influx_token_id=token.id, influx_token_value=token.token,
        publishable_key=publishable,
    )


def imprimir(result: ProvisionResult, *, json_out: bool):
    if json_out:
        print(json.dumps({
            "site_id": result.site_id, "slug": result.slug, "plano": result.plano,
            "bucket_name": result.bucket_name, "bucket_id": result.bucket_id,
            "retention_dias": result.retention_dias,
            "grafana_org_id": result.grafana_org_id,
            "grafana_org_name": result.grafana_org_name,
            "grafana_ds_uid": result.grafana_ds_uid,
            "grafana_ds_name": result.grafana_ds_name,
            "influx_token_id": result.influx_token_id,
            "publishable_key": result.publishable_key,
        }, indent=2))
        return
    print("== Provisionamento concluido ==")
    print(f"  site_id        : {result.site_id}")
    print(f"  slug           : {result.slug}")
    print(f"  plano          : {result.plano}")
    print(f"  bucket_name    : {result.bucket_name}")
    print(f"  bucket_id      : {result.bucket_id}")
    print(f"  retention_dias : {result.retention_dias}")
    print(f"  grafana_org    : {result.grafana_org_name} (id={result.grafana_org_id})")
    print(f"  grafana_ds     : {result.grafana_ds_name} (uid={result.grafana_ds_uid})")
    print(f"  influx_token   : id={result.influx_token_id} (token nao reexibido)")
    if result.publishable_key:
        print(f"  publishable_key (anote, nao sera reexibida):")
        print(f"    {result.publishable_key}")


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Provisiona cliente fim-a-fim (Postgres + Influx + Grafana)")
    parser.add_argument("--slug", required=True)
    parser.add_argument("--nome", required=True)
    parser.add_argument("--ambiente", required=True,
                        choices=["development", "test", "staging", "production"])
    parser.add_argument("--dominio", action="append", help="URL raiz; pode repetir")
    parser.add_argument("--plano", default="free", choices=list(PLANO_DEFAULTS.keys()))
    parser.add_argument("--bucket", default=None,
                        help="Override do bucket (default: cliente_<slug>)")
    parser.add_argument("--json", action="store_true", help="Saida JSON")
    args = parser.parse_args(argv)

    result = provisionar(args)
    imprimir(result, json_out=args.json)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
