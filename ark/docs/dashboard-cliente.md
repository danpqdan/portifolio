# Dashboard do Cliente — Design Doc

> Status: **MVP implementado em `dev` (backend + nginx + grafana)** — validacao
> em teste-ambiente-a/b e frontend `/cliente/login` ainda pendentes.
> Autor: Daniel Santos + Claude (sessao 2026-04-24, impl 2026-04-25).
> Escopo: como expor metricas do SDK para clientes do `dsplayground` sem
> que eles precisem aprender Grafana, sem expor dados entre tenants, e
> sem reutilizar credencial publica como credencial de leitura.

## Estado de implementacao (2026-04-27)

**Implementado na branch `dev`:**

| Peca | Local | Status |
|------|-------|--------|
| Schema Postgres + SQLite | `backend/auth/schema_dashboard{_postgres,}.sql` | ✅ |
| Repo (CRUD + indexes) | `backend/auth/clientes_users_repo.py` | ✅ SQLite + Postgres |
| Service (sessao + magic-link + rate-limit) | `backend/auth/sessao_service.py` | ✅ |
| Email sender (stdout + Resend) | `backend/auth/email_sender.py` | ✅ |
| Flask blueprint `/cliente/auth` | `backend/auth/cliente_routes.py` | ✅ |
| Registro no app.py | `backend/app.py` | ✅ |
| Nginx `/cliente/metricas` + `auth_request` | `ark/ansible/roles/nginx/templates/portifolio.conf.j2` + espelho | ✅ |
| Grafana `auth.proxy` + subpath | `ark/monitoring/docker-compose.monitoring.yml` | ✅ |
| Frontend `/cliente/login` (mobile-first) | `frontend/src/pages/ClienteLogin.jsx` + `ClienteMetricas.jsx` | ✅ |
| CLI admin de users | `backend/scripts/dashboard_user_admin.py` | ✅ |
| Dashboard analytics-overview corrigido (4 paineis) | `ark/monitoring/grafana/dashboards/analytics-overview.json` | ✅ |
| Anti-abuse com TTL + skip de IPs privados | `backend/app.py` | ✅ |
| Reaper de sessoes Socket.IO zombies | `backend/app.py` | ✅ |
| Schema `sites.bucket_name` + migracao idempotente | `backend/auth/schema*.sql` + `tenants_repo.py` | ✅ sprint 1 |
| CLI `provisionar_cliente.py` (Postgres + Influx + Grafana) | `backend/scripts/provisionar_cliente.py` | ✅ sprint 1 |
| `SitesCache` (TTL 5min) + roteamento de ingest por bucket | `backend/auth/sites_cache.py` + `ingestao/servico_ingestao.py` | ✅ sprint 1 |
| Validador exige `app_id` e `ambiente` no envelope | `backend/ingestao/validador.py` | ✅ sprint 1 |
| `ip_address` e `metric_id` viraram fields (anti-cardinalidade) | `backend/influxdb_service.py` | ✅ sprint 1 |
| Testes (45 + 7 endpoint + 13 bucket-per-cliente) | `backend/test_*.py` | ✅ |

**Hardening Grafana Viewer (sprint 1 extra, 2026-04-27):** `GF_USERS_VIEWERS_CAN_EDIT=false`, `GF_EXPLORE_ENABLED=false`, `GF_SNAPSHOTS_EXTERNAL_ENABLED=false` em `ark/monitoring/docker-compose.monitoring.yml`. Validado: `curl -H 'X-WEBAUTH-USER:<id>' /api/dashboards/home` retorna `canEdit:false canSave:false canAdmin:false`.

**Proposto — sprint 2:**

