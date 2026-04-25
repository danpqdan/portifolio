# CLAUDE.md — VPS de producao (dsplayground.com.br)

Este arquivo guia o Claude Code ao operar esta VPS. O foco e gerencia de servidor: inspecionar containers, ler logs, aplicar mudancas via Ansible/Compose e nao pisar em producao.

## Identidade do host

- **Host**: `vps-15240803.vpsbr-15240803.vpshostgator.com.br` (HostGator)
- **OS**: Rocky Linux 9.7 (kernel `5.14.0-611.47.1.el9_7`)
- **Dominios publicos**: `dsplayground.com.br` (apex → frontend), `api.dsplayground.com.br` (backend), `grafana.dsplayground.com.br`, `influx.dsplayground.com.br`
- **Cloudflare**: modo **Full (strict)**, DNS proxiado (laranja) para todos os subdominios
- **SSH**: porta `22022` (firewalld + fail2ban). Ingress externo em portas non-standard e bloqueado pelo provedor — por isso o CI/CD usa **self-hosted runner** na propria VPS.
- **Ambiente**: `production` (ver `/opt/portifolio/ark/ansible/inventory.ini`)

## Repositorio

- Raiz: `/opt/portifolio` — dono `deploy:analytics`, modo `0750`
- Infra/operacao: `/opt/portifolio/ark/` (Nginx, Ansible, CrowdSec, monitoramento)
- App: `backend/` (Flask + Socket.IO + InfluxDB + Postgres), `frontend/` (React + Vite, build estatico servido por nginx:alpine)
- Leitura obrigatoria antes de mexer em app: `/opt/portifolio/AGENTS.md` e `/opt/portifolio/README.md`
- Leitura obrigatoria antes de mexer em infra: `/opt/portifolio/ark/README.md` e `/opt/portifolio/ark/docs/servidor-producao.md` (**este e a fonte canonica da arquitetura atual** — CLAUDE.md e resumo)

## Stack em execucao (docker ps)

Oito containers em tres compose files distintos:

| Container | Imagem | Porta host | Compose file |
|---|---|---|---|
| `portifolio-frontend` | `portifolio-frontend` (nginx:alpine + bundle Vite) | `127.0.0.1:3000→:80` | `/opt/portifolio/docker-compose.yml` |
| `portifolio-backend` | `portifolio-backend` (Flask + Socket.IO) | `127.0.0.1:5000→:5000` | `/opt/portifolio/docker-compose.yml` |
| `portifolio-influxdb` | `influxdb:2.7` | `127.0.0.1:8086→:8086` | `/opt/portifolio/docker-compose.yml` |
| `portifolio-postgres` | `postgres:16-alpine` | so na rede docker (sem publish) | `/opt/portifolio/docker-compose.yml` |
| `portifolio-prometheus` | `prom/prometheus:v2.54.1` | `0.0.0.0:9090` *(TODO → loopback)* | `ark/monitoring/docker-compose.monitoring.yml` |
| `portifolio-grafana` | `grafana/grafana:11.2.0` | `127.0.0.1:3001→:3000` | `ark/monitoring/docker-compose.monitoring.yml` |
| `portifolio-node-exporter` | `prom/node-exporter:v1.8.2` | `0.0.0.0:9100` *(TODO → loopback)* | `ark/monitoring/docker-compose.monitoring.yml` |
| `portifolio-crowdsec` | `crowdsecurity/crowdsec:v1.6.3` | `127.0.0.1:6060`, `127.0.0.1:8080` | `ark/crowdsec/docker-compose.crowdsec.yml` |

Redes docker:
- `portifolio_default` (bridge) — rede da app (backend, postgres, influxdb, frontend); monitoring e crowdsec entram nela via `external: true`
- `monitoring_portifolio-monitoring` (bridge) — isola Prometheus/Grafana/node-exporter

