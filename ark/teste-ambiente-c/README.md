# Ambiente C — VM Oracle VirtualBox manual

VM Ubuntu 22.04 LTS provisionada **manualmente** no Oracle VirtualBox, sem Vagrant. Mais proxima da experiencia real de provisionar um servidor zerado em cloud (DigitalOcean, AWS, etc.). E aqui que voce valida o **fluxo completo de producao**, incluindo certbot real (se tiver dominio publico apontando) e CrowdSec com Nginx vivo.

Este ambiente e voce quem dirige — eu te guio passo a passo, voce executa pelo VirtualBox/PowerShell.

## Modelo de permissoes (hardening ja aplicado no repo)

Os containers rodam **non-root** e compartilham um grupo `analytics` com GID fixa `10001`:

- Host: role `base` cria o grupo `analytics` (GID 10001) e adiciona `deploy` nele.
- Containers: `backend` roda como `app:analytics (10001:10001)`, `frontend` como `node (1000)` com grupo suplementar `analytics (10001)`.
- `/opt/portifolio` fica `deploy:analytics 0750`; `backend/` tem SGID (`2770`) para herdar o grupo em novos arquivos; `.env` fica `0640`; `security.log` fica `0660`.

A tabela completa vive em `ark/docs/servidor-producao.md`. Na validacao (Passo 7) abaixo conferimos se tudo ficou como esperado.

## Pre-requisitos

- VirtualBox 7.x instalado em `D:\oracle_vm\` (ja temos)
- ISO Rocky-8.10-x86_64-minimal **ou** Ubuntu 22.04 (recomendado Ubuntu — os roles Ansible sao apt-based; usar Rocky exige refator pra dnf/yum)
- **~2 GB RAM e ~25 GB disco em D:** (aprendido na pratica — 15 GB nao sobrevive ao build dos 3 containers + cache do buildx; o installer Ubuntu LVM ainda deixa ~50% do VG como espaco livre)
- (Opcional, para certbot real) Dominio publico com A-record apontando para o IP publico que a VM vai expor

## Passo 1 — Baixar a ISO Ubuntu (pular se for usar a Rocky que ja tem)

Se preferir Ubuntu (compativel com os roles Ansible existentes):

```powershell
# Em PowerShell, baixe a ISO Server LTS:
Invoke-WebRequest `
  -Uri https://releases.ubuntu.com/22.04/ubuntu-22.04.5-live-server-amd64.iso `
  -OutFile D:\oracle_vm\isos\ubuntu-22.04.5-live-server-amd64.iso
```

Se for usar a Rocky 8.10 que voce ja tem em Documentos, anote o caminho exato dela — vai virar a ISO de boot.

## Passo 2 — Criar a VM via VBoxManage (CLI, deterministico)

```powershell
$vbox = "D:\oracle_vm\VBoxManage.exe"
$nome = "ark-teste-c"
$iso  = "D:\oracle_vm\isos\ubuntu-22.04.5-live-server-amd64.iso"  # ou caminho da Rocky

# Criar VM
& $vbox createvm --name $nome --ostype Ubuntu_64 --register

# Hardware: 2 CPU, 2 GB RAM, audio off, USB off (servidor)
& $vbox modifyvm $nome --cpus 2 --memory 2048 --vram 16 `
    --boot1 dvd --boot2 disk --boot3 none --boot4 none `
    --audio-driver none --usb off `
    --nic1 nat --nictype1 virtio `
    --nic2 hostonly --hostonlyadapter2 "VirtualBox Host-Only Ethernet Adapter"
# (se nao tiver host-only adapter ainda, criar com: & $vbox hostonlyif create)

# Disco virtual 25 GB (1 GB do installer + 9-10 GB Ubuntu base + 13 GB Docker images/cache)
& $vbox createmedium disk --filename "D:\virtualbox-vms\$nome\$nome.vdi" --size 25600 --format VDI