- **Quota enforcement**: backend rejeita evento com `analytics_error code=QUOTA_EXCEDIDA` quando `consumo_diario.eventos > quotas.eventos_por_dia`. Hoje so incrementa, nao rejeita.
- **Cardinalidade enforcement**: contador `(bucket, tag) -> set(values)` em memoria + Postgres; rejeita ponto + log `[SECURITY] cardinalidade_excedida` quando passa do limite do plano.
- Email diario com counts agregados de rejeicoes (1x/dia, nao 1x/evento).
- Email alert pro cliente em 80% e 95% da cardinalidade do plano.
- Tags derivadas server-side: `device_type` (do User-Agent), `pais` (GeoIP do IP), `referrer_dominio` (do header Referer).
- **Org-per-cliente fim-a-fim no Grafana**: o `provisionar_cliente.py` ja cria a org, mas usuarios do `auth.proxy` continuam caindo na "Main Org". Falta logica no `/gate` (ou script de membership) que adiciona o user a org certa idempotente via Grafana API.
- 4 dashboards out-of-the-box provisionados na org do cliente: Web Vitals, Engajamento, Funil, Event Explorer.
- Container `analytics-archiver`: cron diario que exporta `[now-retencao-1d, now-retencao]` em line protocol comprimido pra `/var/backups/analytics/<slug>/YYYY-MM-DD.lp.gz`.
- Endpoint `GET /cliente/exportar?inicio=...&fim=...` com signed URL (nginx X-Accel-Redirect).
- Validacao end-to-end em `ark/teste-ambiente-a` (Docker) e `teste-ambiente-b` (Vagrant).

**Pendente — proximas sprints (v2/v3):**

- 2FA TOTP, white-label CSS, integracoes server-to-server REST.
- `RESEND_API_KEY` em prod via Ansible Vault (dev cai pro stdout sender).
- Migracao de backup local para S3 (Backblaze/Wasabi/R2) quando volume passar de ~50 GB ou primeiro cliente pago entrar.
- Custom dashboards salvos pelo cliente (camada 3 da §2).
- Em escala >500 clientes, migrar `auth.proxy` -> `auth.jwt` com claims customizados.

**Nota de schema:** `REFERENCES clientes(id)` no desenho inicial virou `REFERENCES sites(id)` na implementacao (alinhado com a tabela multi-tenant existente, `sites`, que ja e o conceito de "cliente"). Campo em `clientes_users` e `site_id`.

---

## 1. Problema

O SDK ja coleta eventos arbitrarios por cliente em InfluxDB (medidas
padrao — Web Vitals, page view, scroll, hover, exposicao, toque,
clique, mouse move, page exit — alem de `evento_custom` livre). Falta
**entregar essas metricas pro proprio cliente** com:

- UX limpa (referencia: New Relic — telas pre-prontas por intencao).
- Isolamento entre tenants (cliente A nao ve dado de cliente B).
- Suporte a **eventos arbitrarios** (cliente pode definir qualquer
  `evento` via SDK — nao da pra ter so N dashboards fixos).
- Sem reutilizar token do SDK (publico, embedded em browser) como
  credencial de leitura.

## 2. Arquitetura — 2 camadas

### Camada 1 — Dashboards prontos (out-of-the-box)

Para o que **todo cliente** gera, JSON versionado em
`ark/monitoring/dashboards/`:

- **Web Vitals** — LCP, FID, CLS, INP por pagina e dispositivo.
- **Page Views & Sessoes** — volume, paginas mais vistas, retencao.
- **Engajamento** — clique, scroll, hover, exposicao.
- **Saidas** — page exit, tempo de sessao, bounce.

Hand-tuned, polidos. `cliente_id` injetado via header de auth (ver §3).

### Camada 2 — Event Explorer (1 dashboard generico)

Um dashboard com variaveis dinamicas:

- `$evento` — populado via Flux `schema.measurements()` (ou tag
  values), filtrado por `cliente_id`.
- `$breakdown` — lista as tags do evento selecionado.

Cliente escolhe `evento=botao_clicado` + `breakdown=pagina` e ve
timeseries + top values + amostras recentes — **sem mexer em Flux**.
Equivalente ao "Data Explorer" do New Relic.

### Camada 3 — Custom dashboards (v2)

Cliente salva combinacoes uteis do Explorer como dashboard proprio.
Fora do MVP.

## 3. Auth — Por que NAO usar o token SDK

**Falha critica:** o token do SDK e publico. Esta no JS bundle do
site do cliente. Qualquer end-user inspeciona e pega. Se ele
desbloqueasse leitura de dashboards, o end-user da loja-do-cliente
veria as metricas da loja-do-cliente.

