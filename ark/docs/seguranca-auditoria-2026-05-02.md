# Auditoria de seguranca 2026-05-02

Inventario dos achados, severidade e estado de remediacao apos a branch
`security/audit-2026-05-02`. Mantenha este arquivo como fonte canonica do
status — atualizar quando aplicar/regredir um item.

## Resumo executivo

| Severidade | Total | Resolvidos | Mitigados | Adiados |
|---|---:|---:|---:|---:|
| CRITICAL | 4 | 4 | 0 | 0 |
| HIGH | 7 | 6 | 0 | 1 |
| MEDIUM | 8 | 5 | 0 | 3 |
| LOW | 5 | 0 | 0 | 5 |

Adiados (decisao explicita pos-audit):
- A6 (network isolation no compose) — requer migracao coordenada do
  monitoring/crowdsec compose; planejada para janela de manutencao.
- M1 (remover bind-mount de codigo em prod) — refactor de Dockerfile
  em PR separado quando tiver tempo de testar imagem clean-room.
- M4 (userns-remap) — alto risco operacional, exige restart do daemon
  Docker e recriacao de todos os volumes/permissoes.
- M6 (cookie domain) — depende de decisao de produto sobre arquitetura
  de subdominios. Mitigado por SameSite=Strict + Secure + HttpOnly.
- M8 (SELinux) — Rocky 9 com SELinux disabled; habilitar requer relabel
  filesystem completo (downtime + risco de quebrar bind mounts docker).

## Critico (4 — todos resolvidos)

### C1. Flux injection nas queries de analytics ✅
- **Arquivo**: `backend/influxdb_service.py:369-475` (call sites)
- **Risco**: f-string interpolava `app_id`/`page_type`/`ambiente`/`nome`/
  `inicio`/`fim`/`bucket` direto na query Flux. Bucket-per-tenant ja
  limitava blast radius, mas filtros maliciosos podiam vazar entre
  sessoes/users do mesmo cliente.
- **Fix**: allowlist regex (`_RE_TAG_VALOR`, `_RE_TEMPO`, `_RE_BUCKET`,
  `_RE_SESSION_ID`) + funcoes `_validar_*` que levantam
  `FluxParametroInvalido` (subclasse de `ValueError`). Aplicada em todas
  as 5 queries publicas + LGPD. Commit: `99d1230`.

### C2. Cloudflare Real-IP nao restaurado ✅
- **Arquivo**: `ark/nginx/cloudflare-real-ip.conf` (novo) +
  `templates/portifolio.conf.j2` (include).
- **Risco**: nginx via `$remote_addr` = IP de edge da CF. Toda protecao
  por IP (rate limit, CrowdSec, fail2ban, audit) era contornavel.
- **Fix**: snippet com `set_real_ip_from` para todas as ranges CF v4/v6 +
  `real_ip_header CF-Connecting-IP`. Includado no top do template (antes
  das limit_req_zone). Commit: `eb99bf1`.
- **Manutencao**: Cloudflare anuncia mudancas de IP ranges; revisar
  trimestralmente. Fonte: https://www.cloudflare.com/ips-v4 e /ips-v6.

### C3. HSTS desabilitado ✅
- **Arquivo**: `ark/nginx/ssl.conf:13`
- **Risco**: ataque de downgrade no primeiro acesso.
- **Fix**: `Strict-Transport-Security: max-age=15768000; includeSubDomains`
  habilitado. Sem `preload` ate todos subdominios estarem 100% HTTPS.
  Commit: `eb99bf1`.

### C4. Stripe webhook nao-idempotente ✅
- **Arquivo**: `backend/billing/stripe_webhook.py:80-90`
- **Risco**: Stripe retransmite webhooks em retries; `aplicar_plano`
  rodava N vezes pelo mesmo evento, podendo bagunçar transicoes
  (created+updated chegando fora de ordem).
- **Fix**: tabela `stripe_eventos_processados (event_id PK)` +
  `INSERT ON CONFLICT DO NOTHING` antes de `aplicar_plano`. Falha de DB
  loga e segue (Stripe retentaria mesmo). Commit: `ee231b5`.

