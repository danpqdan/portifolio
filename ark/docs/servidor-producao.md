# Arquitetura de servidor — producao

## Visao geral

```
                            Internet
                               |
                               v
                        +--------------+
                        | Cloudflare   |  Proxy CDN + Origin Certificate
                        | (laranja)    |  modo Full (strict)
                        +------+-------+
                               |
                               v
                        +--------------+
                        |    Nginx     |  TLS (CF Origin cert), rate limit,
                        |   (host)     |  /admin allowlist, WS upgrade
                        +------+-------+
                    ___________|_______________________________
                   /           |             |                 \
                  v            v             v                  v
             dsplayground. api.dspl...  grafana.dspl...   influx.dspl...
                  |            |             |                  |
                  v            v             v                  v
           +-------------+  +-------+   +---------+        +-----------+
           |  Frontend   |  |Backend|   | Grafana |        | InfluxDB  |
           | nginx:80    |  | :5000 |   |  :3001  |        |  :8086    |
           | (dist Vite) |  +---+---+   +----+----+        +-----+-----+
           +-------------+      |            |                   |
                                |            |                   |
                                v            v                   |
                          +----------+    Prometheus <-----------+
                          | InfluxDB | <------+
                          +----------+        |
                         (portifolio_prod)   CrowdSec agent (le security.log + /var/log/nginx)
```

## Papeis dos componentes

| componente | responsabilidade |
|---|---|
| Nginx | TLS, compressao, upgrade WebSocket, rate limit de borda, bloqueio de paths admin |
| Backend | recebe `analytics_data`, valida, persiste no InfluxDB, serve API de consulta + admin LGPD |
| InfluxDB | series temporais de analytics (`page_analytics`, `web_vitals`, `custom_events`) |
| PostgreSQL | **apenas no modo comercial** — clientes, tokens, refresh tokens, quotas, audit log |
| Prometheus | scrape de metricas operacionais do backend e do host |
| Grafana | dashboards de analytics e de operacao |
| CrowdSec | le `security.log` + `/var/log/nginx/`, aplica decisoes em Nginx via bouncer |

## Ordem de deploy via Ansible

1. `base` — pacotes via `dnf`, firewalld, fail2ban, usuario deploy (grupo `wheel`)
2. `docker` — engine + compose do repo oficial CentOS
3. `analytics-stack` — clona repo, sobe backend/InfluxDB/frontend, aplica retencao
4. `nginx` — proxy + certbot (layout `/etc/nginx/conf.d/`)
5. `monitoring` (opt-in) — Prometheus + Grafana
6. `crowdsec` (opt-in) — agente + bouncer Nginx

> OS alvo: **Rocky Linux 9** (RHEL 9). Para Debian/Ubuntu, ver branch `dev`.

`ansible-playbook -i inventory.ini playbook.yml --tags analytics-stack` para re-deploy apenas da app.

## Portas expostas

| porta | servico | exposicao |
|---|---|---|
| 22022 | SSH | publica (firewalld + fail2ban) |
| 80 | Nginx | publica (redireciona para 443) |
| 443 | Nginx | publica |
| 5000 | Backend | **loopback** (`127.0.0.1:5000`) — Nginx publica em `api.dsplayground.com.br` |
| 3000 | Frontend (nginx:alpine servindo bundle Vite) | **loopback** (`127.0.0.1:3000→:80`) — Nginx do host publica no apex `dsplayground.com.br` |
| 8086 | InfluxDB | **loopback** (`127.0.0.1:8086`) — rede docker + nginx em `influx.dsplayground.com.br` |
| 3001 | Grafana | loopback (`127.0.0.1:3001`) — atras de nginx em `grafana.dsplayground.com.br` |
| 9090 | Prometheus | **TODO** ainda `0.0.0.0:9090`, deve virar loopback |
| 9100 | node-exporter | **TODO** ainda `0.0.0.0:9100`, deve virar loopback |

## TLS — Cloudflare Origin Certificate

Desde 2026-04-21 o origin nao usa mais Let's Encrypt. O cert agora e um **Cloudflare Origin Certificate** wildcard (`*.dsplayground.com.br` + apex), validade 15 anos, assinado pela CA privada do CF. Arquivos:

| Arquivo | Dono | Modo |
|---|---|---|
| `/etc/ssl/cloudflare-origin/fullchain.pem` | `root:root` | `0644` |
| `/etc/ssl/cloudflare-origin/privkey.pem` | `root:root` | `0600` |

O CF opera em modo **Full (strict)** — o cert do origin e validado na borda da CF antes de fechar o TLS com o browser. Como a CA do CF nao esta no trust store publico, `openssl s_client` direto no origin da `Verify return code: 21` (comportamento esperado); `ssl_stapling` tambem e silenciosamente ignorado no nginx (warning benigno).