Padrao da industria (NR, Datadog, Segment): **separar credenciais**.

| Credencial         | Onde vive            | Permissao             |
|--------------------|----------------------|-----------------------|
| Ingest token (SDK) | JS do site do cliente | `scope: ["ingest"]`  |
| Dashboard session  | Cookie HttpOnly       | `scope: ["dashboard"]`|

## 4. Fluxo de trafego

```
Cliente → Cloudflare → Nginx host → /cliente/metricas/*
                            ↓
              Flask /cliente/auth/gate
              (valida cookie de sessao → Postgres)
                            ↓ (200 + X-WEBAUTH-USER: <cliente_id>)
              proxy_pass → Grafana (127.0.0.1:3001)
                            ↓
              Grafana auth.proxy confia no header
                            ↓
              InfluxDB datasource filtra por v.cliente_id
                            ↓
              Dashboard renderizado
```

Guard rails:

- Grafana segue bindando em `127.0.0.1:3001`. Sem ingress externo.
- `firewalld` bloqueia 3001 mesmo se loopback exposto por engano.
- Audit do Flask em `security.log` (CrowdSec ja le).

## 5. Schema Postgres

```sql
-- usuarios humanos do cliente que acessam dashboard
CREATE TABLE clientes_users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id   UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  email        CITEXT UNIQUE NOT NULL,
  senha_hash   TEXT,                                  -- null se magic-link only
  papel        TEXT NOT NULL DEFAULT 'viewer',        -- admin | viewer
  ativo        BOOLEAN NOT NULL DEFAULT true,
  ultimo_login TIMESTAMPTZ,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_clientes_users_cliente ON clientes_users(cliente_id);

-- sessoes ativas (cookie sha256-hash)
CREATE TABLE clientes_users_sessoes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES clientes_users(id) ON DELETE CASCADE,
  token_hash  TEXT UNIQUE NOT NULL,                   -- sha256 do cookie, nunca plaintext
  ip          INET,
  user_agent  TEXT,
  expira_em   TIMESTAMPTZ NOT NULL,
  revogada_em TIMESTAMPTZ,
  criada_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessoes_token ON clientes_users_sessoes(token_hash)
  WHERE revogada_em IS NULL;
CREATE INDEX idx_sessoes_user  ON clientes_users_sessoes(user_id);

-- magic links (login passwordless)
CREATE TABLE clientes_magic_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES clientes_users(id) ON DELETE CASCADE,
  token_hash      TEXT UNIQUE NOT NULL,               -- sha256 do token enviado por email
  expira_em       TIMESTAMPTZ NOT NULL,               -- 15 min
  consumido_em    TIMESTAMPTZ,
  ip_solicitacao  INET,
  criada_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## 6. Endpoints (Flask blueprint `/cliente/auth`)

| Metodo | Rota                          | Payload          | Resposta                                            |
|--------|-------------------------------|------------------|-----------------------------------------------------|
| POST   | `/magic-link/solicitar`       | `{email}`        | sempre `200 {ok:true}` (nao vaza emails existentes) |
| GET    | `/magic-link/verificar?t=...` | —                | 302 → `/cliente/metricas` + Set-Cookie              |
| POST   | `/login`                      | `{email,senha}`  | 200 + cookie OR 401                                 |
| POST   | `/logout`                     | —                | revoga sessao, limpa cookie                         |
| GET    | `/me`                         | —                | `{user_id, cliente_id, papel}` ou 401               |
| GET    | `/gate`                       | —                | 200 + `X-WEBAUTH-USER: <cliente_id>` ou 401         |

`/gate` e o endpoint do `auth_request` do nginx.

## 7. Cookie de sessao

- Nome: `cliente_session`
- Valor: `base64url(random_bytes(32))` (256-bit, gerado com
  `secrets.token_urlsafe`).
- Server guarda apenas `sha256(token)` na tabela `sessoes`.
- Flags: `HttpOnly; Secure; SameSite=Strict; Path=/`.
- `Max-Age`: 7 dias rolando (renovado a cada `/gate` ok).
- `Domain`: `dsplayground.com.br`.

## 8. Fluxo magic-link

1. Cliente abre `/cliente/login`, digita email, submete.
2. POST `/magic-link/solicitar` → rate-limit (3/email/15min,
   10/IP/15min) → gera token 32B → salva
   `sha256(token) + expira_em (now+15min)` → envia email com link
   `https://dsplayground.com.br/cliente/auth/verificar?t=<token>`.