Volumes persistentes (nao apagar sem checar):
- `portifolio_influxdb_data`, `portifolio_influxdb_config` — series temporais
- `portifolio_postgres_data` — auth multi-tenant (clientes, tokens, refresh, quotas, audit)
- `portifolio_backend_keys` — chaves RSA do `sdk_jwt` (`/app/data/keys/sdk_jwt_{private,public}.pem`). Criado com `root:root`, `analytics-stack` chown 10001:10001 antes do `up`.
- `monitoring_prometheus-data`, `monitoring_grafana-data` — metricas e dashboards
- `crowdsec_crowdsec-db`, `crowdsec_crowdsec-config` — decisoes e config do agente

## Arquitetura de trafego

```
Internet → Cloudflare (laranja, Full strict, Origin Cert)
              └→ Nginx host (80/443, TLS CF Origin Cert ate 2041)
                    ├─ dsplayground.com.br          → 127.0.0.1:3000 (frontend nginx:alpine → dist/)
                    │    ├─ /api/cliente/auth/*     → 127.0.0.1:5000 (login humano do dashboard)
                    │    └─ /cliente/metricas/*     → auth_request → 127.0.0.1:3001 (Grafana c/ auth.proxy)
                    ├─ api.dsplayground.com.br      → 127.0.0.1:5000 (backend Flask, prefixo /api/*)
                    │                                  WS em /api/socket.io/ (NAO /socket.io/)
                    ├─ grafana.dsplayground.com.br  → 127.0.0.1:3001 (Grafana — admin direto)
                    └─ influx.dsplayground.com.br   → 127.0.0.1:8086 (InfluxDB)

Backend → influxdb:8086, postgres:5432 (rede portifolio_default)
CrowdSec le /var/log/nginx + backend/security.log → aplica decisoes via bouncer
Prometheus scrape backend:5000/metrics (quando existir) + node-exporter

Dashboard do cliente (detalhes em ark/docs/dashboard-cliente.md):
  Browser → /cliente/metricas/* → nginx auth_request /__cliente_auth_gate
        → Flask /api/cliente/auth/gate (valida cookie cliente_session)
        → 200 + header X-WEBAUTH-USER=<site_id>
        → nginx propaga pro Grafana
        → Grafana auth.proxy confia no header e mapeia user
```

Detalhes completos em `/opt/portifolio/ark/docs/servidor-producao.md`.

## Comandos operacionais

Sempre que possivel, use os alvos do `Makefile` em `/opt/portifolio/ark/Makefile` (invocar a partir de `/opt/portifolio`):

```bash
make -f ark/Makefile ps                # estado dos containers da app
make -f ark/Makefile logs              # tail -f backend
make -f ark/Makefile restart           # restart backend + frontend
make -f ark/Makefile dev               # compose up -d (rebuild se preciso)
make -f ark/Makefile monitoring-up     # Prometheus + Grafana
make -f ark/Makefile crowdsec-up       # CrowdSec
make -f ark/Makefile ansible-check     # playbook dry-run (**hoje quebra — ver pendencias**)
make -f ark/Makefile ansible-apply     # aplicar playbook
```

