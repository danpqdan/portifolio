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

### P0 — Backups + Disaster Recovery 🟡 PARCIAL (codigo pronto, operador instala)
**Estado**: artefatos comitados em `ark/scripts/backup-prod.sh`,
`ark/systemd/backup-prod.service`, `ark/scripts/restore-prod.sh`,
`ark/docs/backup-restore.md`. Cobre `postgres_data` (via pg_dump),
`backend_keys` (RSA do JWT), `monitoring_grafana-data`, `influxdb_config`.

**Pendente do operador (~10min de configuracao):**

⚠️ **Bloqueio atual**: as credenciais R2 atuais sao scoped ao bucket
`dsplayground-analytics-archive` (do archiver) — `list_buckets` retorna
`AccessDenied`. Antes de ativar upload, decidir UM dos cenarios:

| Cenario | Acao |
|---|---|
| **A** — bucket novo + creds ampliadas | Operador ja criou bucket separado e ampliou as creds R2 atuais pra incluir ele. So adicionar `r2_bucket_backup: <nome>` ao vault. |
| **B** — bucket novo + creds novas | Bucket novo precisa de creds proprias. Adicionar ao vault `r2_backup_account_id`, `r2_backup_access_key_id`, `r2_backup_secret_access_key`, `r2_bucket_backup`. Modificar `backup-prod.sh` pra usar creds dedicadas. |
| **C** — reusar `dsplayground-analytics-archive` com prefix | NAO recomendado — backups com chave RSA convivem com archive de cliente, blast radius maior. Mas viavel: prefix `prod/` separa. |

**Passos a aplicar quando o cenario estiver decidido:**
1. Criar/configurar bucket R2 (versionamento ON, lifecycle 30/90/365d).
   Procedimento detalhado em `ark/docs/backup-restore.md` §1.
2. Adicionar var(s) ao vault Ansible (depende do cenario).
3. Adicionar `R2_BUCKET_BACKUP={{ r2_bucket_backup }}` (e demais vars
   se for cenario B) ao `templates/backend.env.j2`.
4. `make -f ark/Makefile ansible-apply`.
5. Instalar systemd service + timer (heredoc no `backup-restore.md` §3).
6. Rodar `bash /opt/portifolio/ark/scripts/backup-prod.sh` manual pra
   testar antes de deixar agendado.
7. **Drill trimestral**: restore num ambiente staging usando
   `restore-prod.sh`. Documentar resultado.

**Estado atual sem passos acima**: backup local funcional (`/var/lib/backup-prod/`,
retencao 7d). Em caso de comprometimento do filesystem, perde-se. Para
DR real, finalizar configuracao R2 e drill.

Sem o passo 6+drill, ha codigo mas nao ha confianca — restore nunca
testado e pior que sem restore (falsa sensacao de seguranca).

**O que o script NAO cobre** (decisao):
- `influxdb_data`: archiver ja faz tiering pra R2 (bucket separado).
- `prometheus-data`: metricas sao derivadas, retencao 15d aceita perda.

### P1 — Dependency audit + CVE scan 🟡 PARCIAL (Python OK, resto pendente)

**Estado**: scan executado em 2026-05-02. Achados:

#### Backend Python ✅ CORRIGIDO
13 CVEs em 7 pacotes — todos atualizados em `backend/requirements.txt`:

| Pacote | De | Para | CVEs |
|---|---|---|---|
| cryptography | 46.0.2 | 46.0.7 | 3 (CVE-2026-26007/34073/39892) |
| pyjwt | 2.9.0 | 2.12.0 | CVE-2026-32597 (impacta sdk_jwt + embed_jwt) |
| Flask | 3.1.2 | 3.1.3 | CVE-2026-27205 |
| Werkzeug | 3.1.3 | 3.1.6 | 3 |
| urllib3 | 2.5.0 | 2.6.3 | 3 |
| Pygments | 2.19.2 | 2.20.0 | CVE-2026-4539 |
| python-dotenv | 1.1.1 | 1.2.2 | CVE-2026-28684 |

`pip-audit -r requirements.txt` apos: **No known vulnerabilities found**.
Aplicado em runtime no proximo `docker compose up -d --build backend`.