3. Cliente clica → GET `/verificar?t=...` → valida (existe, nao
   expirou, nao foi consumido) → marca `consumido_em = now()` →
   cria sessao → Set-Cookie → 302 → `/cliente/metricas`.
4. Cada request a `/cliente/metricas/*` passa por
   `auth_request /cliente/auth/gate` → valida cookie → injeta
   header `X-WEBAUTH-USER: <cliente_id>`.

## 9. Rate-limit & lockout

- 5 logins falhos por (email + IP) em 15min → 30min lockout.
- 3 magic-links solicitados por email em 15min.
- 10 magic-links solicitados por IP em 15min.
- Tudo logado em `security.log` → CrowdSec parseia → bane IP abusivo.

## 10. Audit events (`security.log`)

Formato `evento=<x> cliente_id=<id> user_id=<id> ip=<ip> ua=<ua>`:

- `auth_login_ok` / `auth_login_fail`
- `auth_magic_solicitado` / `auth_magic_consumido` / `auth_magic_expirado`
- `auth_session_criada` / `auth_session_revogada` / `auth_session_expirada`
- `auth_gate_ok` / `auth_gate_negado`

## 11. Provisionamento de novo cliente

1. Cliente SDK e criado (fluxo existente — Postgres `clientes`).
2. Trigger cria 1 `clientes_users` com `papel='admin'` e email do
   contato.
3. Backend dispara magic-link "bem-vindo, clique pra acessar seu
   dashboard". Sem fricção de senha inicial.
4. Admin pode adicionar mais users via `/cliente/users`
   (futuro v2).

## 12. E-mail — lacuna do stack

Stack atual nao tem SMTP/MTA. Opcoes:

| Provider  | Free tier        | Notas                        |
|-----------|------------------|------------------------------|
| Resend    | 100/dia, 3k/mes  | API moderna, recomendado MVP |
| SES       | $0.10/1k         | Mais barato em escala        |
| Postmark  | 100/mes          | Entregabilidade premium      |

Adicionar `RESEND_API_KEY` em `backend/.env` via Ansible Vault.

## 13. Multi-tenant data scoping no Grafana

### Grafana side

- `grafana.ini`:
  ```
  [auth.proxy]
  enabled         = true
  header_name     = X-WEBAUTH-USER
  header_property = username
  auto_sign_up    = true
  sync_ttl        = 60
  ```
- Cada `cliente_id` vira user Grafana com role `Viewer`.

### Datasource InfluxDB

- Header `X-Cliente-ID` propagado para o datasource (Grafana suporta
  via "Custom HTTP Headers" no datasource).
- Variavel Grafana `cliente_id` do tipo `Constant`, populada por
  `${__user.login}`.

### Flux nas queries

Toda query comeca com:

```flux
from(bucket: "metricas")
  |> range(start: v.timeRangeStart, stop: v.timeRangeStop)
  |> filter(fn: (r) => r.cliente_id == "${cliente_id}")
```

Para reforcar (caso usuario duplique dashboard e remova o filter):
**datasource secundario com query header forwarding** que injeta o
filtro server-side antes de bater no Influx.

## 14. Risco residual

- Senha de dashboard reusada e vazada → atacante entra. Mitigacao:
  2FA TOTP no v2 + alerta de novo IP/UA via CrowdSec.
- Magic-link interceptado em e-mail comprometido → atacante entra.
  Mitigacao: link expira 15min + 1 uso unico + audit alerta.
- `cliente_id` 1:1 com user Grafana **explode em escala alta**
  (>500 clientes). Trocar para `auth.jwt` com claims customizados —
  mais complexo, vale so pra esse volume.
- Cardinalidade alta em InfluxDB se cliente colocar `user_id` como
  tag → cluster derrete. **Documentar no SDK**: tags = categorias
  finitas, fields = valores. Quota de series unicas por cliente em
  Postgres + reject no ingest.