DNS dos subdominios (`dsplayground.com.br`, `api.*`, `grafana.*`, `influx.*`) precisa ficar **proxiado (laranja)** na Cloudflare. Se algum registro estiver cinza (DNS only), o CF nao intermedeia, o cert nao vale pra ele e o TLS quebra pra esse hostname.

Renovacao: nao ha — cert dura ate 2041. Quando trocar, atualizar os dois arquivos em `/etc/ssl/cloudflare-origin/` e reload do nginx.

## Roteamento Nginx

Dois arquivos de vhost em `/etc/nginx/conf.d/`:

| Arquivo | Hostnames | Upstream |
|---|---|---|
| `portifolio.conf` | `dsplayground.com.br` | `127.0.0.1:3000` (frontend — nginx no container servindo dist/) |
|  | `api.dsplayground.com.br` | `127.0.0.1:5000` (backend Flask) |
| `portifolio.monitoring.conf` | `grafana.dsplayground.com.br` | `127.0.0.1:3001` |
|  | `influx.dsplayground.com.br` | `127.0.0.1:8086` |

Socket.IO: o backend monta o blueprint com `url_prefix='/api'`, entao o path real e `/api/socket.io/` — NAO o default `/socket.io/`. O cliente `socket.io-client` tem `path: '/api/socket.io/'` hardcoded em `frontend/src/sdk/WebSocketService.tsx`. Requests WS da forma `wss://api.dsplayground.com.br/api/socket.io/` passam pelo `location /` do vhost da api (upgrade habilitado) e chegam no backend.

Frontend em producao e um bundle estatico (`vite build`) servido por `nginx:alpine` dentro do container `portifolio-frontend` — nao ha dev server exposto. SPA fallback em `docker-nginx.conf` serve `index.html` para qualquer rota nao-estatica. URLs da API sao embutidas no bundle em build time via build args `VITE_API_URL` e `VITE_WEBSOCKET_URL`, vindos do `.env` do compose (gerado pelo Ansible) — alterar esses valores exige rebuild da imagem.

Configuracao do backend: variaveis de runtime moram em `backend/.env` (renderizado por `ark/ansible/roles/analytics-stack/templates/backend.env.j2`). O `docker-compose.yml` consome via `env_file:`, nao ha `environment:` inline. Nunca reintroduzir `FLASK_ENV` ou bucket no bloco `environment:` do compose — regressao direta do incidente dev-em-prod de 2026-04-21.

## Volume `portifolio_backend_keys` (chaves RSA do SDK JWT)

O backend roda como **UID 10001** (ver Dockerfile) e escreve/le `/app/data/keys/sdk_jwt_{private,public}.pem`. Docker cria volumes novos com `root:root`, entao o backend recebe `PermissionError` na primeira geracao das chaves. A role `analytics-stack` garante o chown correto **antes** do `docker compose up` rodando `docker run --rm -v portifolio_backend_keys:/mnt alpine chown -R 10001:10001 /mnt`. Task idempotente — se o volume for recriado (ex.: `down -v`), proximo `ansible-apply` restaura.

## CI / CD

Tres workflows em `.github/workflows/`:

| Workflow | Trigger | Responsabilidade |
|---|---|---|
| `ci.yml` | PR, push em `main` | `docker-compose config`, ansible syntax, frontend lint+test+build, frontend docker build multi-stage, backend lint+test |
| `prod-regression.yml` | push em paths sensiveis + cron diario 03:17 UTC | smoke via curl: debugger Werkzeug, `/console`, rota sem prefixo `/api`, bundle estatico do frontend servido |
| `deploy.yml` | `workflow_run` de CI concluido com sucesso em `main` (tambem `workflow_dispatch`) | CD: SSH na VPS, `git reset --hard origin/main`, `docker compose up -d --build --force-recreate --no-deps backend frontend`, health check |

**Limites do CD automatico:** re-builda apenas `backend` e `frontend` (onde o codigo de app muda). InfluxDB/Postgres nao sao tocados. Mudancas em roles Ansible, nginx do host, monitoring ou crowdsec continuam exigindo `make -f ark/Makefile ansible-apply` manual — SSH na VPS e aplicar. Rationale: mudancas de infra em geral precisam de `sudo`/`become`, envolvem o host fora do docker, e raramente sao frequentes o bastante pra justificar o risco de automacao.

### Secrets necessarios no repositorio (Settings → Secrets → Actions)

| Secret | Conteudo |
|---|---|
| `DEPLOY_HOST` | IP ou hostname da VPS (ex: `vps-15240803.vpsbr-15240803.vpshostgator.com.br`) |
| `DEPLOY_PORT` | Porta SSH (atual: `22022`) |
| `DEPLOY_USER` | Usuario (`deploy`) |
| `DEPLOY_SSH_KEY` | Chave privada PEM dedicada ao CD (NAO reutilizar a chave do deploy humano) |

### Provisionamento da deploy key

