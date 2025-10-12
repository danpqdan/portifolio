# 🚀 Guia Completo - Deploy Flask no OLS

## 📋 Passo a Passo para Configurar o Ambiente Python

### 1. **Configuração Inicial do Ambiente**
```bash
# Conectar no servidor OLS
ssh ubuntu@dsplayground.com.br

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
CORS_ORIGINS=https://dsplayground.com.br,https://www.dsplayground.com.br
INFLUXDB_TOKEN=seu-token-influxdb-real
APPLICATION_ROOT=/api
PREFERRED_URL_SCHEME=https
```

## 🌐 **URLs de Teste**

Após o deploy, testar:
- **API Root**: `https://dsplayground.com.br/api/`
- **Health Check**: `https://dsplayground.com.br/api/health`
- **Analytics**: `https://dsplayground.com.br/api/analytics/stats/temporal`
- **Security**: `https://dsplayground.com.br/api/analytics/security/status`

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