## 15. Roadmap

- **MVP (~3-4 dias):** schema + endpoints `/login`, `/logout`,
  `/me`, `/gate` + magic-link + Resend + nginx `auth_request` +
  `auth.proxy` no Grafana + 1 dashboard provisionado (Web Vitals)
  como prova de conceito.
- **v1 (~1-2 sprints):** 4 dashboards out-of-the-box + Event
  Explorer + onboarding magic-link automatico no provisionamento.
- **v2:** 2FA TOTP, custom dashboards salvos pelo cliente, papel
  admin gerenciando users, dashboards programaticos via API.
- **v3 (se >500 clientes):** migrar pra `auth.jwt`, considerar UI
  React custom no portfolio para 2-3 telas mais usadas (resto
  continua Grafana embedded).

## 16. Decisoes em aberto

- Comecar pela **tabela + `/me` + `/gate`** (testavel com cookie
  manual em Postman, ~1 dia) ou **fluxo completo magic-link**
  (~3-4 dias)?
- Resend ou SES?
- Embedar Grafana via iframe em `/cliente/metricas` ou redirecionar
  pro subdominio `grafana.dsplayground.com.br` autenticado?

## 17. Referencias

- Padrao "ingest key vs read key": New Relic, Datadog, Segment.
- Grafana auth.proxy:
  https://grafana.com/docs/grafana/latest/setup-grafana/configure-security/configure-authentication/auth-proxy/
- nginx `auth_request`:
  http://nginx.org/en/docs/http/ngx_http_auth_request_module.html
- OWASP session management cheat sheet (cookie flags, lifetime).

---

## 18. Planos e tiers (PostHog-style)

Decidido em 2026-04-26 apos benchmark com PostHog, Mixpanel, Amplitude, Plausible, Datadog RUM. Escolha: cobranca por **eventos/mes** + **retencao** + **cardinalidade**, com free generoso em volume mas curto em retencao. Coluna "backup" descrita em sec. 21.

| Plano | Eventos/mes | Retencao | Sessoes/dia | Cardinalidade max | Sites por user | Backup |
|---|---|---|---|---|---|---|
| **free** | 10k | 7 dias | 50 | 1k tag values | 1 | ❌ trial puro |
| **pequeno** | 100k | 30 dias | 500 | 5k tag values | 3 | semanal, retencao 1m |
| **medio** | 1M | 90 dias | 5k | 50k tag values | 10 | diario, retencao 6m |
| **grande** | 10M | 365 dias | ilimitado | 500k tag values | ilimitado | diario + arquivo 12m |

**Enforce server-side**: backend valida cada evento contra a quota do plano (`sites.plano` -> `quotas.eventos_por_dia`). Se passou: `analytics_error code=QUOTA_EXCEDIDA` + email diario com counts agregados de rejeicoes (1x/dia, nao 1x/evento).

**Trial**: `free` cobre exatamente o ciclo "instalei o SDK -> deixo rodar 1 dia -> analiso o dashboard". Apos os 7d, dado some — ate o cliente fazer upgrade.

**Upgrade**: Usuario cria `clientes_users` no plano free, dados ficam ligados ao mesmo `site_id`. Quando faz upgrade, o `sites.plano` muda; bucket existente ganha nova retencao (Influx aceita `update bucket --retention=...` em runtime, mas dados ja-expirados nao voltam).

**Cardinalidade alta = morte do InfluxDB OSS**: cliente que mete `user_id` como tag detona o bucket. Por isso a sec. 19 define whitelist + rejeicao server-side.

## 19. Bucket-per-cliente

Decisao: 1 bucket InfluxDB por `site_id`, nome `cliente_<slug>`. Trade-offs documentados:

| Opcao | Pro | Contra |
|---|---|---|
| **Bucket-per-cliente (escolhido)** | Hard isolation, easy revoke (drop bucket), retention per plan | Overhead operacional cresce linear, tokens proliferam |
| Single bucket + tag site_id | Operacao simples | Filtro depende de disciplina, vaza com bug |
| Bucket-per-plano + tag | Hibrido | Mistura free + pago no mesmo bucket complica |

