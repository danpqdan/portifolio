# Ansible

Provisionamento automatizado de um servidor Linux zerado (Debian/Ubuntu) para rodar o portifolio analytics em producao. O playbook assume acesso SSH com chave + usuario sudoer.

## Preparar

```bash
cp inventory.example.ini inventory.ini
# edite inventory.ini com o IP/dominio e o usuario SSH
cp group_vars/all.example.yml group_vars/all.yml
# edite group_vars/all.yml com segredos ou use Ansible Vault
```

## Rodar

```bash
# dry-run (nao muda nada, mostra o diff)
ansible-playbook -i inventory.ini playbook.yml --check --diff

# aplica
ansible-playbook -i inventory.ini playbook.yml
```

Pelo Makefile da raiz: `make ansible-check` e `make ansible-apply`.

## O que instala

| role | responsabilidade |
|---|---|
| `base` | pacotes basicos, UFW (firewall), fail2ban, locale UTF-8 |
| `docker` | Docker Engine + Compose plugin, grupo docker para o deploy_user |
| `analytics-stack` | clona o repo, `docker compose up -d`, aplica retencao no InfluxDB |
| `nginx` | instala Nginx, aplica `ark/nginx/*.conf`, configura certbot |
| `crowdsec` | agente CrowdSec + bouncer para Nginx |
| `monitoring` | Prometheus + Grafana via `docker-compose.monitoring.yml` |

Cada role tem seu proprio `tasks/main.yml` e defaults em `defaults/main.yml`.

## Ordem interna do playbook

1. `base` (hardening + firewall abre 22/80/443)
2. `docker`
3. `analytics-stack` (app sobe primeiro, monitoring conecta depois)
4. `nginx` (proxy reverso + TLS)
5. `monitoring` (stack separada, opt-in via tag `--tags monitoring`)
6. `crowdsec` (opt-in via tag `--tags crowdsec`)

Para rodar so uma role: `ansible-playbook -i inventory.ini playbook.yml --tags analytics-stack`.

## Segredos

- **Nunca comitar** `inventory.ini` real nem `group_vars/all.yml`.
- Para producao, use Ansible Vault: `ansible-vault encrypt group_vars/all.yml` e rode com `--ask-vault-pass`.
- Tokens esperados em `group_vars/all.yml`:
  - `influxdb_token`
  - `influxdb_org`
  - `influxdb_bucket`
  - `admin_api_token`
  - `grafana_admin_password`
  - `flask_secret_key`
