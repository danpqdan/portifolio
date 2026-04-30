# 🚀 Guia Completo - Deploy Flask no OLS

## 📋 Passo a Passo para Configurar o Ambiente Python

### 1. **Configuração Inicial do Ambiente**
```bash
# Conectar no servidor OLS
ssh usuario@servidor-exemplo

# Navegar para o diretório do projeto
cd /usr/local/lsws/portifolio/html/portifolio/backend

# Executar configuração do ambiente (só a primeira vez)
chmod +x setup-env.sh
./setup-env.sh
```

### 2. **Deploy da Aplicação**
```bash
# Executar deploy
chmod +x deploy.sh
./deploy.sh

# OU usar o script de serviço
chmod +x flask-service.sh
./flask-service.sh start
```

### 3. **Gerenciar o Serviço**
```bash
# Ver status
./flask-service.sh status

# Ver logs em tempo real
./flask-service.sh logs

# Testar API
./flask-service.sh test

# Parar serviço
./flask-service.sh stop

# Reiniciar serviço
./flask-service.sh restart

# Gerar requirements completo
./flask-service.sh freeze
```

## 🔧 **Estrutura de Arquivos Criados**

```
backend/
├── app.py                    # Aplicação Flask principal
├── requirements.txt          # Dependências principais (organizado)
├── .env.production          # Configurações de produção
├── setup-env.sh            # Script de configuração inicial
├── deploy.sh               # Script de deploy
├── flask-service.sh        # Gerenciador de serviço
├── venv/                   # Ambiente virtual Python
├── flask.log              # Logs da aplicação
├── flask.pid              # PID do processo
└── requirements-freeze.txt # Todas as dependências (pip freeze)
```

## 🐍 **Requirements.txt Completo**

O arquivo `requirements.txt` foi organizado com:
- **Framework principal**: Flask 3.0.0 + Werkzeug
- **Extensões**: CORS, SocketIO, Limiter
- **WebSocket**: python-socketio + eventlet
- **Banco**: influxdb-client
- **Segurança**: PyJWT, bcrypt, cryptography  
- **Produção**: gunicorn
- **Utilitários**: python-dotenv, requests
- **Monitoramento**: psutil
- **Desenvolvimento**: pytest, black, flake8

## 🔐 **Configuração de Segurança**

### Arquivo `.env.production`:
```bash
FLASK_ENV=production
SECRET_KEY=sua-chave-secreta-super-segura-min-32-chars
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
INFLUXDB_TOKEN=seu-token-influxdb-real
APPLICATION_ROOT=/api
PREFERRED_URL_SCHEME=https
```

## 🌐 **URLs de Teste**

Após o deploy, testar:
- **API Root**: `http://localhost:5000/api/`
- **Health Check**: `http://localhost:5000/api/health`
- **Analytics**: `http://localhost:5000/api/analytics/stats/temporal`
- **Security**: `http://localhost:5000/api/analytics/security/status`

## 🚨 **Resolução do Problema "Page Not Found"**

O erro acontece porque:
1. **Servidor Flask não está rodando**
2. **Context `/api/` não está configurado corretamente**
3. **Blueprint não está registrado**

### Soluções:

#### A. **Verificar se Flask está rodando**:
```bash
./flask-service.sh status
ps aux | grep flask
netstat -tlnp | grep 5000
```

#### B. **Testar localmente primeiro**:
```bash
curl http://127.0.0.1:5000/api/
curl http://127.0.0.1:5000/api/health
```

#### C. **Verificar logs**:
```bash
tail -f flask.log
journalctl -u litespeed
```

## 🔍 **Comandos de Diagnóstico**

```bash
# 1. Verificar ambiente Python
source venv/bin/activate
python3 --version
pip list | grep -E "(flask|gunicorn)"

# 2. Testar importações
python3 -c "from app import app; print('OK')"

# 3. Verificar processo Flask
ps aux | grep -E "(flask|gunicorn|python)"

# 4. Testar conectividade
curl -v http://127.0.0.1:5000/api/

# 5. Verificar portas
netstat -tlnp | grep -E "(5000|80|443)"

# 6. Logs detalhados
tail -f flask.log
tail -f /usr/local/lsws/logs/error.log
```

## ⚡ **Comandos Rápidos**

```bash
# Setup completo (primeira vez)
./setup-env.sh && ./deploy.sh

# Deploy rápido
./flask-service.sh restart

# Monitoramento
watch -n 2 './flask-service.sh status'

# Teste completo
./flask-service.sh test

# Debug problemas
./flask-service.sh logs | grep -E "(ERROR|WARNING)"
```

## 🎯 **Próximos Passos**

1. **Execute setup-env.sh** para configurar ambiente
2. **Execute deploy.sh** para iniciar servidor
3. **Teste localmente** com curl
4. **Verifique LiteSpeed** context configuration
5. **Monitore logs** para debugging

**✅ Com estes scripts, você terá um ambiente Python completo e organizado para o Flask no OLS!**

---

## Producao com Docker + Gunicorn + Nginx

O fluxo recomendado para producao e rodar o backend Flask+Socket.IO em um container dedicado com Gunicorn e worker `eventlet`, atras de Nginx como proxy reverso com TLS.