#### Frontend npm 🟡 PENDENTE OPERADOR
`uuid <14.0.0` — moderate (CVE buffer bounds em v3/v5/v6, GHSA-w5hq-g745-h8pq).
Fix via `npm audit fix --force` instala uuid@14 (**breaking change**).
**Operador**: avaliar se codigo do frontend usa API V3/V5/V6 (improvavel —
geralmente `uuid.v4()` que continua compativel) e fazer upgrade num PR
dedicado com testes de build. Landing: 0 vulns.

#### Host RHEL 🟡 PENDENTE OPERADOR (precisa reboot)
`dnf updateinfo --security` listou 9 advisories Importante/Seg pendentes:

```
RLSA-2026:8921   kernel + kernel-core + kernel-modules
RLSA-2026:10949  python3 + python3-libs
RLSA-2026:11504  PackageKit + PackageKit-glib
RLSA-2026:10708  gdk-pixbuf2
RLSA-2026:11510  vim-minimal + vim-filesystem
RLSA-2026:9692   webkit2gtk3-jsc
```

**Operador**: agendar janela com aviso, rodar:
```bash
sudo dnf upgrade --security -y
sudo dnf needs-restarting -r  # 1 = reboot necessario
sudo systemctl reboot
```

Apos reboot, validar containers sobem (`docker compose ps`),
smoke test (`bash ark/scripts/agent-smoke.sh`), CrowdSec ativo.

#### Imagens base do monitoring 🟡 PENDENTE OPERADOR (avaliar versoes)
3 imagens com mais de 8 meses (criadas Jul-Sep 2024):

```
grafana/grafana:11.2.0          (Aug 2024)
prom/prometheus:v2.54.1          (Aug 2024)
prom/node-exporter:v1.8.2        (Jul 2024)
crowdsecurity/crowdsec:v1.6.3    (Sep 2024)
```

Atualizadas: `influxdb:2.7` (Apr 2026), `postgres:16-alpine` (Apr 2026).

**Operador**: avaliar upgrade pra LTS atuais — mudancas em
`ark/monitoring/docker-compose.monitoring.yml` e
`ark/crowdsec/docker-compose.crowdsec.yml`. Recomendar minor patches
seguros antes de jumps majors.

#### CVE scan continuo 🟡 PENDENTE
- **GitHub Action Dependabot** (`.github/dependabot.yml`): npm + pip
  + GitHub Actions. Abre PR semanal com upgrades.
- **Trivy CI**: scan das imagens em todo PR; falha build em CRITICAL
  nao-mitigado.
- **`pip-audit`** no CI (`.github/workflows/ci.yml`): falha em qualquer
  CVE no requirements.txt.

**Acao sugerida P1.5**: adicionar dependabot.yml + step de pip-audit no
ci.yml em PR proximo.

### P2 — GitHub repo hardening 🟡 PARCIAL (dependabot.yml feito, resto operador)

**Estado**:
- ✅ `.github/dependabot.yml` adicionado: pip + npm (frontend/landing) + docker
  + github-actions, schedule weekly Monday, groups minor/patch, ignore
  uuid major (breaking change pendente operador).
- 🟡 Branch protection na `main`: NAO confirmado. Hoje push direto aciona
  CD sem review.
- 🟡 Secret scanning + push protection: NAO confirmado.
- 🟡 CodeQL: NAO confirmado.
- 🟡 Environment `production` com required reviewer: deploy.yml ja usa
  `environment: production` (linha 31), mas reviewer NAO configurado
  (verificar via web).
- 🟡 2FA obrigatorio: NAO confirmado.
- 🟡 Visibilidade do repo: NAO confirmado (deve ser PRIVADO pelo
  self-hosted runner).

**Pendente operador (~30min web)**: runbook detalhado em
`ark/docs/github-repo-hardening.md` — passos 1-8 com prints de tela
e validacao pos-config.

**Custo**: depende do plano GitHub. Free tier nao tem secret scanning/
CodeQL em repo privado. Mitigacao: pre-commit hook com `gitleaks` +
pip-audit/npm audit no CI (ja proposto em P1.5).

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
