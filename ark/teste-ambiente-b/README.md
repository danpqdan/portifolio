# Ambiente B — VM Ubuntu real via Multipass

VM Ubuntu 22.04 LTS rodando localmente via Multipass. Diferenca para Ambiente A: tem **systemd real**, **kernel real**, **rede de host real**. Permite validar Docker rodando, UFW aplicando regras, fail2ban com jails, e a stack `analytics-stack` (backend + InfluxDB) subindo de verdade.

## O que valida (alem do que A ja cobre)

- UFW + fail2ban com regras reais (`firewall` tag deixa de ser pulada)
- Docker engine instalado e funcional
- `analytics-stack` rodando: backend Flask + Socket.IO + InfluxDB sobem em containers dentro da VM
- Health check do backend respondendo via loopback (`/health/app`)
- Idempotencia em apply real

## O que continua fora

- Certbot/Let's Encrypt real (precisa DNS publico — vai pra Ambiente C com VM com IP publico)
- CrowdSec com bouncer Nginx em producao (subimos o agente, mas sem trafego real e dificil exercer cenarios)

## Pre-requisitos

- Multipass instalado no Windows. Verificar:
  ```powershell
  & "C:\Program Files\Multipass\bin\multipass.exe" version
  ```
- ~2 GB de RAM livre, ~10 GB de disco para a VM.

## Rodar (Windows PowerShell)

Os atalhos abaixo assumem que o repo esta em `D:\portifolio` e que `multipass` ja esta acessivel — pelo PATH ou pelo path absoluto `C:\Program Files\Multipass\bin\multipass.exe`. Use o que funcionar no seu shell.

```powershell
# Atalho de path (use se o PATH ainda nao recarregou)
$mp = "C:\Program Files\Multipass\bin\multipass.exe"

# 1. Subir VM (~2-3 min na primeira vez baixando a imagem)
& $mp launch 22.04 --name ark-teste-b --cpus 2 --memory 2G --disk 10G

# 2. Montar o repo dentro da VM em /portifolio
& $mp mount D:\portifolio ark-teste-b:/portifolio

# 3. Instalar Ansible + collection community.docker
& $mp exec ark-teste-b -- sudo apt-get update
& $mp exec ark-teste-b -- sudo apt-get install -y ansible python3-docker
& $mp exec ark-teste-b -- ansible-galaxy collection install community.docker

# 4. Rodar o playbook completo (firewall ON, certbot OFF)
& $mp exec ark-teste-b -- sudo bash -c "ANSIBLE_ROLES_PATH=/portifolio/ark/ansible/roles ansible-playbook -i /portifolio/ark/teste-ambiente-a/inventory-localhost.ini /portifolio/ark/teste-ambiente-b/playbook-teste-b.yml --skip-tags tls"

# 5. Verificar que o backend subiu na VM
& $mp exec ark-teste-b -- curl -fsS http://localhost:5000/health/app

# 6. Idempotencia
& $mp exec ark-teste-b -- sudo bash -c "ANSIBLE_ROLES_PATH=/portifolio/ark/ansible/roles ansible-playbook -i /portifolio/ark/teste-ambiente-a/inventory-localhost.ini /portifolio/ark/teste-ambiente-b/playbook-teste-b.yml --skip-tags tls"

# 7. Limpar
& $mp delete ark-teste-b
& $mp purge
```

## Diferencas do `playbook-teste-b.yml`

Reusa `group_vars/all.yml` e o `inventory-localhost.ini` do Ambiente A (sao identicos), mas:

- **NAO pula `firewall`** — UFW e fail2ban devem aplicar de verdade dentro da VM.
- **Inclui `analytics-stack`** — nao depende de `--skip-tags`, mas precisa que o Docker esteja instalado (o role `docker` cuida disso, vem antes na ordem).
- **`repo_url=file:///portifolio`** — usa o mount em vez de `git clone` do GitHub. Permite testar sem expor a chave SSH na VM.

## Resultado esperado

```
PLAY RECAP ******
localhost  : ok=N  changed=N  unreachable=0  failed=0  skipped=M  rescued=0  ignored=0
```

E em seguida `curl /health/app` retorna `{"status": "healthy", "detalhe": {...}}`.

## Limpeza

A VM consome 2 GB RAM enquanto rodando. Sempre `multipass stop ark-teste-b` quando nao estiver testando, e `multipass delete + purge` quando terminar de vez.
