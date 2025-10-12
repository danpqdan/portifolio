# Portfólio Completo - Guia de Deploy para OLS (Oracle Linux Server)

Este guia fornece instruções completas para fazer o deploy da aplicação de portfólio em um servidor Oracle Linux Server (OLS), servindo tanto o backend Flask quanto o frontend React.

## 📋 Visão Geral da Aplicação

- **Backend**: Flask com SocketIO, integração InfluxDB, sistema de segurança robusto
- **Frontend**: React com Vite, React Spring animations, design responsivo
- **Banco de Dados**: InfluxDB 2.7 (org: 'zen', bucket: 'portifolio')
- **Servidor**: Oracle Linux Server com Nginx como proxy reverso

## 🚀 Pré-requisitos do Servidor

### Dependências do Sistema
```bash
# Atualizar sistema
sudo dnf update -y

# Instalar Python 3.11+
sudo dnf install python3.11 python3.11-pip python3.11-venv -y

# Instalar Node.js 18+ e npm
sudo dnf install nodejs npm -y

# Instalar Nginx
sudo dnf install nginx -y

# Instalar Git
sudo dnf install git -y

# Ferramentas de desenvolvimento
sudo dnf groupinstall "Development Tools" -y
```

### Verificar Versões
```bash
python3.11 --version  # Python 3.11+
node --version         # Node.js 18+
npm --version          # npm 9+
nginx -v              # Nginx 1.20+
```

## 📦 Configuração do Backend Flask

### 1. Preparar Ambiente Python
```bash
# Criar usuário para aplicação
sudo useradd -m -s /bin/bash portifolio
sudo su - portifolio

# Criar diretório da aplicação
mkdir -p /home/portifolio/app
cd /home/portifolio/app

# Clonar repositório
git clone <seu-repositorio> .

# Criar ambiente virtual
python3.11 -m venv venv
source venv/bin/activate

# Instalar dependências
cd backend
pip install --upgrade pip
pip install -r requirements.txt
```

### 2. Configuração de Ambiente
Criar arquivo `/home/portifolio/app/backend/.env`:
```env
# Configuração do Flask
FLASK_ENV=production
FLASK_DEBUG=False
SECRET_KEY=sua_chave_secreta_super_segura_aqui_min_32_chars

# Configuração do InfluxDB
INFLUXDB_MODE=remote
INFLUXDB_URL=http://seu-servidor-influxdb:8086
INFLUXDB_TOKEN=seu_token_influxdb
INFLUXDB_ORG=zen
INFLUXDB_BUCKET=portifolio

# Configuração de Segurança
RATE_LIMIT_STORAGE_URL=memory://
SESSION_TIMEOUT=3600
MAX_REQUESTS_PER_MINUTE=100

# Configuração do Servidor
HOST=127.0.0.1
PORT=5000
WORKERS=4
```

### 3. Configurar Systemd Service
Criar arquivo `/etc/systemd/system/portifolio-backend.service`:
```ini
[Unit]
Description=Portifolio Backend Flask App
After=network.target

[Service]
Type=exec
User=portifolio
Group=portifolio
WorkingDirectory=/home/portifolio/app/backend
Environment=PATH=/home/portifolio/app/venv/bin
ExecStart=/home/portifolio/app/venv/bin/gunicorn --worker-class eventlet -w 4 --bind 127.0.0.1:5000 app:app
ExecReload=/bin/kill -s HUP $MAINPID
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

## 🎨 Configuração do Frontend React

### 1. Build do Frontend
```bash
# Como usuário portifolio
cd /home/portifolio/app/frontend

# Instalar dependências
npm install

# Configurar variáveis de ambiente para produção
cat > .env.production << EOF
VITE_API_URL=https://seu-dominio.com/api
VITE_SOCKET_URL=https://seu-dominio.com
VITE_ENVIRONMENT=production
EOF

# Build para produção
npm run build