# Controllers SATA (disco) e IDE (DVD)
& $vbox storagectl $nome --name "SATA" --add sata --controller IntelAhci
& $vbox storageattach $nome --storagectl "SATA" --port 0 --device 0 --type hdd `
    --medium "D:\virtualbox-vms\$nome\$nome.vdi"

& $vbox storagectl $nome --name "IDE" --add ide
& $vbox storageattach $nome --storagectl "IDE" --port 0 --device 0 --type dvddrive --medium $iso

# Port forwards: SSH (2222), backend (5000), frontend (3000), nginx http (8080) e https (8443)
& $vbox modifyvm $nome --natpf1 "ssh,tcp,127.0.0.1,2222,,22"
& $vbox modifyvm $nome --natpf1 "backend,tcp,127.0.0.1,5000,,5000"
& $vbox modifyvm $nome --natpf1 "frontend,tcp,127.0.0.1,3000,,3000"
& $vbox modifyvm $nome --natpf1 "http,tcp,127.0.0.1,8080,,80"
& $vbox modifyvm $nome --natpf1 "https,tcp,127.0.0.1,8443,,443"
```

> **Por que 25 GB e nao 15**: na primeira execucao, build dos 3 containers (backend ~919 MB, frontend ~1.45 GB, influxdb 2.7) + cache de buildx + base Ubuntu enchem 9.6 GB de 9.8 GB usados pelo LV padrao do installer. Frontend morre com `ENOSPC: no space left on device`. 25 GB de VDI deixa folga real.

> **Esqueci de adicionar uma porta?** Pode adicionar com a VM rodando: `& $vbox controlvm ark-teste-c natpf1 "nome-regra,tcp,127.0.0.1,<host>,,<vm>"`.

## Passo 3 — Iniciar a VM e instalar o Ubuntu

```powershell
& $vbox startvm $nome --type gui
```

A janela do VirtualBox abre com o instalador. Siga:

1. Idioma: English (mais consistente com docs)
2. Keyboard: Portuguese (Brazil)
3. Type of install: Ubuntu Server (minimized)
4. Network: dejar DHCP em ambas as NICs
5. Proxy: vazio
6. Mirror: default
7. Storage: **escolha "Custom storage layout"** ou, se for "use entire disk", **edite o LV** para usar 100% do VG (default deixa metade livre — voce vai bater em `ENOSPC` no docker compose). Se ja instalou com default, da pra estender depois — ver Troubleshooting.
8. Profile setup:
   - Your name: deploy
   - Server name: ark-teste-c
   - Username: deploy
   - Password: (algo memoravel — esta VM e descartavel)
9. Install OpenSSH server: **SIM** (importante)
10. Featured server snaps: nenhum
11. Aguardar instalacao + reboot

Depois que reiniciar, faca login e desligue para remover a ISO:

```powershell
& $vbox controlvm $nome poweroff
& $vbox storageattach $nome --storagectl "IDE" --port 0 --device 0 --type dvddrive --medium none
& $vbox startvm $nome --type headless
```

## Passo 4 — Acessar via SSH e copiar a chave

```powershell
# Gerar chave se ainda nao tiver
ssh-keygen -t ed25519 -f "$env:USERPROFILE\.ssh\ark-teste-c" -N '""'

# Copiar para a VM (vai pedir a senha do user deploy)
type "$env:USERPROFILE\.ssh\ark-teste-c.pub" | ssh -p 2222 deploy@127.0.0.1 "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"

# Testar
ssh -i "$env:USERPROFILE\.ssh\ark-teste-c" -p 2222 deploy@127.0.0.1 "uname -a"
```

## Passo 5 — Subir o repo em `/opt/portifolio`

> **Importante**: o playbook usa `repo_dir: /opt/portifolio` por default. Se o repo ficar em outro lugar (ex.: `/tmp/portifolio`), o `analytics-stack` nao acha e varias tasks falham ou escrevem no lugar errado. Garanta que o destino final e `/opt/portifolio` antes do Passo 6.

Escolha uma das opcoes. **As duas precisam dos dois passos** (copiar + mover/chown).

**Opcao A — SCP** (mais simples; do host Windows, PowerShell):

```powershell
# 1. copiar repo pra /tmp/portifolio dentro da VM
scp -i "$env:USERPROFILE\.ssh\ark-teste-c" -P 2222 -r D:\portifolio deploy@127.0.0.1:/tmp/

# 2. mover para /opt/portifolio + ajustar dono (dois comandos separados pra nao travar no prompt de senha)
ssh -i "$env:USERPROFILE\.ssh\ark-teste-c" -p 2222 deploy@127.0.0.1 "sudo mv /tmp/portifolio /opt/portifolio"
ssh -i "$env:USERPROFILE\.ssh\ark-teste-c" -p 2222 deploy@127.0.0.1 "sudo chown -R deploy:deploy /opt/portifolio"
```

