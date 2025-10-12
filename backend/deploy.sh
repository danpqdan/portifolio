#!/bin/bash
# Script de deploy para produção OLS

set -e  # Parar em caso de erro

echo "🚀 Iniciando deploy para produção OLS..."

# Definir diretórios
BACKEND_DIR="/usr/local/lsws/portifolio/html/portifolio/backend"
PROJECT_ROOT="/usr/local/lsws/portifolio/html/portifolio"

# Função para logs
log_info() {
    echo "[INFO] $1"
}

log_error() {
    echo "[ERROR] $1" >&2
}

log_success() {
    echo "[SUCCESS] $1"
}

# Navegar para o diretório do backend
log_info "Navegando para: $BACKEND_DIR"
cd "$BACKEND_DIR"

# Verificar se ambiente virtual existe
if [ ! -d "venv" ]; then
    log_error "Ambiente virtual não encontrado!"
    log_info "Execute primeiro: ./setup-env.sh"
    exit 1
fi

# Ativar ambiente virtual
log_info "Ativando ambiente virtual..."
source venv/bin/activate

# Verificar se está no ambiente virtual
if [[ "$VIRTUAL_ENV" == "" ]]; then
    log_error "Falha ao ativar ambiente virtual"
    exit 1
fi

log_success "Ambiente virtual ativo: $VIRTUAL_ENV"

# Carregar variáveis de ambiente
if [ -f ".env" ]; then
    log_info "Carregando variáveis de ambiente..."
    set -a  # Exportar automaticamente variáveis
    source .env
    set +a
    log_success "Variáveis carregadas"
else
    log_info "Arquivo .env não encontrado, usando configurações padrão..."
    export FLASK_ENV=production
    export INFLUXDB_MODE=local
fi

# Verificar e instalar dependências se necessário
log_info "Verificando dependências..."
if ! pip show flask &> /dev/null; then
    log_info "Instalando dependências..."
    pip install -r requirements.txt
fi

# Parar processo Flask anterior se existir
log_info "Verificando processos Flask anteriores..."
FLASK_PID=$(pgrep -f "python.*app.py" || true)
if [ ! -z "$FLASK_PID" ]; then
    log_info "Parando processo Flask anterior (PID: $FLASK_PID)..."
    kill $FLASK_PID
    sleep 2
    
    # Forçar kill se necessário
    if pgrep -f "python.*app.py" &> /dev/null; then
        log_info "Forçando parada do processo..."
        pkill -9 -f "python.*app.py"
    fi
fi

# Testar configuração
log_info "Testando configuração Flask..."
if python3 -c "from app import app; print('Flask configurado corretamente')"; then
    log_success "Configuração Flask válida"
else
    log_error "Erro na configuração Flask"
    exit 1
fi

# Limpar logs antigos
if [ -f "flask.log" ]; then
    mv flask.log "flask-$(date +%Y%m%d-%H%M%S).log"
fi

# Iniciar servidor Flask
log_info "Iniciando servidor Flask..."

# Usar gunicorn para produção se disponível
if command -v gunicorn &> /dev/null; then
    log_info "Usando Gunicorn para produção..."
    nohup gunicorn --worker-class eventlet -w 4 --bind 127.0.0.1:5000 --timeout 60 --keep-alive 2 --max-requests 1000 app:app > flask.log 2>&1 &
    FLASK_PID=$!
else
    log_info "Usando servidor Flask de desenvolvimento..."
    nohup python3 app.py > flask.log 2>&1 &
    FLASK_PID=$!
fi

# Aguardar inicialização
sleep 3

# Verificar se processo está rodando
if ps -p $FLASK_PID > /dev/null; then
    log_success "Servidor Flask iniciado (PID: $FLASK_PID)"
    echo $FLASK_PID > flask.pid
else
    log_error "Falha ao iniciar servidor Flask"
    log_error "Últimas linhas do log:"
    tail -10 flask.log
    exit 1
fi

# Testar conectividade
log_info "Testando conectividade..."
sleep 2

if curl -s http://127.0.0.1:5000/api/ > /dev/null; then
    log_success "API respondendo corretamente"
else
    log_error "API não está respondendo"
    log_error "Verificar logs: tail -f flask.log"
fi

echo ""
log_success "Deploy concluído com sucesso!"
echo ""
echo "📊 Informações do deploy:"
echo "   PID do processo: $FLASK_PID"
echo "   Logs: tail -f $BACKEND_DIR/flask.log"
echo "   Parar servidor: kill $FLASK_PID"
echo ""
echo "🌐 URLs de teste:"
echo "   API Local: http://127.0.0.1:5000/api/"
echo "   API Produção: https://dsplayground.com.br/api/"
echo "   Health Check: https://dsplayground.com.br/api/health"
echo "   WebSocket: https://dsplayground.com.br/api/socket.io/"
echo ""
echo "🔍 Comandos úteis:"
echo "   Ver logs: tail -f flask.log"
echo "   Verificar processo: ps -p $FLASK_PID"
echo "   Parar servidor: kill \$(cat flask.pid)"
echo "   Restart: ./deploy.sh"