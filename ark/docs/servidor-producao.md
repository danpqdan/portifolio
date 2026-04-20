# Arquitetura de servidor — producao

## Visao geral

```
          Internet
             |
             v
     +---------------+
     |     Nginx     |  TLS, rate limit, /admin allowlist, logs acesso
     +-------+-------+
             |
             v
     +---------------+
     |    Backend    |  Flask + Socket.IO (Gunicorn + eventlet)
     |   (container) |  valida -> servico_ingestao -> InfluxDB
     +-------+-------+
             |
         +---+----+
         |        |
         v        v
   +---------+  +------------+       Prometheus  <-- Grafana
   |InfluxDB |  | PostgreSQL |          ^
   +---------+  +------------+          |
   (series    (tokens, clientes,        |
   temporais) refresh, auditoria)      CrowdSec agent (le logs)
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
| 5000 | Backend | **loopback** — so Nginx acessa |
| 8086 | InfluxDB | interna (rede docker) |
| 9090 | Prometheus | interna (expor via Grafana) |
| 3000 | Grafana | atras de auth adicional |

## Segredos

- `INFLUXDB_TOKEN`, `SECRET_KEY`, `ADMIN_API_TOKEN`, credenciais Postgres — no `group_vars/all.yml` criptografado com Ansible Vault.
- Nunca versionar `all.yml` em claro — `.example.yml` e o unico que entra no git.

## Owner:group — mapa operacional

Grupo compartilhado **`analytics` GID 10001** e a ponte entre host e containers para bind-mounts funcionarem sem UID mismatch. Criado pela role `base` no host e pelos Dockerfiles do backend/frontend.

| Local | User | Grupo primario | Grupos extras |
|---|---|---|---|
| Host — operacao | `deploy` | `deploy` | `wheel`, `docker`, **`analytics`** |
| Container `backend` | `app` (UID 10001) | `analytics` (GID 10001) | — |
| Container `frontend` | `node` (UID 1000) | `node` | **`analytics`** |
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