**Opcao B — git clone via HTTPS** (mais real; dentro da VM ou via ssh):

```powershell
ssh -i "$env:USERPROFILE\.ssh\ark-teste-c" -p 2222 deploy@127.0.0.1 "sudo apt-get install -y git && sudo git clone https://github.com/danpqdan/portifolio.git /opt/portifolio && sudo chown -R deploy:deploy /opt/portifolio"
```

**Validacao rapida do Passo 5** (dentro da VM):

```bash
ls -ld /opt/portifolio           # deve existir com dono deploy:deploy
ls /opt/portifolio/ark/ansible/  # deve listar playbook.yml e roles/
```

Se ver `/tmp/portifolio` mas nao `/opt/portifolio`, so correr:

```bash
sudo mv /tmp/portifolio /opt/portifolio
sudo chown -R deploy:deploy /opt/portifolio
```

(Depois o proprio playbook ajusta o dono para `deploy:analytics` no role `analytics-stack`.)

## Passo 6 — Provisionar com Ansible

Dentro da VM:

```bash
# Atualizar Ansible (apt traz versao antiga)
sudo apt-get update
sudo apt-get install -y python3-pip
sudo pip3 install --upgrade 'ansible>=8'
ansible-galaxy collection install community.docker

# Criar inventario com SSH localhost
cat > /tmp/inventory-c.ini <<'EOF'
[analytics]
localhost ansible_connection=local

[analytics:vars]
ambiente=production
dominio=ark-c.localhost
letsencrypt_email=teste@example.com
EOF

# Criar group_vars com segredos reais (sem placeholders!)
sudo mkdir -p /etc/ark
sudo tee /etc/ark/all.yml > /dev/null <<EOF
deploy_user: deploy
repo_url: file:///opt/portifolio
repo_dir: /opt/portifolio
repo_branch: main
flask_secret_key: $(python3 -c "import secrets; print(secrets.token_urlsafe(32))")
cors_origins: ["http://localhost:3000"]
influxdb_url: http://influxdb:8086
influxdb_token: $(openssl rand -hex 32)
influxdb_org: zen
influxdb_bucket: portifolio_prod
influxdb_enabled: true
influxdb_retencao_dias: 30
admin_api_token: $(python3 -c "import secrets; print(secrets.token_urlsafe(32))")
grafana_admin_user: admin
grafana_admin_password: $(python3 -c "import secrets; print(secrets.token_urlsafe(16))")
ssh_port: 22
ufw_allow_ports: [22, 80, 443]
habilitar_crowdsec: true
habilitar_monitoring: true
EOF

# Rodar o playbook real (sem skip de firewall! Nginx com cert real se DNS ok)
cd /opt/portifolio
sudo ansible-playbook \
  -i /tmp/inventory-c.ini \
  -e @/etc/ark/all.yml \
  ark/ansible/playbook.yml \
  --skip-tags tls   # remova esse skip se tiver dominio publico apontando
```

## Passo 7 — Validar

Do host Windows (port forward 5000 -> 5000):

```powershell
# Backend
Invoke-RestMethod http://127.0.0.1:5000/health/app
Invoke-RestMethod http://127.0.0.1:5000/health/influxdb

# Nginx (port forward 80 -> 8080)
curl http://127.0.0.1:8080
```

Dentro da VM, conferir:

```bash
sudo docker ps                      # frontend + backend + influxdb rodando
sudo systemctl status nginx         # active (running)
sudo systemctl status fail2ban      # active (running)
sudo ufw status                     # 22/80/443 ALLOW, deny incoming
sudo cscli metrics                  # CrowdSec saudavel
sudo tail -f /opt/portifolio/backend/security.log  # logs estruturados evento=...
```

### Validacao do hardening (owner:group)