Comandos docker uteis fora do Makefile:

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
docker stats --no-stream
docker logs --tail 200 -f portifolio-backend
docker inspect portifolio-backend --format '{{.State.Health.Status}}'
```

Health checks da aplicacao (via loopback — backend bindando so em `127.0.0.1:5000`, so Nginx alcanca). Em prod o blueprint tem `url_prefix=/api`; em dev local nao tem prefixo (ver `app.py:31`).

```bash
curl -s http://127.0.0.1:5000/api/health/app
curl -s http://127.0.0.1:5000/api/health/socketio
curl -s http://127.0.0.1:5000/api/health/influxdb
```

## CI / CD (GitHub Actions + self-hosted runner)

Tres workflows em `.github/workflows/`:

| Workflow | Trigger | Responsabilidade |
|---|---|---|
| `ci.yml` | PR, push em `main` | `docker-compose config`, ansible syntax, frontend lint+test+build, backend lint+test |
| `prod-regression.yml` | push em paths sensiveis + cron diario 03:17 UTC | smoke via curl: sem debugger Werkzeug, sem `/console`, sem rota sem prefixo `/api`, bundle estatico servido |
| `deploy.yml` | `workflow_run` CI OK em `main` (+ `workflow_dispatch`) | CD: runner na VPS roda `git reset --hard origin/main` + `docker compose up -d --build --force-recreate --no-deps backend frontend` + health |

**Limites do CD automatico:** apenas `backend` e `frontend` sao rebuildados. Mudancas em InfluxDB/Postgres, roles Ansible, nginx do host, monitoring ou crowdsec exigem `make -f ark/Makefile ansible-apply` manual.

**Self-hosted runner:** servico systemd `actions.runner.danpqdan-portifolio.vps-production.service`, roda como `deploy`, label `production-vps`, em `/opt/actions-runner/`. Necessario porque HostGator bloqueia SSH externo em `22022` — runner puxa jobs via HTTPS outbound.

**Risco:** runner em repo publico e perigoso (forks rodam com acesso ao host). Se o repo tornar-se publico, desinstalar o runner imediatamente.

**Rollback manual** (logado como `deploy`):
```bash
cd /opt/portifolio
git reset --hard <sha-anterior>
docker compose up -d --build --force-recreate --no-deps backend frontend
```

## Permissoes e bind-mounts

Grupo compartilhado **`analytics` GID 10001** e a ponte host↔container. Nao mude ownership de `/opt/portifolio` sem reler a tabela em `ark/docs/servidor-producao.md`. Regras criticas:

- `/opt/portifolio/backend/` usa SGID (`2770`) — novos arquivos herdam grupo `analytics`.
- `/opt/portifolio/backend/.env` e `ark/monitoring/.env` sao `0640` dono `deploy:analytics`. Nunca versionar.
- `/var/run/docker.sock` e `root:docker` — `deploy` entra pelo grupo `docker`.
- Nginx vhosts em `/etc/nginx/conf.d/portifolio.conf` (apex + api) e `portifolio.monitoring.conf` (grafana + influx), layout Rocky/RHEL, `root:root 0644`.
- TLS origin: `/etc/ssl/cloudflare-origin/fullchain.pem` (`0644`) + `privkey.pem` (`0600`), ambos `root:root`, validade ate 2041.

**Apos qualquer `Edit`/`Write` em arquivo sob `/opt/portifolio/` rodar `chown deploy:analytics <arquivo>`** — senao o container bate `EACCES` no runtime.

## Seguranca — o que NAO fazer

- **Nao expor `5000` (backend), `3000` (frontend), `8086` (InfluxDB), `3001` (Grafana) nem `5432` (Postgres) publicamente**. Em prod so Nginx acessa — bindings estao em `127.0.0.1:<porta>` (ou sem publish no caso do Postgres).
- **Nao adicionar `environment:` inline no `docker-compose.yml` para variaveis de runtime do backend**. A fonte unica e `backend/.env` gerado pelo Ansible (`templates/backend.env.j2`). Regressao desse padrao ressuscita o bug dev-em-prod (ver memoria `project_deploy_state.md`).
- **Nao rodar `docker compose down -v`** em nenhum dos tres composes — apaga volumes com series do InfluxDB, auth do Postgres, chaves RSA do backend, decisoes do CrowdSec e dashboards Grafana.
- **Nao editar configs direto no host** — sempre ajustar no repo e re-aplicar via Ansible/Compose. Mudanca manual se perde no proximo `ansible-apply`.
- **Nao versionar segredos**: `INFLUXDB_TOKEN`, `SECRET_KEY`, `ADMIN_API_TOKEN`, `POSTGRES_PASSWORD`, senha Grafana vivem em `group_vars/all.yml` (deveria estar em Ansible Vault — hoje em cleartext, ver pendencias) ou `.env` local (gitignored).
- **Nao usar `--no-verify`, `push --force`, `reset --hard`** sem autorizacao explicita.
- **DNS proxiado**: se algum subdominio estiver cinza (DNS only) na Cloudflare, o TLS quebra — o CF Origin Cert so vale quando o trafego passa pela laranja.

## Fluxo de mudanca em producao

1. Editar arquivo relevante dentro de `/opt/portifolio` (app) ou `/opt/portifolio/ark` (infra).
2. Se for infra gerenciada por Ansible: `make -f ark/Makefile ansible-check` primeiro (**hoje quebra por falta de `ignore_errors` na task de health — ver pendencias**), depois `ansible-apply`.
3. Se for so app (backend/frontend): o CD automatico ja cuida apos merge em `main`. Para deploy manual: `make -f ark/Makefile dev` e validar `/api/health/app`.
4. Conferir logs: `make -f ark/Makefile logs` e `docker logs` dos containers relacionados.
5. Nao comitar sem o usuario pedir. Quando pedir, seguir Conventional Commits em pt-BR (ver `AGENTS.md`).

## Observabilidade

- Logs da app sao estruturados (`evento=<nome> chave=valor`). Eventos-chave: `conectado`, `recebido`, `validado`, `rejeitado`, `persistido_*`, `erro_persistencia`, `backpressure`, `acesso_bloqueado`, `[ADMIN-AUDIT]`.
- `backend/security.log` rotaciona em 10 MB x 5 arquivos e e lido pelo CrowdSec.
- Grafana: `https://grafana.dsplayground.com.br` (via Nginx) — admin user/senha via `ark/monitoring/.env`.
- Prometheus: `http://<host>:9090` (ainda publico, **TODO**) — retencao 15 dias (`--storage.tsdb.retention.time=15d`).

