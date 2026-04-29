"""Blueprint `/cliente/auth` — auth humana do dashboard do cliente.

Endpoints:
  POST /login                    — body {email, senha}, set cookie, 200/401
  POST /logout                   — revoga sessao, limpa cookie, 200
  GET  /me                       — retorna {user_id, site_id, papel} ou 401
  GET  /gate                     — nginx auth_request: 200 + X-WEBAUTH-USER=<site_id> ou 401
  POST /magic-link/solicitar     — body {email}; sempre 200 {ok:true} (nao vaza)
  GET  /magic-link/verificar?t=..— 302 → /cliente/metricas + Set-Cookie ou 400

Cookie:
  - Nome:  cliente_session
  - Flags: HttpOnly, Secure (configuravel via env), SameSite=Strict
  - Path:  /
  - TTL:   vem de SessaoService.sessao_ttl_segundos

Todos os eventos sao logados em `security` (CrowdSec parseia):
  `auth_cliente_login_ok|fail|logout|gate_ok|gate_negado|magic_solicitado|magic_consumido`

Referencia: ark/docs/dashboard-cliente.md (secoes 6, 8, 9, 10).
"""

from __future__ import annotations

import logging
import os
from typing import Optional
from urllib.parse import urlencode

from flask import Blueprint, current_app, g, jsonify, make_response, redirect, request

from .clientes_users_repo import ClientesUsersRepo
from .email_sender import EmailSender, criar_sender_padrao
from .grafana_sync import GrafanaSyncService
from .sessao_service import RateLimitExcedido, SessaoService
from .tenants_repo import TenantsRepo


logger = logging.getLogger("auth.cliente")
security_logger = logging.getLogger("security")


COOKIE_NAME = "cliente_session"


cliente_auth_bp = Blueprint("cliente_auth", __name__, url_prefix="/cliente/auth")


# ---------- singletons configuraveis em runtime ----------
# Espelha o padrao de jwt_service/tenants_repo: app de teste substitui estas
# variaveis diretamente antes de registrar o blueprint.

_svc_instance: Optional[SessaoService] = None
_email_sender: Optional[EmailSender] = None
_grafana_sync: Optional[GrafanaSyncService] = None
_tenants_repo: Optional[TenantsRepo] = None


def configurar(
    svc: SessaoService,
    email_sender: Optional[EmailSender] = None,
    grafana_sync: Optional[GrafanaSyncService] = None,
    tenants_repo: Optional[TenantsRepo] = None,
) -> None:
    """Configura singletons. Chamar uma vez no boot.

    `grafana_sync` e `tenants_repo` sao opcionais; quando ambos estao
    presentes, /gate sincroniza membership da org Grafana do cliente
    (sec 13 do dashboard-cliente.md). Sem eles, /gate so valida cookie.
    """
    global _svc_instance, _email_sender, _grafana_sync, _tenants_repo
    _svc_instance = svc
    _email_sender = email_sender or criar_sender_padrao()
    _grafana_sync = grafana_sync
    _tenants_repo = tenants_repo


def _obter_svc() -> SessaoService:
    if _svc_instance is None:
        raise RuntimeError("cliente_auth nao configurado — chamar configurar() antes do app.run")
    return _svc_instance


def _obter_email_sender() -> EmailSender:
    global _email_sender
    if _email_sender is None:
        _email_sender = criar_sender_padrao()
    return _email_sender


def _ip_cliente() -> Optional[str]:
    xff = request.headers.get("X-Forwarded-For")
    if xff:
        return xff.split(",")[0].strip()
    return request.environ.get("REMOTE_ADDR")


def _set_cookie(response, cookie_plaintext: str, *, max_age: int) -> None:
    secure = os.environ.get("COOKIE_SECURE", "true").lower() != "false"
    response.set_cookie(
        COOKIE_NAME, cookie_plaintext,
        max_age=max_age, httponly=True, secure=secure, samesite="Strict", path="/",
    )


