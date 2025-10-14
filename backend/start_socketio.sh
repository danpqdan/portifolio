#!/bin/bash
# Caminho para seu virtualenv
VENV_PATH=/usr/local/lsws/portifolio/html/portifolio/backend/venv

# Caminho para sua aplicação Flask
APP_PATH=/usr/local/lsws/portifolio/html/portifolio/backend/app.py

# Ativa o virtualenv
source $VENV_PATH/bin/activate

# Sobe o Flask-SocketIO com eventlet (ou gevent)
exec python $APP_PATH