```bash
# Host — grupo analytics GID 10001 existe e deploy participa
getent group analytics
# Esperado: analytics:x:10001:deploy

id deploy
# Esperado: uid=1000(deploy) gid=1000(deploy) groups=1000(deploy),27(sudo),10001(analytics),<gid-docker>(docker)

# Ownership do /opt/portifolio
ls -ld /opt/portifolio /opt/portifolio/backend /opt/portifolio/backend/.env
# Esperado:
#   /opt/portifolio                       drwxr-x--- deploy analytics
#   /opt/portifolio/backend               drwxrws--- deploy analytics   (SGID = 's' no grupo)
#   /opt/portifolio/backend/.env          -rw-r----- deploy analytics   (0640)

# Users dentro dos containers
sudo docker exec portifolio-backend id
# Esperado: uid=10001(app) gid=10001(analytics) groups=10001(analytics)

sudo docker exec portifolio-frontend id
# Esperado: uid=1000(node) gid=1000(node) groups=1000(node),10001(analytics)

# security.log pode ser escrito pelo container backend (grupo 10001)
sudo docker exec portifolio-backend sh -c 'echo teste >> /app/security.log && tail -n1 /app/security.log'
# Esperado: `teste` (sem permission denied)
```

## Passo 8 — Cenarios de validacao adicionais

Coisas que so fazem sentido em Ambiente C:

1. **Certbot real** — apontar A-record `ark-c.<seu-dominio>` para o IP publico, abrir 80/443 no firewall do roteador, rodar sem `--skip-tags tls`. Cert sai de verdade.
2. **CrowdSec em acao** — disparar 6 chamadas a `/admin/analytics/sessao/x` com token errado em 1 minuto; `cscli decisions list` mostra o ban automatico.
3. **Backup InfluxDB** — `sudo docker compose exec influxdb influx backup /tmp/backup --token $TOKEN` e validar que o tar.gz tem dados.
4. **Multipla conexao Socket.IO** — abrir o frontend em duas abas, gerar eventos, verificar nos logs `evento=conectado` com sids diferentes e que cada um recebe so o ack proprio.

## Passo 9 — Limpeza

Quando terminar:

```powershell
$vbox = "D:\oracle_vm\VBoxManage.exe"
& $vbox controlvm ark-teste-c poweroff
& $vbox unregistervm ark-teste-c --delete
```

## O que e ganho com C que B nao tem

| capacidade | B (Vagrant) | C (manual) |
|---|---|---|
| systemd real | sim | sim |
| UFW funcionando | sim | sim |
| docker compose | sim | sim |
| **certbot real** | nao (sem DNS) | **sim, se DNS ok** |
| **CrowdSec disparando bans reais** | parcial | **sim** |
| **port forwarding controlado** | abstrato (Vagrant) | **explicito (VBoxManage)** |
| simulacao de provisionar de zero | parcial (box pre-configurada) | **completa (ISO + install)** |
| reproducao manual de incidentes | dificil | **direta** |

Ambiente C e o que mais se aproxima de "entregar a um SRE pra ele provisionar". Os passos acima sao executaveis em qualquer cloud trocando "VBoxManage" por "Terraform/aws-cli" e "ssh -p 2222 deploy@127.0.0.1" pelo IP publico real.

## Troubleshooting

Surpresas reais que apareceram durante a primeira execucao deste ambiente — todas viraram fix no repo, mas se voce esta seguindo um snapshot antigo ou subiu a VM com defaults diferentes, pode bater nelas.

### A — `locale_gen` falha com "package locales missing"

Sintoma: a primeira task da role `base` apos `apt install` quebra com:
```
"/var/lib/locales/supported.d/ and /etc/locale.gen are missing. Is the package "locales" installed?"
```

Causa: Ubuntu Server "minimized" nao traz o pacote `locales`. Foi adicionado a lista em `ark/ansible/roles/base/tasks/main.yml`. Workaround para repos antigos:
```bash
sudo apt-get install -y locales rsync openssl
```
Depois rerun do playbook.

### B — Repo em `/tmp/portifolio` em vez de `/opt/portifolio`

Sintoma: `cd /opt/portifolio` retorna `No such file or directory`. Playbook acha tudo, mas as roles esperam o repo no caminho default.