# Copiar arquivos para diretório do Nginx
sudo mkdir -p /var/www/portifolio
sudo cp -r dist/* /var/www/portifolio/
sudo chown -R nginx:nginx /var/www/portifolio
```

## 🌐 Configuração do Nginx

### 1. Configurar Site
Criar arquivo `/etc/nginx/conf.d/portifolio.conf`:
```nginx
server {
    listen 80;
    server_name seu-dominio.com www.seu-dominio.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name seu-dominio.com www.seu-dominio.com;
    
    # SSL Configuration (configurar certificados)
    ssl_certificate /path/to/your/certificate.pem;
    ssl_certificate_key /path/to/your/private.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
    
    # Frontend React
    location / {
        root /var/www/portifolio;
        index index.html;
        try_files $uri $uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
    
    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:5000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }
    
    # Socket.IO
    location /socket.io/ {
        proxy_pass http://127.0.0.1:5000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 🔧 Scripts de Deploy e Automação

### 1. Script de Deploy Automático
Criar arquivo `/home/portifolio/deploy.sh`:
```bash
#!/bin/bash

echo "🚀 Iniciando deploy do portfólio..."

# Configuração
APP_DIR="/home/portifolio/app"
BACKUP_DIR="/home/portifolio/backups"
DATE=$(date +%Y%m%d_%H%M%S)

# Criar backup
echo "📦 Criando backup..."
mkdir -p $BACKUP_DIR
tar -czf $BACKUP_DIR/backup_$DATE.tar.gz -C $APP_DIR .

# Atualizar código
echo "📥 Atualizando código..."
cd $APP_DIR
git pull origin main

# Backend
echo "🐍 Atualizando backend..."
source venv/bin/activate
cd backend
pip install -r requirements.txt

# Frontend
echo "⚛️  Atualizando frontend..."
cd ../frontend
npm install
npm run build
sudo cp -r dist/* /var/www/portifolio/
sudo chown -R nginx:nginx /var/www/portifolio

# Reiniciar serviços
echo "🔄 Reiniciando serviços..."
sudo systemctl restart portifolio-backend
sudo systemctl reload nginx

echo "✅ Deploy concluído com sucesso!"
```

### 2. Script de Monitoramento
Criar arquivo `/home/portifolio/monitor.sh`:
```bash
#!/bin/bash

# Verificar status dos serviços
echo "🔍 Status dos Serviços:"
echo "Backend: $(sudo systemctl is-active portifolio-backend)"
echo "Nginx: $(sudo systemctl is-active nginx)"

# Verificar logs de erro
echo -e "\n📋 Últimos logs do backend:"
sudo journalctl -u portifolio-backend --since "5 minutes ago" --no-pager

# Verificar uso de recursos
echo -e "\n💻 Uso de recursos:"
ps aux | grep -E "(gunicorn|nginx)" | grep -v grep
```

## 🗄️ Configuração do InfluxDB

### 1. Instalação do InfluxDB 2.7
```bash
# Adicionar repositório InfluxDB
cat > /etc/yum.repos.d/influxdb.repo << EOF
[influxdb]
name = InfluxDB Repository - RHEL
baseurl = https://repos.influxdata.com/rhel/\$releasever/\$basearch/stable
enabled = 1
gpgcheck = 1
gpgkey = https://repos.influxdata.com/influxdb.key
EOF

# Instalar InfluxDB
sudo dnf install influxdb2 -y

# Habilitar e iniciar serviço
sudo systemctl enable influxdb
sudo systemctl start influxdb
```

### 2. Configuração Inicial
```bash
# Configurar InfluxDB (primeira execução)
influx setup \
  --username admin \
  --password sua_senha_admin \
  --org zen \
  --bucket portifolio \
  --retention 0 \
  --force

# Criar token para aplicação
influx auth create \
  --org zen \
  --read-buckets \
  --write-buckets \
  --description "Token para aplicação portfólio"
```

## 🔐 Configuração de Segurança

### 1. Firewall
```bash
# Configurar firewall
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --permanent --add-port=8086/tcp  # InfluxDB
sudo firewall-cmd --reload
```

### 2. SSL/TLS com Let's Encrypt
```bash
# Instalar Certbot
sudo dnf install certbot python3-certbot-nginx -y

# Obter certificado
sudo certbot --nginx -d seu-dominio.com -d www.seu-dominio.com

# Configurar renovação automática
echo "0 12 * * * /usr/bin/certbot renew --quiet" | sudo crontab -
```

## 🚀 Comandos de Inicialização

### 1. Habilitar Serviços
```bash
# Habilitar serviços para inicialização automática
sudo systemctl enable portifolio-backend
sudo systemctl enable nginx
sudo systemctl enable influxdb

# Iniciar todos os serviços
sudo systemctl start portifolio-backend
sudo systemctl start nginx
sudo systemctl start influxdb
```

### 2. Verificar Status
```bash
# Verificar status de todos os serviços
sudo systemctl status portifolio-backend nginx influxdb

# Verificar logs
sudo journalctl -u portifolio-backend -f
sudo journalctl -u nginx -f
```

## 🔍 Monitoramento e Manutenção

### 1. Logs Importantes
- Backend: `sudo journalctl -u portifolio-backend`
- Nginx: `/var/log/nginx/access.log` e `/var/log/nginx/error.log`
- InfluxDB: `sudo journalctl -u influxdb`

### 2. Comandos Úteis
```bash
# Reiniciar aplicação
sudo systemctl restart portifolio-backend

# Recarregar configuração Nginx
sudo systemctl reload nginx

# Verificar conexões ativas
sudo netstat -tlnp | grep -E "(80|443|5000|8086)"

# Monitorar recursos
htop
df -h
free -h
```

## 🎯 URLs de Acesso

Após o deploy completo:

- **Frontend**: `https://seu-dominio.com`
- **API Backend**: `https://seu-dominio.com/api`
- **InfluxDB UI**: `http://seu-dominio.com:8086`
- **Logs Backend**: `sudo journalctl -u portifolio-backend -f`

## 🆘 Troubleshooting

### Problemas Comuns

1. **Backend não inicia**:
   - Verificar logs: `sudo journalctl -u portifolio-backend`
   - Verificar .env: `cat /home/portifolio/app/backend/.env`
   - Testar manualmente: `cd /home/portifolio/app/backend && source ../venv/bin/activate && python app.py`

2. **Frontend não carrega**:
   - Verificar arquivos: `ls -la /var/www/portifolio/`
   - Verificar permissões: `sudo chown -R nginx:nginx /var/www/portifolio`
   - Verificar Nginx: `sudo nginx -t && sudo systemctl reload nginx`

3. **InfluxDB não conecta**:
   - Verificar serviço: `sudo systemctl status influxdb`
   - Verificar configuração: `influx config list`
   - Testar conexão: `influx ping`

### Comandos de Emergência
```bash
# Parar todos os serviços
sudo systemctl stop portifolio-backend nginx

# Restaurar backup
cd /home/portifolio
tar -xzf backups/backup_YYYYMMDD_HHMMSS.tar.gz -C app/

# Reiniciar sistema
sudo reboot
```

## 📊 Métricas e Performance

### Configuração de Monitoramento
O sistema inclui:
- Rate limiting com Flask-Limiter
- Session management com timeout automático
- Logs de segurança para IPs suspeitos
- Caching de assets estáticos
- Compressão Gzip

### KPIs Recomendados
- Tempo de resposta da API < 200ms
- Uptime > 99.5%
- Taxa de erro < 1%
- Uso de CPU < 70%
- Uso de memória < 80%

---

## 📝 Notas Importantes

1. **Segurança**: Altere todas as senhas e tokens padrão
2. **Backup**: Configure backups automáticos diários
3. **Monitoramento**: Configure alertas para serviços críticos
4. **Updates**: Mantenha sistema e dependências atualizados
5. **SSL**: Renove certificados antes do vencimento

**✨ Aplicação pronta para produção em Oracle Linux Server!**