Na VPS, como `deploy`:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/github_cd -C 'github-actions-cd' -N ''
cat ~/.ssh/github_cd.pub >> ~/.ssh/authorized_keys
# Opcional: restringir a chave no authorized_keys
#   from="GITHUB_IP_RANGE",command="cd /opt/portifolio && ...",no-pty,no-port-forwarding ssh-ed25519 AAAA...
cat ~/.ssh/github_cd   # copiar a private key pra colar no secret DEPLOY_SSH_KEY
shred -u ~/.ssh/github_cd
```

A chave privada vai 1 vez para o secret do GitHub e some do disco; a publica fica no `authorized_keys` do `deploy`. **Nao usar a mesma chave que voce usa no laptop** — rotacao ficaria acoplada.

### Rollback manual

O CD nao tem rollback automatico. Em caso de deploy ruim:

```bash
ssh -p 22022 deploy@HOST
cd /opt/portifolio
git reset --hard <sha-anterior>
docker compose up -d --build --force-recreate --no-deps backend frontend
```

## Segredos

- `INFLUXDB_TOKEN`, `SECRET_KEY`, `ADMIN_API_TOKEN`, credenciais Postgres — no `group_vars/all.yml` criptografado com Ansible Vault.
- Nunca versionar `all.yml` em claro — `.example.yml` e o unico que entra no git.

## Owner:group — mapa operacional

Grupo compartilhado **`analytics` GID 10001** e a ponte entre host e containers para bind-mounts funcionarem sem UID mismatch. Criado pela role `base` no host e pelos Dockerfiles do backend/frontend.

| Local | User | Grupo primario | Grupos extras |
|---|---|---|---|
| Host — operacao | `deploy` | `deploy` | `wheel`, `docker`, **`analytics`** |
| Container `backend` | `app` (UID 10001) | `analytics` (GID 10001) | — |
| Container `frontend` | `nginx` (UID 101, image nginx:alpine) | `nginx` | — |
| Container `influxdb` | `influxdb` (UID 1000, image) | `influxdb` | — |
| Container `prometheus` / `node-exporter` | `nobody` | `nogroup` | — |
| Container `grafana` | `grafana` (UID 472) | `grafana` | — |
| Container `crowdsec` | `root` | `root` | (precisa ler logs de varios paths) |
| Host — nginx master | `root` | `root` | — |
| Host — nginx workers | `nginx` | `nginx` | — |

| Arquivo/diretorio | Dono | Modo | Obs |
|---|---|---|---|
| `/opt/portifolio/` | `deploy:analytics` | `0750` | outros nao listam |
| `/opt/portifolio/backend/` | `deploy:analytics` | `2770` | SGID: novos arquivos herdam grupo `analytics` |
| `/opt/portifolio/backend/.env` | `deploy:analytics` | `0640` | grupo le, outros nada |
| `/opt/portifolio/backend/security.log` | `deploy:analytics` | `0660` | grupo pode escrever — container backend (GID 10001) append ok |
| `/opt/portifolio/ark/monitoring/.env` | `deploy:analytics` | `0640` | Grafana + InfluxDB token |
| `/etc/nginx/snippets/ssl.conf` | `root:root` | `0644` | |
| `/etc/nginx/conf.d/portifolio.conf` | `root:root` | `0644` | layout Rocky/RHEL |
| `/etc/letsencrypt/live/<dominio>/privkey.pem` | `root:root` | `0600` | certbot controla |
| `/var/run/docker.sock` | `root:docker` | `0660` | `deploy` entra pelo grupo `docker` |
| `/var/log/nginx/portifolio.*.log` | `nginx:nginx` | default | |

Regra geral: **user dedicado** por superficie (app/node/deploy/nginx/root), **grupo `analytics`** como denominador comum onde processos precisam compartilhar arquivos atraves de bind-mount.

## Observabilidade em producao

Logs: estruturados no formato `evento=<nome> chave=valor`. Estagios principais:

- `conectado` / `desconectado` — ciclo de socket
- `recebido` / `validado` / `rejeitado` — pipeline de ingestao
- `persistido_temporal` / `persistido_webvital` / `persistido_customevent`
- `erro_persistencia` — falha de InfluxDB (nao derruba ingestao)
- `backpressure` — fila do executor > 50 itens
- `acesso_bloqueado` — middleware de seguranca bloqueou IP
- `[ADMIN-AUDIT]` — qualquer chamada aos endpoints `/admin/*`

`security.log` tem rotacao automatica (10 MB x 5 arquivos). Monte em volume dedicado em producao.

Metricas: endpoint `/metrics` no backend e follow-up (`docs/plano-backend.md` D.2). Quando existir, o Prometheus ja esta configurado para fazer scrape em `backend:5000/metrics`.

## Backup e restore

Ver secao "Backup e Restore do InfluxDB" em `docs/backend/DEPLOY-GUIDE.md`.

Para PostgreSQL (quando entrar no modo comercial): `pg_dump` diario via cron sidecar, retencao 30 dias. A definir quando o schema estabilizar.