def _clear_cookie(response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/")


def _erro(code: str, message: str, status: int):
    return jsonify({"status": "error", "code": code, "message": message}), status


# ---------- endpoints ----------


@cliente_auth_bp.route("/login", methods=["POST"])
def login():
    body = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip()
    senha = body.get("senha") or ""
    if not email or not senha:
        return _erro("CREDENCIAIS_INVALIDAS", "email e senha obrigatorios", 400)

    svc = _obter_svc()
    user = svc.autenticar_por_senha(email, senha)
    ip = _ip_cliente()
    ua = request.headers.get("User-Agent")

    if user is None:
        security_logger.info(
            "evento=auth_cliente_login_fail email=%s ip=%s ua=%r",
            email, ip, ua,
        )
        return _erro("CREDENCIAIS_INVALIDAS", "email ou senha incorretos", 401)

    criada = svc.criar_sessao(user.id, ip=ip, user_agent=ua)
    security_logger.info(
        "evento=auth_cliente_login_ok site_id=%s user_id=%s ip=%s",
        user.site_id, user.id, ip,
    )

    resp = make_response(jsonify({
        "status": "success",
        "user": {"id": user.id, "site_id": user.site_id, "email": user.email, "papel": user.papel},
    }))
    _set_cookie(resp, criada.cookie_plaintext, max_age=svc._sessao_ttl)  # noqa: SLF001
    return resp


@cliente_auth_bp.route("/logout", methods=["POST"])
def logout():
    cookie = request.cookies.get(COOKIE_NAME, "")
    if cookie:
        _obter_svc().revogar_sessao(cookie)
        security_logger.info("evento=auth_cliente_logout ip=%s", _ip_cliente())
    resp = make_response(jsonify({"status": "success"}))
    _clear_cookie(resp)
    return resp


@cliente_auth_bp.route("/me", methods=["GET"])
def me():
    cookie = request.cookies.get(COOKIE_NAME, "")
    user = _obter_svc().validar_cookie(cookie)
    if user is None:
        return _erro("NAO_AUTENTICADO", "sessao ausente ou invalida", 401)
    return jsonify({
        "user_id": user.id, "site_id": user.site_id,
        "email": user.email, "papel": user.papel,
    })


@cliente_auth_bp.route("/gate", methods=["GET"])
def gate():
    """Endpoint do nginx `auth_request`. Nao retorna body util — so codigo + headers.

    Sucesso: 200 + header `X-WEBAUTH-USER: <site_id>` que o nginx propaga
    pro Grafana (auth.proxy confia nele e cria/mapeia o user).
    Falha:   401. Nginx aborta a requisicao.

    Sprint 2 — sincroniza membership na org `cliente_<slug>` em best-effort
    (cache TTL 1h). Falha de sync NAO derruba o /gate; cookie ainda eh valido.
    """
    cookie = request.cookies.get(COOKIE_NAME, "")
    user = _obter_svc().validar_cookie(cookie)
    if user is None:
        security_logger.info("evento=auth_cliente_gate_negado ip=%s", _ip_cliente())
        return ("", 401)
    security_logger.info(
        "evento=auth_cliente_gate_ok site_id=%s user_id=%s", user.site_id, user.id,
    )
    _sincronizar_grafana_org(user.site_id)
    resp = make_response("", 200)
    resp.headers["X-WEBAUTH-USER"] = user.site_id
    resp.headers["X-WEBAUTH-PAPEL"] = user.papel
    return resp


def _sincronizar_grafana_org(site_id: str) -> None:
    """Best-effort: garante user na org cliente_<slug>. No-op se nao configurado."""
    if _grafana_sync is None or _tenants_repo is None:
        return
    try:
        site = _tenants_repo.obter_site(site_id)
    except Exception as erro:
        logger.warning("evento=grafana_sync_lookup_falhou site_id=%s motivo=%s", site_id, erro)
        return
    if site is None or not site.slug:
        return
    org_name = f"cliente_{site.slug}"
    _grafana_sync.garantir_membership(login=site_id, org_name=org_name)


@cliente_auth_bp.route("/magic-link/solicitar", methods=["POST"])
def solicitar_magic_link():
    body = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip()
    if not email:
        # mesmo para email vazio retornamos 200 pra nao dar pista de validacao
        return jsonify({"status": "success", "ok": True})

    ip = _ip_cliente()
    svc = _obter_svc()
    try:
        criado = svc.solicitar_magic_link(email, ip=ip)
    except RateLimitExcedido as e:
        # Nao conta como 200 porque isto e abuso observavel (nao vaza quem usa).
        security_logger.info("evento=auth_cliente_magic_rate_limit ip=%s motivo=%s", ip, e)
        return _erro("RATE_LIMIT_EXCEDIDO", "muitas solicitacoes — tente novamente em 15min", 429)

    if criado is None:
        # email nao existe — resposta 200 identica (anti-enumeracao)
        security_logger.info("evento=auth_cliente_magic_solicitado_fantasma ip=%s", ip)
        return jsonify({"status": "success", "ok": True})

    link = _construir_link_verificar(criado.token_plaintext)
    _obter_email_sender().enviar(
        destinatario=email,
        assunto="Seu link de acesso ao dashboard",
        corpo_texto=(
            "Clique no link abaixo para acessar seu dashboard de metricas. "
            "Ele expira em 15 minutos e so pode ser usado uma vez.\n\n"
            f"{link}\n\n"
            "Se voce nao solicitou este e-mail, ignore-o."
        ),
    )
    security_logger.info(
        "evento=auth_cliente_magic_solicitado user_id=%s ip=%s",
        criado.magic_link.user_id, ip,
    )
    return jsonify({"status": "success", "ok": True})


@cliente_auth_bp.route("/magic-link/verificar", methods=["GET"])
def verificar_magic_link():
    token = request.args.get("t", "")
    if not token:
        return _erro("TOKEN_AUSENTE", "parametro t obrigatorio", 400)

    svc = _obter_svc()
    ip = _ip_cliente()
    ua = request.headers.get("User-Agent")
    sessao = svc.consumir_magic_link(token, ip=ip, user_agent=ua)
    if sessao is None:
        security_logger.info("evento=auth_cliente_magic_invalido ip=%s", ip)
        return _erro("TOKEN_INVALIDO", "link expirado ou ja utilizado", 400)

    destino = os.environ.get("DASHBOARD_REDIRECT", "/cliente/metricas")
    resp = make_response(redirect(destino, code=302))
    _set_cookie(resp, sessao.cookie_plaintext, max_age=svc._sessao_ttl)  # noqa: SLF001
    security_logger.info(
        "evento=auth_cliente_magic_consumido user_id=%s ip=%s",
        sessao.sessao.user_id, ip,
    )
    return resp


def _construir_link_verificar(token: str) -> str:
    base = os.environ.get("DASHBOARD_BASE_URL", "https://dsplayground.com.br")
    return f"{base.rstrip('/')}/cliente/auth/magic-link/verificar?{urlencode({'t': token})}"


__all__ = ["cliente_auth_bp", "configurar", "COOKIE_NAME"]