**Esquema do bucket:**

| Measurement | Fields | Tags whitelist | Tags proibidas |
|---|---|---|---|
| `page_analytics` | cliques, hovers, mouse_moves, toques, scrolls, exposicoes, custom_events, permanencia_segundos, visualizacoes, user_agent | `app_id`, `ambiente`, `page_type`, `device_type`, `pais`, `referrer_dominio` | `user_id`, `session_id`*, `email`, `request_id`, `url_completa` |
| `web_vitals` | valor (numerico), user_agent | `app_id`, `ambiente`, `page_type`, `nome` (LCP/CLS/INP), `rating`, `device_type` | mesmas |
| `custom_events` | ocorrencias (count), <props_primitivas como fields> | `app_id`, `ambiente`, `page_type`, `nome` (do evento) | mesmas |

\* `session_id` e tag em `page_analytics` hoje porque a query de "sessoes ativas" precisa dele. Em produto comercial, considerar mover pra field — sessoes geram cardinalidade ilimitada.

**Routing do ingest (implementado em sprint 1):**

```python
# backend/auth/sites_cache.py + backend/ingestao/servico_ingestao.py
bucket = sites_cache.obter_bucket(site_id)  # TTL 5min, cache-aside Postgres
if bucket is None:
    # site sem bucket cadastrado -> log evento=site_sem_bucket + cai no bucket default
    pass
influxdb_service.write_temporal_metrics_async(metric, bucket=bucket)
```

O `SitesCache` recebe o `TenantsRepo` e expoe `obter_bucket(site_id)` + `invalidar(site_id)`. Apos provisionar um cliente novo, chamar `invalidar` libera a entrada antes do TTL expirar (relevante para hot-deploys).

## 20. Tag enforcement

Backend rejeita pontos no momento do ingest (NAO no momento da query — query lenta vs ingest rapido). Regras:

**Tags obrigatorias** (rejeita ponto se faltar):
- `app_id` (vem do payload, ja validado contra `sites.app_id`)
- `ambiente` (vem do payload)
- `page_type` (vem do payload — eventos sem pagina sao invalidos por design)

**Tags whitelist** (so essas sao aceitas como tag; resto vira field):
- `device_type` (derivado do `user_agent` server-side)
- `pais` (derivado do IP via GeoIP, opcional — ainda sem implementacao)
- `referrer_dominio` (derivado do `Referer` header — so o dominio, nao path)
- `nome` (so em `custom_events` e `web_vitals`)
- `rating` (so em `web_vitals`: good/needs-improvement/poor)

**Cardinalidade limit por bucket** (configuravel por plano):
- Backend mantem contador `(bucket, tag) -> set(values)` em memoria + Postgres
- Se `len(set) > limite_plano`: rejeita evento + log `[SECURITY] cardinalidade_excedida bucket=X tag=Y`
- Email alert pro cliente em 80% e 95% da cardinalidade

**Eventos rejeitados** continuam contabilizados pra quota (se nao, abriria buraco — atacante manda 1B eventos invalidos sem custo).

## 21. Backup pre-wipe

InfluxDB OSS nao exporta automaticamente dados que vao expirar. Sidecar dedicado.

**Container `analytics-archiver`** (novo, no compose):

```yaml
analytics-archiver:
  image: portifolio-archiver
  build: ./backend/archiver
  environment:
    INFLUXDB_URL: http://influxdb:8086
    INFLUXDB_TOKEN: ${INFLUXDB_ADMIN_TOKEN}
    BACKUP_PATH: /var/backups/analytics
  volumes:
    - analytics_backups:/var/backups/analytics
  # cron interno: 03:00 UTC diario
```

**Algoritmo:**

```
para cada site com plano != free:
  retencao = sites.retention_days  (7/30/90/365)
  janela_inicio = now() - retencao - 1 dia
  janela_fim    = now() - retencao
  exportar dados em [janela_inicio, janela_fim] do bucket cliente_<slug>
  formato: line protocol comprimido (.lp.gz)
  destino: /var/backups/analytics/<site_slug>/YYYY-MM-DD.lp.gz
  retencao do backup: 1m/6m/12m conforme tier
```