### Dockerfile de producao (sugerido)

`backend/Dockerfile.prod`:

```dockerfile
FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --shell /bin/bash app
WORKDIR /app

COPY --chown=app:app requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir gunicorn eventlet

COPY --chown=app:app . .

USER app
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -fsS http://localhost:5000/api/health/app || exit 1

CMD ["gunicorn", "--worker-class", "eventlet", "-w", "1", "-b", "0.0.0.0:5000", \
     "--access-logfile", "-", "--error-logfile", "-", "app:app"]
```

Observacoes:

- Com `eventlet`, mantenha `-w 1` por processo e escale horizontalmente por replicas.
- Container roda como `app` (nao-root).
- Health check usa `/api/health/app` (blueprint com `url_prefix=/api` quando `FLASK_ENV=production`).

### Nginx como proxy reverso

```nginx
upstream portifolio_backend {
    server backend:5000;
}

server {
    listen 443 ssl http2;
    server_name analytics.seudominio.com;

    ssl_certificate     /etc/letsencrypt/live/analytics.seudominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/analytics.seudominio.com/privkey.pem;

    location / {
        proxy_pass http://portifolio_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Socket.IO precisa de Upgrade:
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 300s;
    }
}
```

Para o backend pegar o IP real do cliente (e nao o do Nginx), confirme que `X-Forwarded-For` esta sendo usado em `check_suspicious_activity` e na tag `ip_address` do InfluxDB. Hoje o codigo usa `request.environ.get('REMOTE_ADDR')` — revisitar em producao se a cadeia de proxies entregar o IP correto.

### Variaveis de ambiente obrigatorias

| variavel | obrigatoria em producao | descricao |
|---|---|---|
| `FLASK_ENV` | sim | `production` |
| `SECRET_KEY` | sim | chave Flask, gerar com `secrets.token_urlsafe(32)` |
| `CORS_ORIGINS` | sim | lista de origens permitidas, separadas por virgula. Hoje cobre apenas dominios da propria plataforma — adicionar dominio de cliente exige editar `cors_origins` no vault Ansible e re-aplicar (ver `docs/plano-clientes-ambientes.md`, secao "CORS e origens permitidas"). Migracao para CORS dinamico por `sites.dominios_permitidos` esta planejada |
| `INFLUXDB_URL` | sim | URL do InfluxDB |
| `INFLUXDB_TOKEN` | sim | token com permissao de `buckets:read,write` |
| `INFLUXDB_ORG` | sim | organizacao |
| `INFLUXDB_BUCKET` | sim | bucket de destino |
| `INFLUXDB_ENABLED` | sim | `true` em producao |
| `ADMIN_API_TOKEN` | opcional* | ativa endpoints LGPD `/admin/*` — sem ele retornam 401 |

*Recomendado configurar mesmo se nao for usar ja, pra responder rapido a pedidos do titular.

### Retencao do bucket

Configure logo no primeiro deploy:

```bash
docker compose exec backend python scripts/configurar_retencao.py --dias 90
```

## Backup e Restore do InfluxDB

Backup completo (inclui metadados e dados de todos os buckets da org):

```bash
# dentro do container influxdb
docker compose exec influxdb influx backup /tmp/backup-$(date +%Y%m%d) \
  --token $INFLUXDB_TOKEN

# copiar para host
docker compose cp influxdb:/tmp/backup-$(date +%Y%m%d) ./backups/
```

Restore (exige o bucket nao existir ou usar `--new-bucket`):

```bash
docker compose cp ./backups/backup-20260101 influxdb:/tmp/backup-20260101
docker compose exec influxdb influx restore /tmp/backup-20260101 \
  --token $INFLUXDB_TOKEN \
  --bucket portifolio_prod \
  --new-bucket portifolio_prod_restaurado
```

Agendar o backup com cron no host ou com um sidecar container. Para backup incremental e disaster recovery avancado, considerar snapshot de volume.

## Observabilidade em producao

- Logs estruturados de analytics seguem formato `evento=<nome> chave=valor` (ver `backend/ingestao/logs.py`). Estagios: `recebido`, `validado`, `rejeitado`, `persistido_temporal`, `persistido_webvital`, `persistido_customevent`, `erro_persistencia`, `backpressure`, `conectado`, `desconectado`, `acesso_bloqueado`.
- `security.log` tem rotacao automatica (10 MB, 5 arquivos). Em producao, monte um volume dedicado para `backend/security.log`.
- Health endpoints separados: `/health/app`, `/health/socketio`, `/health/influxdb`.
- Auditoria LGPD: toda chamada admin gera linha `[ADMIN-AUDIT]` em `security.log`.

## Endpoints de API em producao

- Consulta publica: `/analytics/metricas`, `/analytics/web-vitals`, `/analytics/custom-events`. Atras de rate limit de IP e `security_middleware`. Proteja com IP allowlist ou WAF se o caso de uso nao permite acesso publico.
- Administracao LGPD: `/admin/analytics/sessao/<id>` (GET e DELETE). Exigem `Authorization: Bearer $ADMIN_API_TOKEN`. Recomendado mTLS ou VPN alem do token.