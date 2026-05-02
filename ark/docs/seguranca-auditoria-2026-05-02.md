# Auditoria de seguranca da VPS — ds playground

**Inicio**: 2026-05-02. **Ultima atualizacao**: 2026-05-02 (pos-rodada 2).

Inventario dos achados, severidade e estado de remediacao. Mantenha como
fonte canonica do estado de seguranca da VPS — atualizar quando aplicar/
regredir/encontrar novo item.

---

## Resumo executivo

| Camada | Total | Resolvidos | Adiados | Mitigados |
|---|---:|---:|---:|---:|
| **Rodada 1** — App (OWASP, nginx, secrets) | 24 | 16 | 5 | 3 |
| **Rodada 2** — SO/acesso/identidades (SSH, DB roles, tokens) | 4 | 2 | 2 | 0 |
| **TOTAL** | **28** | **18** | **7** | **3** |

Status agregado:
- **Critico**: 4/4 resolvidos (100%)
- **Alto**: 8/9 resolvidos (89%) — 1 adiado (network isolation A6)
- **Medio**: 5/8 resolvidos (62.5%) — 3 adiados (M1/M4/M6/M8)
- **Hardening SO**: 2/4 resolvidos — 1 adiado (sudoers), 1 manual (Influx token)

---

## Rodada 1 — Aplicacao + nginx + secrets (2026-05-02)