**Endpoint pro cliente baixar:**

```
GET /cliente/exportar?inicio=YYYY-MM-DD&fim=YYYY-MM-DD
  -> 302 + signed URL local (filesystem -> nginx X-Accel-Redirect)
```

**Quando migrar pra S3** (tradeoff documentado):
- Local na VPS hoje: gratuito, simples, mas se VPS morre os backups vao junto.
- S3-compatible (Backblaze B2 ~US$5/TB, Wasabi, Cloudflare R2): durabilidade 11-9s, custo baixo. Migrar quando o volume de backup local passar de ~50 GB ou quando primeiro cliente pago entrar.

**Free tier nao tem backup** — quando dado expira em 7d, sumiu mesmo. Documentar **explicitamente** no signup.

## 22. Recovery procedure (runbook)

**Cenarios e procedimentos:**

### A. VPS comprometida — restaurar do backup completo

```bash
# Pre-requisitos: backup atualizado dos 3 volumes Docker (postgres_data,
# influxdb_data, grafana_data) + clone fresco do repo na nova VPS.

# 1. Restaurar volumes
docker volume create portifolio_postgres_data
docker run --rm -v portifolio_postgres_data:/dst -v /backup:/src alpine \
  sh -c 'cd /dst && tar xzf /src/postgres_data.tar.gz'
# repetir para influxdb_data, grafana_data

# 2. Subir stack
cd /opt/portifolio && docker compose up -d
make -f ark/Makefile monitoring-up

# 3. Validar: cada bucket Influx tem dados, Grafana tem datasources
# com tokens validos, sites tem bucket_name preenchido em Postgres.
```

### B. `grafana_data` perdido isoladamente

Cenario onde so o volume do Grafana corrompeu. Tokens InfluxDB que estavam la **nao estao em mais nenhum lugar** (decisao da sec. 14: nao persistir em Postgres por simplicidade).

```bash
# 1. Pra cada site provisionado, revogar tokens antigos do Influx:
#    (lista todos os tokens com "InfluxDB" no description e revoga)
docker exec portifolio-influxdb influx auth list \
  --json | jq -r '.[] | select(.description | contains("cliente_")) | .id' \
  | xargs -I{} docker exec portifolio-influxdb influx auth delete --id {}

# 2. Re-provisionar tudo (script idempotente):
backend/scripts/provisionar_cliente.py --recovery --all
# pra cada site:
#   - cria novo read-token escopado ao bucket existente
#   - recria org no Grafana
#   - recria datasource com novo token
#   - importa dashboards templates
```

### C. `postgres_data` perdido

Os tokens do Grafana continuam validos (datasources tem token plaintext em secureJsonData encriptado). Mas perdeu `clientes_users`, `sites`, etc.

```bash
# 1. Restaurar do pg_dump diario (ver setup de backup do Postgres)
# 2. Conferir consistencia: cada bucket no Influx deve ter site
#    correspondente em Postgres com bucket_name == nome do bucket.
# 3. Magic-links pendentes podem ter sido perdidos — clientes precisam
#    solicitar novos via /cliente/login.
```

### D. `influxdb_data` perdido

**Catastrofe maxima**: dados de todos os clientes vao embora.

```bash
# 1. Restaurar do snapshot mais recente (estrategia depende do setup
#    de backup do Influx — pg_dump-style: influx backup ... ).
# 2. Tokens vinculados a buckets que sumiram precisam ser revogados.
#    Recomendacao: revogar todos e recriar via provisionar_cliente.py.
# 3. Notificar clientes do gap de dados (timestamps faltantes).
```

### E. Token de cliente comprometido (ex: vazamento)

```bash
# 1. Revogar token no Influx
docker exec portifolio-influxdb influx auth delete --id <token_id>
# 2. Gerar novo + atualizar datasource Grafana via API
backend/scripts/provisionar_cliente.py --rotate-token --site <slug>
# 3. Auditoria: pesquisar `evento=` em security.log buscando uso suspeito.
```

**Importante**: testar os 5 cenarios em ambiente B (Vagrant) antes de virar a chave comercial. Documentar tempos medios em SLO interno.
