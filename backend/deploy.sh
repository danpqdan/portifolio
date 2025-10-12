#!/bin/bash
# filepath: /usr/local/lsws/portifolio/html/portifolio/deploy.sh

echo "🚀 Configurando deploy para produção OLS..."

# Navegar para o diretório do backend
cd /usr/local/lsws/portifolio/html/portifolio/backend

# Ativar ambiente virtual
source venv/bin/activate

# Configurar variáveis de ambiente
export FLASK_ENV=production
export INFLUXDB_MODE=local

# Instalar dependências
pip install -r requirements.txt

# Testar configuração
echo "🔍 Testando configuração Flask..."
python -c "from app import app; print('✅ Flask configurado corretamente')"

# Iniciar servidor em background
echo "🔥 Iniciando servidor Flask..."
nohup python app.py > flask.log 2>&1 &

echo "✅ Deploy concluído!"
echo "📊 Logs: tail -f flask.log"
echo "🌐 API: https://dsplayground.com.br/api/"
echo "🔌 WebSocket: https://dsplayground.com.br/api/socket.io/"