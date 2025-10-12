#!/bin/bash
# Script para configurar ambiente Python completo para OLS

set -e  # Parar em caso de erro

echo "🐍 Configurando ambiente Python para OLS..."

# Verificar diretório atual
BACKEND_DIR="/usr/local/lsws/portifolio/html/portifolio/backend"
PROJECT_ROOT="/usr/local/lsws/portifolio/html/portifolio"

echo "📂 Navegando para: $BACKEND_DIR"
cd "$BACKEND_DIR"

# Verificar se Python3 está disponível
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 não encontrado. Instalando..."
    sudo apt update
    sudo apt install -y python3 python3-pip python3-venv
fi

echo "✅ Python3 encontrado: $(python3 --version)"

# Criar ambiente virtual se não existir
if [ ! -d "venv" ]; then
    echo "🔧 Criando ambiente virtual..."
    python3 -m venv venv
    echo "✅ Ambiente virtual criado"
else
    echo "✅ Ambiente virtual já existe"
fi

# Ativar ambiente virtual
echo "🔌 Ativando ambiente virtual..."
source venv/bin/activate

# Verificar se está no ambiente virtual
if [[ "$VIRTUAL_ENV" != "" ]]; then
    echo "✅ Ambiente virtual ativo: $VIRTUAL_ENV"
else
    echo "❌ Erro: Ambiente virtual não foi ativado"
    exit 1
fi

# Atualizar pip
echo "📦 Atualizando pip..."
pip install --upgrade pip

# Instalar wheel para melhor compatibilidade
pip install wheel

# Verificar se requirements.txt existe
if [ ! -f "requirements.txt" ]; then
    echo "❌ requirements.txt não encontrado!"
    exit 1
fi

echo "📋 Instalando dependências do requirements.txt..."
pip install -r requirements.txt

# Verificar se todas as dependências foram instaladas
echo "🔍 Verificando instalação das dependências principais..."

# Lista de dependências críticas
CRITICAL_DEPS=("flask" "flask-cors" "flask-socketio" "flask-limiter" "influxdb-client" "gunicorn" "eventlet")

for dep in "${CRITICAL_DEPS[@]}"; do
    if pip show "$dep" &> /dev/null; then
        VERSION=$(pip show "$dep" | grep Version | cut -d' ' -f2)
        echo "✅ $dep==$VERSION"
    else
        echo "❌ $dep não está instalado!"
        exit 1
    fi
done

# Gerar requirements.txt completo com pip freeze
echo "📄 Gerando requirements-freeze.txt com todas as dependências..."
pip freeze > requirements-freeze.txt

echo "📊 Comparando arquivos de requirements..."
echo "requirements.txt (manual):"
wc -l requirements.txt
echo "requirements-freeze.txt (completo):"
wc -l requirements-freeze.txt

# Testar importações Python
echo "🧪 Testando importações críticas..."
python3 -c "
import flask
import flask_cors
import flask_socketio
import flask_limiter
import influxdb_client
import gunicorn
import eventlet
print('✅ Todas as importações funcionando!')
"

# Testar configuração da aplicação
echo "🔍 Testando configuração da aplicação..."
if python3 -c "from app import app; print('✅ App Flask carregado com sucesso')"; then
    echo "✅ Aplicação configurada corretamente"
else
    echo "❌ Erro na configuração da aplicação"
    exit 1
fi

# Criar arquivo de variáveis de ambiente se não existir
if [ ! -f ".env" ]; then
    echo "🔧 Criando arquivo .env para produção..."
    cat > .env << 'EOF'
# Configuração de produção OLS
FLASK_ENV=production
FLASK_APP=app.py
FLASK_DEBUG=False

# Segurança
SECRET_KEY=your-super-secret-key-change-this-in-production

# CORS
CORS_ORIGINS=https://dsplayground.com.br,https://www.dsplayground.com.br,http://dsplayground.com.br,http://localhost:3000

# InfluxDB
INFLUXDB_MODE=local
INFLUXDB_URL_LOCAL=http://127.0.0.1:8086
INFLUXDB_URL_REMOTE=http://dsplayground.com.br:8086
INFLUXDB_TOKEN=your-influxdb-token-here
INFLUXDB_ORG=zen
INFLUXDB_BUCKET=portifolio
INFLUXDB_ENABLED=true

# Servidor
HOST=127.0.0.1
PORT=5000
WORKERS=4

# Rate Limiting
RATE_LIMIT_STORAGE_URL=memory://
SESSION_TIMEOUT=3600
MAX_REQUESTS_PER_MINUTE=100
EOF
    echo "✅ Arquivo .env criado"
fi

# Configurar permissões
echo "🔒 Configurando permissões..."
chmod +x ../deploy.sh
chmod 600 .env  # Apenas proprietário pode ler/escrever

echo ""
echo "🎉 Configuração do ambiente Python concluída!"
echo ""
echo "📋 Resumo:"
echo "   Python: $(python3 --version)"
echo "   Pip: $(pip --version)"
echo "   Ambiente virtual: $VIRTUAL_ENV"
echo "   Dependências instaladas: $(pip list | wc -l) pacotes"
echo ""
echo "📁 Arquivos gerados:"
echo "   ✅ venv/ (ambiente virtual)"
echo "   ✅ requirements-freeze.txt (todas as dependências)"
echo "   ✅ .env (configuração de produção)"
echo ""
echo "🚀 Próximos passos:"
echo "   1. ./deploy.sh (iniciar servidor)"
echo "   2. tail -f flask.log (monitorar logs)"
echo "   3. curl http://127.0.0.1:5000/api/ (testar API)"