## Mudancas pendentes de aplicar em producao (fixes 2026-04-22)

Todas as 7 pendencias P2/P3 foram corrigidas no repo em 2026-04-22, mas **ainda nao efetivaram em prod**. Ate rodar o deploy, o comportamento em produção e o antigo.

**Via CD automatico (proximo push em `main`):**
- Backend migrado para `gunicorn --worker-class eventlet -w 1` (`backend/Dockerfile`). `requirements.txt` ganhou `gunicorn==23.0.0`.
- Logger root do Flask separado do `security_logger` (`backend/app.py`) — `security.log` so recebe eventos do logger nomeado `security`, `propagate=False`. Reduz ruido de linhas unparsed no CrowdSec.

**Via `make -f ark/Makefile ansible-apply` manual:**
- `roles/nginx/`: removidos certbot + python3-certbot-nginx do `dnf`, task `certbot --nginx` e timer. CF Origin Cert e a unica fonte de TLS.
- `roles/crowdsec/`: adicionada task que instala o repo packagecloud `crowdsecurity/crowdsec-bouncers-nginx` (onde o pacote realmente vive). `ignore_errors` removido da instalacao do bouncer.
- `roles/analytics-stack/`: tasks de health e retencao ganharam `when: not ansible_check_mode` — `make ansible-check` volta a rodar sem quebrar.
- Secrets em `group_vars/all.yml` agora criptografados com **ansible-vault**. Senha em `/opt/portifolio/.vault-password` (0600, dono `deploy:analytics`, fora do git). `ark/ansible/ansible.cfg` novo aponta `vault_password_file` automaticamente.

**Via `make -f ark/Makefile monitoring-down && monitoring-up` manual:**
- Prometheus (`9090`) e node-exporter (`9100`) agora bindam em `127.0.0.1` (ver `ark/monitoring/docker-compose.monitoring.yml`). Re-criar containers para o bind novo valer.

Depois que aplicar tudo, remover esta secao do CLAUDE.md. Historico em memoria `project_deploy_state.md`.

## Quando em duvida

- Arquitetura e ordem de deploy → `ark/docs/servidor-producao.md` (fonte canonica)
- Como trafego entra → `ark/nginx/README.md` + `ark/nginx/portifolio.conf`
- Bloqueios automatizados → `ark/crowdsec/README.md`
- Provisionamento do zero → `ark/ansible/README.md` + `playbook.yml`
- Padroes de codigo da app → `AGENTS.md`

Se um comando puder afetar dados persistentes, a rede publica, ou derrubar servico — pergunte antes de executar.