Causa: o SCP do Passo 5 cai em `/tmp/portifolio` e o `mv` precisa ser explicito. Fix:
```bash
sudo mv /tmp/portifolio /opt/portifolio
sudo chown -R deploy:deploy /opt/portifolio
```

### C — `Aguardar backend responder health` falha mesmo com backend subindo

Sintoma: `PLAY RECAP failed=1` na task de health, mas `curl http://127.0.0.1:5000/health/app` no shell funciona.

Causa: build + pull das imagens (especialmente `influxdb:2.7`) na primeira execucao consome quase todo o timeout antigo (60s). Aumentado para 120s em `ark/ansible/roles/analytics-stack/tasks/main.yml` (`retries: 40 delay: 3`). Para um host muito lento, pode subir mais.

### D — Frontend `ENOSPC: no space left on device`

Sintoma: backend e influxdb sobem, frontend crash loopa com `Error: ENOSPC: no space left on device, mkdir '/app/node_modules/.vite-temp'`.

Causa: VDI de 15 GB + LVM padrao do installer (so usa metade do VG) deixa apenas ~3 GB livres apos build dos containers. Vite tenta criar arquivo de bundle e falha.

Fix permanente (na criacao da VM): use 25 GB e escolha LVM com 100% do VG.

Fix em VM ja instalada (estende o LV pro restante do VG):
```bash
sudo vgs                                                          # ver espaco livre no VG
sudo lvextend -l +100%FREE /dev/mapper/ubuntu--vg-ubuntu--lv      # alocar tudo no LV
sudo resize2fs /dev/mapper/ubuntu--vg-ubuntu--lv                  # crescer o filesystem
df -h /                                                            # confirmar 13+ GB
```
Depois:
```bash
cd /opt/portifolio
sudo docker volume rm portifolio_frontend_node_modules 2>/dev/null
sudo docker compose up -d frontend
```

### E — `localhost:3000` nao abre no host

Sintoma: dentro da VM `curl http://127.0.0.1:3000` funciona, no host Windows nao.

Causa: port-forward NAT do VirtualBox nao tinha a regra para 3000. Fix em runtime (sem parar a VM):
```powershell
& "D:\oracle_vm\VBoxManage.exe" controlvm ark-teste-c natpf1 "frontend,tcp,127.0.0.1,3000,,3000"
```
A versao atualizada do Passo 2 ja inclui esta regra.

### F — `Invoke-RestMethod: command not found`

Sintoma: aparece dentro do shell da VM Linux.

Causa: `Invoke-RestMethod` e cmdlet do PowerShell (host Windows). Dentro da VM use `curl`. As secoes do README marcadas "Do host Windows (PowerShell)" rodam **fora** da VM; "Dentro da VM" rodam **dentro**, via SSH ou console.

### G — `community.docker.docker_compose_v2` nao funciona com Ansible 2.10

Sintoma: `Could not find imported module support code for ... docker_compose_v2`.

Causa: o pacote `ansible` que vem do `apt` no Ubuntu 22.04 e a versao 2.10, antiga demais para a collection `community.docker` 5.x. Solucao:
```bash
sudo apt-get install -y python3-pip
sudo pip3 install --upgrade 'ansible>=8'
ansible-galaxy collection install community.docker --force
```

Ja esta no Passo 6, mas se voce pulou, e por isso que Ansible nao acha o modulo.

### H — `git clone file:///portifolio` recusa por "dubious ownership"

Sintoma: git 2.35+ recusa clonar de repo cujo dono e diferente do user.

Causa: bind-mount Vagrant ou outro mount com UID diferente. Fix (somente para teste):
```bash
sudo git config --system --add safe.directory '*'
```

So aparece no Ambiente B. No C, voce ja copia para `/opt/portifolio` chown `deploy`, entao git roda sem essa friccao.

### I — Sudo pede senha em meio a sequencia de comandos

Cole `sudo -v` antes do bloco de validacoes — o sudo cacheia credenciais por ~15 min e os proximos `sudo` rodam sem prompt.

### Lembrete final

Se algum item da tabela do Passo 7 ("Validacao do hardening") falhar, e diagnostico direto de qual role nao aplicou. Reanalise a tarefa correspondente em `ark/ansible/roles/<role>/tasks/main.yml`.
