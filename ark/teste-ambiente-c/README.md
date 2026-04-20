# Ambiente C — VM Oracle VirtualBox manual

VM Ubuntu 22.04 LTS provisionada **manualmente** no Oracle VirtualBox, sem Vagrant. Mais proxima da experiencia real de provisionar um servidor zerado em cloud (DigitalOcean, AWS, etc.). E aqui que voce valida o **fluxo completo de producao**, incluindo certbot real (se tiver dominio publico apontando) e CrowdSec com Nginx vivo.

Este ambiente e voce quem dirige — eu te guio passo a passo, voce executa pelo VirtualBox/PowerShell.

## Pre-requisitos

- VirtualBox 7.x instalado em `D:\oracle_vm\` (ja temos)
- ISO Rocky-8.10-x86_64-minimal **ou** Ubuntu 22.04 (recomendado Ubuntu — os roles Ansible sao apt-based; usar Rocky exige refator pra dnf/yum)
- ~2 GB RAM e ~15 GB disco em D:
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

# Disco virtual 15 GB
& $vbox createmedium disk --filename "D:\virtualbox-vms\$nome\$nome.vdi" --size 15360 --format VDI

# Controllers SATA (disco) e IDE (DVD)
& $vbox storagectl $nome --name "SATA" --add sata --controller IntelAhci
& $vbox storageattach $nome --storagectl "SATA" --port 0 --device 0 --type hdd `
    --medium "D:\virtualbox-vms\$nome\$nome.vdi"

& $vbox storagectl $nome --name "IDE" --add ide
& $vbox storageattach $nome --storagectl "IDE" --port 0 --device 0 --type dvddrive --medium $iso

# Port forward 22 (SSH) -> 2222 do host, 5000 (backend) -> 5000, 80, 443
& $vbox modifyvm $nome --natpf1 "ssh,tcp,127.0.0.1,2222,,22"
& $vbox modifyvm $nome --natpf1 "backend,tcp,127.0.0.1,5000,,5000"
& $vbox modifyvm $nome --natpf1 "http,tcp,127.0.0.1,8080,,80"
& $vbox modifyvm $nome --natpf1 "https,tcp,127.0.0.1,8443,,443"
```

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
7. Storage: use entire disk, set up LVM nao
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

## Passo 5 — Subir o repo na VM

Sem mount magico do Vagrant — voce escolhe:

**Opcao A: SCP (mais simples)**
```powershell
scp -i "$env:USERPROFILE\.ssh\ark-teste-c" -P 2222 -r D:\portifolio deploy@127.0.0.1:/tmp/
ssh -i "$env:USERPROFILE\.ssh\ark-teste-c" -p 2222 deploy@127.0.0.1 "sudo mv /tmp/portifolio /opt/ && sudo chown -R deploy:deploy /opt/portifolio"
```

**Opcao B: git clone via HTTPS** (mais real)
```powershell
ssh -i "$env:USERPROFILE\.ssh\ark-teste-c" -p 2222 deploy@127.0.0.1 "sudo apt-get install -y git && sudo git clone https://github.com/danpqdan/portifolio.git /opt/portifolio && sudo chown -R deploy:deploy /opt/portifolio"
```

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