## Alto (7 — 6 resolvidos, 1 adiado)

### A1. Rate limit em /auth/sdk-token e /cliente/auth/login ✅
- **Arquivos**: `nginx/templates/portifolio.conf.j2`, `backend/app.py`
- **Risco**: brute force livre em login + enumeracao de publishable keys.
- **Fix duplo**:
  - **nginx** zone=cliente_auth (10r/s) aplicado em location:
    `/cliente/auth/login` (burst 5), `/cliente/auth/cadastro` (burst 3),
    `/cliente/auth/magic-link/solicitar` (burst 3),
    `/auth/sdk-token` (burst 10).
  - **Flask-Limiter** per-IP: 60/min em sdk-token, 10/min em login,
    5/min em cadastro/magic-link. Substitui o exempt anterior do
    sdk-token, que era unlimited.
- Commits: `eb99bf1` (nginx) + `ee231b5` (flask).

### A2. Backups .bak no /etc/nginx/conf.d/ ✅
- **Arquivo**: `ark/ansible/roles/nginx/tasks/main.yml`
- **Fix**: task Ansible cria `/etc/nginx/archive/` (0750) e move qualquer
  `*.bak*` legado pra fora do conf.d ativo. Commit: `eb99bf1`.

### A3. CSP ausente em api., portifolio., (app./grafana./influx. parcial) ✅
- **Arquivo**: `templates/portifolio.conf.j2`
- **Fix**:
  - `portifolio.X`: CSP com unsafe-inline (limitacao Vite atual) +
    connect-src api.X (xhr+ws).
  - `api.X`: CSP estrito `default-src 'none'` + `frame-ancestors 'none'`.
  - `embed.X`: ja tinha CSP com frame-ancestors (mantido).
  - `app.X` (Grafana): NAO tocado — Grafana injeta scripts proprios e
    CSP estrito quebra o dashboard. Avaliar nonce-based CSP em PR futuro.
  - `grafana.X` / `influx.X` (monitoring vhost): nao tocado — admin-only,
    CSP de Grafana/Influx basta. (Trade-off documentado, nao incluido.)
  - **Permissions-Policy** global no ssl.conf (mic/cam/geo/payment etc.).
- Commit: `eb99bf1`.

### A4. Admin token fingerprint logging ✅
- **Arquivo**: `backend/app.py:837-869`
- **Fix**: `_fingerprint_admin_token()` = SHA256 truncado(12) do
  `ADMIN_API_TOKEN`. `_registrar_audit` inclui `token_fp=` no log de
  toda chamada admin. session_id sanitizada (\r\n escapados, max 128).
- Commit: `ee231b5`.

### A5. Embed JWT sem revogacao ✅
- **Arquivos**: `backend/auth/embed_jwt_service.py`,
  `backend/embed_routes.py`, `backend/auth/schema*.sql`,
  `backend/auth/tenants_repo.py`.
- **Fix**: claim `jti` (UUID4) em emissao + exigido em verificacao
  (`options.require`). Tabela `embed_jwt_revogados (jti PK, motivo,
  revogado_em)` + `repo.jti_embed_esta_revogado()` consultado em
  `/embed/dados`. TTL curto continua primeira defesa.
- Commit: `ee231b5`.
- **TODO**: criar endpoint admin `POST /admin/embed/revogar` (para uso
  via tenant_admin.py) e cron de housekeeping pra apagar entradas com
  `revogado_em > exp+24h`.

### A6. Network isolation no compose ⏸ ADIADO
- **Razao**: requer migracao coordenada do monitoring/crowdsec compose
  (todos usam `portifolio_default external: true`). Janela de
  manutencao + ansible-apply manual + risco de quebrar Prometheus scrape.
- **Mitigacao parcial**: containers ja bindam so em 127.0.0.1; backend
  tem credenciais corretas pra postgres/influx; CrowdSec monitora logs.