Origem: auditoria automatica + revisao manual em branch
`security/audit-2026-05-02` (PR #65, mergeada).

### Critico (4 — todos resolvidos)

#### C1. Flux injection nas queries de analytics ✅
- **Arquivo**: `backend/influxdb_service.py:46-78` (validators) + 369-475 (call sites)
- **Risco**: f-string interpolava `app_id`/`page_type`/`ambiente`/`nome`/
  `inicio`/`fim`/`bucket` direto na query Flux. Bucket-per-tenant ja
  limitava blast radius, mas filtros maliciosos podiam vazar entre
  sessoes/users do mesmo cliente.
- **Fix**: allowlist regex + `_validar_*` que levantam
  `FluxParametroInvalido` (subclasse `ValueError`). Em todas as 5 queries
  publicas + LGPD. Commit: `99d1230`.

#### C2. Cloudflare Real-IP nao restaurado ✅
- **Arquivo**: `ark/nginx/cloudflare-real-ip.conf` (novo) +
  `templates/portifolio.conf.j2` (include).
- **Risco**: `$remote_addr` = IP de edge da CF. Toda protecao por IP
  (rate limit, CrowdSec, fail2ban, audit) era contornavel.
- **Fix**: snippet com `set_real_ip_from` para todas ranges CF v4/v6 +
  `real_ip_header CF-Connecting-IP`. Includado antes das limit_req_zone.
  Commit: `eb99bf1`.
- **Manutencao**: Cloudflare anuncia mudancas de IP ranges; **revisar
  trimestralmente**. Fonte: https://www.cloudflare.com/ips-v4 e /ips-v6.

#### C3. HSTS desabilitado ✅
- **Arquivo**: `ark/nginx/ssl.conf`
- **Risco**: ataque de downgrade no primeiro acesso.
- **Fix**: `Strict-Transport-Security: max-age=15768000; includeSubDomains`.
  Sem `preload` ate todos subdominios estarem 100% HTTPS. Commit: `eb99bf1`.

#### C4. Stripe webhook nao-idempotente ✅
- **Arquivo**: `backend/billing/stripe_webhook.py:80-90`
- **Risco**: Stripe retransmite webhooks em retries; `aplicar_plano`
  rodava N vezes pelo mesmo evento.
- **Fix**: tabela `stripe_eventos_processados (event_id PK)` +
  `INSERT ON CONFLICT DO NOTHING` antes de `aplicar_plano`. Commit: `ee231b5`.

### Alto (7 — 6 resolvidos, 1 adiado)

#### A1. Rate limit em /auth/sdk-token e /cliente/auth/login ✅
- **Fix duplo**:
  - **nginx** zone=cliente_auth (10r/s) em `/cliente/auth/login` (burst 5),
    `/cadastro` (3), `/magic-link/solicitar` (3), `/auth/sdk-token` (10).
  - **Flask-Limiter** per-IP: 60/min em sdk-token, 10/min em login,
    5/min em cadastro/magic-link.
- Commits: `eb99bf1` + `ee231b5`.

#### A2. Backups .bak no /etc/nginx/conf.d/ ✅
- Task Ansible cria `/etc/nginx/archive/` (0750) e move `*.bak*` legados.
  Commit: `eb99bf1`.

#### A3. CSP ausente em api., portifolio. ✅
- `portifolio.X`: CSP com unsafe-inline (limitacao Vite atual).
- `api.X`: CSP estrito `default-src 'none'` + `frame-ancestors 'none'`.
- `embed.X`: ja tinha CSP com frame-ancestors (mantido).
- `app.X` (Grafana): NAO tocado — Grafana injeta scripts proprios. **TODO**:
  avaliar nonce-based CSP em PR futuro.
- **Permissions-Policy** global no ssl.conf (mic/cam/geo/payment etc.).
- Commit: `eb99bf1`.

#### A4. Admin token fingerprint logging ✅
- `_fingerprint_admin_token()` = SHA256[:12] do `ADMIN_API_TOKEN`.
- `_registrar_audit` inclui `token_fp=` em todo log admin. Commit: `ee231b5`.

#### A5. Embed JWT sem revogacao ✅
- Claim `jti` (UUID4) em emissao + `options.require`. Tabela
  `embed_jwt_revogados (jti PK)` + `repo.jti_embed_esta_revogado()` em
  `/embed/dados`. TTL curto continua primeira defesa. Commit: `ee231b5`.
- **TODO**: criar `POST /admin/embed/revogar` + cron de housekeeping
  (entradas com `revogado_em > exp+24h`).

#### A6. Network isolation no compose ⏸ ADIADO
- **Razao**: monitoring/crowdsec usam `portifolio_default external: true`.
  Migracao coordenada exige janela de manutencao + risco de quebrar
  Prometheus scrape.
- **Mitigacao**: containers ja em 127.0.0.1; CrowdSec monitora logs.
- **Plano P3**: separar em redes `app`/`db`/`obs`, atualizar todos os
  compose externos juntos.

#### A7. Pre-flight check no deploy.yml ✅
- `git diff --quiet HEAD` antes do `git reset --hard`. Untracked tolerados
  como warning. Commit: `ee231b5`.

### Medio (8 — 5 resolvidos, 3 adiados)

#### M1. Bind-mount de codigo em prod ⏸ ADIADO
Refactor do Dockerfile em PR separado (testar imagem clean-room antes).

#### M2. proxy_hide_header Server ✅
`proxy_hide_header Server; proxy_hide_header X-Powered-By;` no ssl.conf.
Commit: `eb99bf1`.

#### M3. Tokens de embed em URL nos logs ✅
log_format `api_no_query` strippa query string do `$uri`. Commit: `4f4c493`
(corrige posicionamento http{} apos hotfix).

#### M4. userns-remap Docker ⏸ ADIADO
Alto risco operacional (restart daemon Docker + recriar permissoes).

#### M5. Resource limits no compose ✅
`mem_limit` em todos os services. **CPU NAO limitado** (VPS HostGator tem
1 vCPU; `cpus > 1.0` falha). Commits: `ee231b5` + hotfix `f87688d`.

#### M6. Cookie domain ⏸ ADIADO
Depende de decisao de produto sobre subdominios. Mitigado por
SameSite=Strict + Secure + HttpOnly.

#### M7. Log sanitization (Authorization, Bearer) ✅
`_LogScrubFilter` em todos handlers. 8 padroes: postgres URL, Bearer,
Authorization, X-API-Key, ?token=, *_SECRET/_TOKEN/_KEY/_PASSWORD vars,
cliente_session, JWT crus. Commit: `ee231b5`.

#### M8. SELinux disabled ⏸ ADIADO
Habilitar requer relabel filesystem + downtime + risco de quebrar bind
mounts docker.

### Baixo / Informacional (5 — todos abertos)

- B1. Actions com tag flutuante (@v4) — pinar SHA em housekeeping.
- B2. ssl_session_tickets off — latencia, nao seguranca.
- B3. fail2ban so em sshd — sobreposto com CrowdSec.
- B4. Health endpoint `/health/app` no deploy.yml mas backend serve
  `/health` direto — verificar consistencia.
- B5. Prometheus/node-exporter ja em 127.0.0.1 — atualizar CLAUDE.md.

---

## Rodada 2 — SO + acesso + identidades (2026-05-02 pm)

Origem: continuacao da auditoria, foco em camadas nao cobertas pela rodada 1.

### S1. SSH hardening ✅
- **Arquivo**: `/etc/ssh/sshd_config` (host)
- **Antes**: `PermitRootLogin yes` + `PasswordAuthentication yes` + `MaxAuthTries 6`.
  Brute force possivel via senha em porta 22022.
- **Depois**: `PermitRootLogin no` + `PasswordAuthentication no` + `MaxAuthTries 3`.
  Apenas chave SSH; root login via `deploy` + sudo.
- **Aplicado direto no host** (nao via Ansible) com rollback automatico em
  10min como rede de seguranca. Validado por operador via conexao real.
- **TODO P3**: codificar via role Ansible `base` ou `ssh-hardening` para
  ser idempotente em recovery/clean-room.

### S2. Postgres role split (least-privilege) ✅
- **Arquivos**: `ark/ansible/roles/analytics-stack/tasks/main.yml`
  (task que cria `portifolio_app` + ALTER OWNER) +
  `roles/analytics-stack/templates/backend.env.j2` (TENANTS_DATABASE_URL).
- **Antes**: backend conectava como `portifolio` (SUPERUSER + Create role +
  CreateDB + Replication + BypassRLS). Comprometer backend = controle total
  do cluster (DROP DATABASE, COPY ... FROM PROGRAM, CREATE EXTENSION lib
  arbitraria).
- **Depois**: backend conecta como `portifolio_app` (LOGIN, sem SUPERUSER):
  - GRANT CONNECT em `portifolio_auth`
  - GRANT USAGE, CREATE em schema public
  - GRANT SELECT/INSERT/UPDATE/DELETE em todas tabelas + sequences
  - ALTER DEFAULT PRIVILEGES pra tabelas futuras criadas pelo superuser
  - OWNER de tabelas+seqs transferido (necessario porque backend executa
    ALTER TABLE no boot via schema_postgres.sql).
- Senha separada: `postgres_app_password` no vault (rotacao independente
  do superuser `postgres_password`).
- Commits: `56dd027` (template) + `e600805` (task ansible idempotente).

### S3. NOPASSWD do user deploy ⏸ ADIADO
- **Arquivo**: `/etc/sudoers.d/90-deploy`
- **Estado**: `deploy ALL=(ALL) NOPASSWD:ALL`. Trade-off conhecido.
- **Razao do adiamento**: `playbook.yml:4 become: true` exige sudo NOPASSWD
  pra ansible rodar `dnf install`, `systemctl reload`, `chown` etc. CD
  self-hosted nao consegue prompt interativo. Restringir a comandos
  especificos quebra automation.
- **Mitigacao**: S1 (hardening SSH) reduz quem chega no host. Chave SSH
  do deploy = root, mas chave SSH so chega via porta 22022 com pubkey,
  e CrowdSec/fail2ban detectam tentativas falhadas.

### S4. InfluxDB token granular ⏸ MANUAL
- **Estado**: backend usa `INFLUXDB_TOKEN` admin (full access — pode criar/
  deletar buckets, ler dados de qualquer cliente, DELETE arbitrario).
- **Adiado por**: sandbox Claude bloqueou ler `INFLUXDB_TOKEN` do `.env`
  em runtime. Procedimento manual documentado abaixo (operador roda).

**Procedimento manual (operador, ~5min):**
```bash
# 1. Logar como deploy na VPS
ssh deploy@dsplayground.com.br -p 22022

# 2. Configurar Influx CLI dentro do container com token admin
INFLUX_TOKEN=$(grep ^INFLUXDB_TOKEN= /opt/portifolio/backend/.env | cut -d= -f2)
docker exec -e INFLUX_TOKEN="$INFLUX_TOKEN" portifolio-influxdb \
  influx config create --name admin --host-url http://localhost:8086 \
  --org zen --token "$INFLUX_TOKEN" --active

# 3. Criar token write-only no bucket portifolio_prod
docker exec portifolio-influxdb influx auth create \
  --org zen --description "backend-write-prod" \
  --write-bucket portifolio_prod \
  --read-bucket portifolio_prod
# CAPTURAR o token (output) — fica em var temp.

# 4. Atualizar vault (mesmo procedimento da senha do Postgres)
cd /opt/portifolio/ark/ansible
ansible-vault decrypt group_vars/all.yml
sed -i 's|^influxdb_token:.*|influxdb_token: "<NOVO_TOKEN>"|' group_vars/all.yml
ansible-vault encrypt group_vars/all.yml

# 5. ansible-apply re-renderiza .env do backend
make -f ../Makefile ansible-apply

# 6. Rebuild backend pra carregar novo .env
docker compose up -d --force-recreate --no-deps backend archiver

# 7. Validar metrics ainda fluindo
docker logs --tail 30 portifolio-backend | grep -i influx
curl -s http://127.0.0.1:5000/health  # influxdb:connected
```

**Apos OK**: revogar o token admin antigo (manter o admin novo offline so pra
operacoes administrativas).

---

## Acoes operacionais executadas

- ✅ Senha Postgres rotacionada (vault + ALTER USER) — credencial vazou em
  transcript Claude na rodada 1.
- ✅ ansible-apply rodado pos-merge (snippets, vhost, archive .bak).
- ✅ Stack recriada com mem_limit ativo.
- ✅ SSH hardening aplicado e validado por conexao real.
- ✅ Role `portifolio_app` criada + ownership transferido.

## Acoes operacionais ainda pendentes

1. **Rotacionar `INFLUXDB_TOKEN` (S4)** — procedimento acima.
2. **Rotacionar `ADMIN_API_TOKEN`** — agora que tem token_fp no audit log,
   da pra detectar uso pos-leak. Rotacionar mensalmente:
   ```bash
   NEW=$(openssl rand -hex 32)
   # Atualizar vault: ansible-vault edit group_vars/all.yml -> admin_api_token
   make -f ark/Makefile ansible-apply
   ```
3. **Rotacionar `STRIPE_WEBHOOK_SECRET`** caso suspeite de leak (rotina de
   60 dias e padrao da industria; ainda nao implementado aqui).
4. **Pinar SHAs das GitHub Actions** (B1) — abrir PR de housekeeping.
5. **Submeter HSTS preload** apos 3 meses de operacao estavel.

---

## Proximos passos — areas nao cobertas ainda

Areas que **nenhuma das duas rodadas** auditou. Priorizadas por impacto/
probabilidade.

### P0 — Backups + Disaster Recovery 🔴
**Por que importa**: comprometimento de seguranca + sem backup = perda
permanente. Hoje os volumes `postgres_data`, `influxdb_data`, `backend_keys`
nao tem backup automatico documentado. Se um atacante conseguir DROP
DATABASE ou volumes corromperem, **recovery e impossivel**.
**Investigar**:
- Existe cron de `pg_dump` ou `wal-e`/`pgbackrest`? Onde armazena?
- InfluxDB 2.x tem `influx backup` — automatizado?
- Volumes Docker tem snapshot policy (BTRFS/ZFS)?
- Backup do `backend_keys` (chaves RSA do JWT) — vital pra continuidade.
- Backup off-site: R2 bucket separado (com versionamento)?
- **Restore drill**: ja foi testado num ambiente de staging?
**Acao sugerida**: implementar `pg_dump` + `influx backup` cron diario em
sidecar dedicado, upload pra R2 com retencao 30/90/365 dias.

### P1 — Dependency audit + CVE scan 🟡
**Por que importa**: pacotes Python/Node + imagens base podem ter CVE
HIGH/CRITICAL silenciosos. Sem scan automatico, vulnerabilidades novas
nao sao detectadas.
**Investigar**:
- `pip-audit -r backend/requirements.txt` — vulns transitivas Python.
- `npm audit --omit=dev` no `frontend/` e `landing/`.
- `trivy image postgres:16-alpine influxdb:2.7 grafana/grafana:11.2.0
  prom/prometheus:v2.54.1 prom/node-exporter:v1.8.2 crowdsecurity/crowdsec:v1.6.3`.
- `dnf check-update` no host — pacotes RHEL com patch pendente.
**Acao sugerida**: GitHub Action `dependabot.yml` + `trivy-action` no CI;
falhar build em CRITICAL nao-mitigado.

### P2 — GitHub repo hardening 🟡
**Por que importa**: branch protection ausente = qualquer push direto na
main dispara CD sem review. Sem secret scanning, secret commitado por
acidente vaza.
**Investigar**:
- Branch protection na `main`: required status checks, required reviews,
  dismiss stale reviews, restrict push.
- GitHub secret scanning + push protection.
- Dependabot alerts ligado.
- Code scanning (CodeQL).
- 2FA obrigatorio para colaboradores.
- Self-hosted runner: visibilidade do repo (deve ser privado), labels
  restritos, environment com required reviewers para `production`.
**Acao sugerida**: configurar tudo via web `Settings > Branches`/`Security`.
Documentar no `ark/docs/contas-e-acessos.md`.

### P3 — Cloudflare hardening 🟡
**Por que importa**: CF e a primeira camada de defesa. Default config
deixa muita coisa sem protecao.
**Investigar**:
- Bot Fight Mode ligado? Super Bot Fight Mode (paid)?
- WAF rules: managed rules ativas? OWASP ruleset?
- Rate limit no edge (alem do nginx): 100req/min por IP em paths sensiveis?
- Page rules / custom rules: bloquear paths nao usados (`/wp-admin`, etc).
- Always Use HTTPS + Automatic HTTPS Rewrites: ON.
- TLS 1.3 only no edge (CF -> client).
- Origin pull config: client cert auth pra garantir que so CF chega no
  origin (compromisso entre simplicidade e seguranca).
- DNSSEC habilitado.
**Acao sugerida**: revisar dashboard CF em sessao dedicada.

### P4 — Observabilidade de seguranca 🟢
**Por que importa**: se algo dar errado as 3am, ninguem sabe. Hoje os
logs existem (security.log + nginx access) mas ninguem alerta.
**Investigar**:
- Alertmanager (Prometheus) configurado? Recebe email/Slack/Telegram?
- CrowdSec metrics no Grafana (decisions/h, alertas/h)?
- Backend `_LogScrubFilter` joga em security.log — quem le?
- Cron diario de "report de auditoria": brute force tentativas, admin
  endpoint hits, embed JWT revoked etc.
- Alarmes de cert expiration (origin CF + SSH host keys).
**Acao sugerida**: configurar Alertmanager + canal de alerta dedicado.

### P5 — Lifecycle de credenciais 🟢
**Por que importa**: credenciais que nunca rodam acumulam superficie.
Hoje cada token tem cadencia diferente (ou nenhuma).
**Investigar**:
- Cadence formal: postgres (180d), influx admin (180d), admin api (30d),
  stripe (sob demanda), resend (180d), grafana admin (180d), JWT signing
  keys (1y).
- Procedimento documentado pra cada (passos, validacao, rollback).
- Calendar reminders / cron jobs que abrem PR de "rotacao [token] vence
  em 7d".
- Recovery: e se o vault password file (`/opt/portifolio/.vault-password`)
  for perdido? Backup off-site dele?
**Acao sugerida**: tabela `ark/docs/credenciais-cadence.md` + cron de
reminder.

### P6 — Postgres + Influx ops 🟢
- Postgres: pg_hba.conf restrito? Connection limit? `log_statement = ddl`
  pra audit de DROP/ALTER?
- InfluxDB: retention policies por bucket? Quotas por org/user?
  Tasks de downsampling?
- Backend tem rate limit de queries pesadas Influx (uma query Flux com
  range muito largo trava o container)?

### P7 — Application internals
- LGPD: retention dos buckets InfluxDB? automated cleanup de session_id
  com idade > X dias?
- Magic-link: tokens em `clientes_magic_links` tem expurgo programado?
- `consumo_diario` cresce indefinidamente — cron de limpar > 90d?

---

## Manutencao recorrente

| Item | Cadencia | Ultima execucao |
|---|---|---|
| Revisar ranges Cloudflare (CF Real-IP) | Trimestral | 2026-05-02 |
| Rotacionar `ADMIN_API_TOKEN` | Mensal | (nunca) |
| Revisar embed_jwt_revogados (housekeeping) | Mensal | (nunca) |
| Rotacionar `INFLUXDB_TOKEN` | Trimestral | (pendente) |
| Rotacionar senhas Postgres (super + app) | Semestral | 2026-05-02 |
| Pin SHAs das Actions | Quando atualizar deps | (nunca) |
| Restore drill (postgres + influx + keys) | Trimestral | (nunca) |
| Renovar SSH host keys | Anual | (nunca) |
| Revisar logs CrowdSec / fail2ban | Semanal | (nunca) |
| Smoke test agent-smoke.timer | Continuo (30min) | timer ativo? |

---

## Changelog

- **2026-05-02 manha** — Rodada 1: 19 fixes em PR #65 (commit `9389854`).
  Hotfixes: cpus limit (`f87688d`), nginx log_format (`8f8d5af`/`4f4c493`).
- **2026-05-02 tarde** — Rodada 2: SSH hardening (host config), Postgres
  role split (`56dd027` + `e600805`). Senha Postgres rotacionada (vault).
- **2026-05-02 tarde** — Doc consolidado com proximos passos P0-P7.

---

## Como atualizar este doc

1. Quando aplicar/regredir um fix: editar status (`✅`/`⏸`/`🔴`) e adicionar
   commit hash na secao do achado.
2. Quando descobrir achado novo: classificar em rodada/severidade e
   documentar com mesmo template (Arquivo / Risco / Fix / Commit).
3. Quando fechar uma frente P0-P7 dos proximos passos: mover pra "Rodada N"
   com detalhe e remover de "Proximos passos".
4. Atualizar resumo executivo + tabela de manutencao recorrente.