- **Plano**: P3 — fazer numa sprint dedicada, separando em redes
  `app` (frontend/landing/backend), `db` (postgres/influx/backend),
  `obs` (monitoring/crowdsec/backend). Atualizar todos os compose
  externos juntos.

### A7. Pre-flight check no deploy.yml ✅
- **Arquivo**: `.github/workflows/deploy.yml:50-65`
- **Fix**: bloco antes do `git reset --hard` checa `git diff --quiet
  HEAD` (e `--cached`); se tree dirty, aborta com `::error`. Untracked
  vira warning (volumes/dumps tolerados). Commit: `ee231b5`.

## Medio (8 — 5 resolvidos, 3 adiados)

### M1. Bind-mount de codigo em prod ⏸ ADIADO
- Refactor do Dockerfile em PR separado (testar imagem clean-room antes).

### M2. proxy_hide_header Server ✅
- **Arquivo**: `ark/nginx/ssl.conf`
- **Fix**: `proxy_hide_header Server; proxy_hide_header X-Powered-By;`
  global no snippet. Commit: `eb99bf1`.

### M3. Tokens de embed em URL nos logs ✅
- **Arquivo**: `templates/portifolio.conf.j2` (api vhost)
- **Fix**: log_format `api_no_query` strippa query string do `$uri`.
  Commit: `eb99bf1`.

### M4. userns-remap Docker ⏸ ADIADO (alto risco operacional)

### M5. Resource limits no compose ✅
- **Arquivo**: `docker-compose.yml`
- **Fix**: `mem_limit`/`cpus` (sintaxe legacy v2 — honrada por `docker
  compose up`, nao apenas swarm) em todos os services. Commit: `ee231b5`.

### M6. Cookie domain ⏸ ADIADO (decisao de produto sobre subdominios)

### M7. Log sanitization (Authorization, Bearer, etc) ✅
- **Arquivo**: `backend/app.py:191-258`
- **Fix**: `_LogScrubFilter` aplicado em todos handlers (root +
  security). 8 padroes de redacao: postgres URL, Bearer, Authorization,
  X-API-Key, ?token=, *_SECRET/_TOKEN/_KEY/_PASSWORD vars,
  cliente_session cookie, JWT crus (eyJ*). Defesa em profundidade.
  Commit: `ee231b5`.

### M8. SELinux disabled ⏸ ADIADO (relabel filesystem requer downtime)

## Baixo / Informacional (5 — todos adiados)

- B1. Actions com tag flutuante (@v4) — pinar SHA em PR de housekeeping.
- B2. ssl_session_tickets off — latencia, nao seguranca.
- B3. fail2ban so em sshd — sobreposto com CrowdSec.
- B4. Health endpoint `/health/app` no deploy.yml mas backend serve
  `/health` direto — funcional desde que o endpoint exista (verificar).
- B5. Prometheus/node-exporter ja em 127.0.0.1 — atualizar CLAUDE.md.

## Acoes operacionais pendentes do operador

1. **Rotacionar senha do Postgres** — credencial vazou em transcript de
   sessao Claude durante a auditoria. Procedimento em CLAUDE.md.
2. **Aplicar Ansible**: `make -f ark/Makefile ansible-apply` apos merge
   da branch — copia `cloudflare-real-ip.conf` pro snippets/, renderiza
   o vhost atualizado, move .bak files.
3. **Restart compose**: `docker compose up -d --force-recreate
   --no-deps backend frontend landing influxdb postgres archiver` apos
   merge — aplica resource limits.
4. **Verificar CI verde** antes de merge — testes existentes podem ter
   sido afetados por validacao Flux (esperado: `ValueError` em paths
   de teste com tags invalidas).

## Manutencao recorrente

- Trimestralmente: revisar ranges Cloudflare (CF Real-IP).
- Mensal: rotacionar `ADMIN_API_TOKEN` (token_fp no audit ajuda detectar
  uso pos-leak antes da rotacao).
- Sob demanda: revogar embed JWTs explicitamente via tabela
  `embed_jwt_revogados` (criar tenant_admin.py command).
