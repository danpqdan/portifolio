from flask import Flask, jsonify, request, session
from flask_cors import CORS
from flask_socketio import SocketIO, emit, disconnect
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import os
import secrets
import hashlib
import time
import jwt
from datetime import datetime, timedelta
from collections import defaultdict
from typing import Dict, List, Optional
from functools import wraps
import uuid
import logging
import sys

from config import config
from dto.Dados import HeatmapDados
import json
from influxdb_service import get_influxdb_service, create_temporal_metric_from_heatmap, TemporalMetric

# ==================== CONFIGURAÇÃO DE SEGURANÇA ====================

app = Flask(__name__)
env = os.environ.get("FLASK_ENV", "development")
app.config.from_object(config[env])

# ✅ CONFIGURAÇÕES DE SEGURANÇA AVANÇADAS
SECRET_KEY = app.config.get('SECRET_KEY') or secrets.token_urlsafe(32)
app.secret_key = SECRET_KEY

# Configurações de sessão seguras
app.config.update(
    SESSION_COOKIE_SECURE=env == 'production',  # HTTPS apenas em produção
    SESSION_COOKIE_HTTPONLY=True,  # Evita acesso via JavaScript
    SESSION_COOKIE_SAMESITE='Lax',  # Protege contra CSRF
    PERMANENT_SESSION_LIFETIME=timedelta(hours=1),  # Sessão expira em 1h
    SESSION_COOKIE_NAME='portfolio_session',  # Nome customizado
    WTF_CSRF_TIME_LIMIT=None,  # Token CSRF não expira
)

# ✅ RATE LIMITING - SINTAXE CORRIGIDA
limiter = Limiter(
    key_func=get_remote_address,
    app=app,
    default_limits=["200 per day", "50 per hour"],
    storage_uri="memory://"
)

# ✅ LOGGING DE SEGURANÇA - CORRIGIDO PARA WINDOWS
class SafeFileHandler(logging.FileHandler):
    """File handler que trata caracteres unicode corretamente"""
    def __init__(self, filename, mode='a', encoding='utf-8', delay=False):
        super().__init__(filename, mode, encoding, delay)

class SafeStreamHandler(logging.StreamHandler):
    """Stream handler que trata caracteres unicode corretamente"""
    def emit(self, record):
        try:
            msg = self.format(record)
            # Remover emojis para compatibilidade
            msg = msg.encode('ascii', errors='ignore').decode('ascii')
            stream = self.stream
            stream.write(msg + self.terminator)
            self.flush()
        except Exception:
            self.handleError(record)

# Configurar logging com handlers seguros
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        SafeFileHandler('security.log', encoding='utf-8'),
        SafeStreamHandler(sys.stdout)
    ],
    force=True
)
security_logger = logging.getLogger('security')

# Configurar CORS com configurações mais restritivas
CORS(app, 
     origins=app.config.get("CORS_ORIGINS", ["http://localhost:5173"]),
     supports_credentials=True,  # Permite cookies
     allow_headers=['Content-Type', 'Authorization', 'X-Session-Token'],
     methods=['GET', 'POST', 'OPTIONS']
)

# Configurar SocketIO com segurança
socketio = SocketIO(
    app,
    cors_allowed_origins=app.config.get("CORS_ORIGINS", ["http://localhost:5173"]),
    logger=False,  # Reduzir logs em produção
    engineio_logger=False,
    ping_timeout=60,
    ping_interval=25
)

# ==================== SISTEMA DE AUTENTICAÇÃO E SESSÕES ====================

# Cache para sessões ativas com informações de segurança
active_sessions = {}
session_metrics = defaultdict(lambda: {
    'requests_count': 0,
    'last_activity': time.time(),
    'ip_address': None,
    'user_agent': None,
    'security_score': 100,
    'warnings': []
})

# Blacklist de IPs suspeitos
suspicious_ips = set()
rate_limit_violations = defaultdict(list)

def log_safe(logger, level, message, *args):
    """Log seguro que remove emojis problemáticos"""
    # Remover emojis comuns que causam problemas
    emoji_map = {
        '🔧': '[CONFIG]',
        '🔒': '[SECURITY]',
        '✅': '[SUCCESS]',
        '⚠️': '[WARNING]',
        '❌': '[ERROR]',
        '🔌': '[WEBSOCKET]',
        '📊': '[ANALYTICS]',
        '🚫': '[BLOCKED]',
        '🧹': '[CLEANUP]',
        '⏰': '[TIMEOUT]',
        '🌐': '[REMOTE]',
        '💻': '[LOCAL]',
        '🔍': '[DEBUG]'
    }
    
    safe_message = message
    for emoji, replacement in emoji_map.items():
        safe_message = safe_message.replace(emoji, replacement)
    
    getattr(logger, level)(safe_message, *args)

def generate_session_token():
    """Gera token único para sessão"""
    return secrets.token_urlsafe(32)

def create_session_fingerprint(request):
    """Cria fingerprint da sessão baseado em headers e IP"""
    user_agent = request.headers.get('User-Agent', '')
    ip_address = request.environ.get('REMOTE_ADDR', '')
    accept_language = request.headers.get('Accept-Language', '')
    
    fingerprint_string = f"{ip_address}:{user_agent}:{accept_language}"
    return hashlib.sha256(fingerprint_string.encode()).hexdigest()[:16]

def validate_session_integrity(session_id: str, request) -> bool:
    """Valida integridade da sessão"""
    if session_id not in active_sessions:
        return False
    
    session_data = active_sessions[session_id]
    current_fingerprint = create_session_fingerprint(request)
    
    # Verificar se fingerprint mudou (possível hijacking)
    if session_data.get('fingerprint') != current_fingerprint:
        log_safe(security_logger, 'warning', f"[SECURITY] Possivel session hijacking detectado: {session_id}")
        return False
    
    # Verificar se sessão expirou
    if time.time() - session_data.get('created_at', 0) > 3600:  # 1 hora
        log_safe(security_logger, 'info', f"[TIMEOUT] Sessao expirada: {session_id}")
        return False
    
    return True

def check_suspicious_activity(session_id: str, request) -> bool:
    """Verifica atividade suspeita"""
    ip_address = request.environ.get('REMOTE_ADDR', '')
    current_time = time.time()
    
    # Verificar IP na blacklist
    if ip_address in suspicious_ips:
        log_safe(security_logger, 'warning', f"[BLOCKED] IP suspeito tentando acesso: {ip_address}")
        return False
    
    # Verificar rate limiting por IP
    recent_requests = [t for t in rate_limit_violations[ip_address] 
                      if current_time - t < 60]  # Últimos 60 segundos
    
    if len(recent_requests) > 30:  # Mais de 30 requests por minuto
        log_safe(security_logger, 'warning', f"[WARNING] Rate limit excedido para IP: {ip_address}")
        suspicious_ips.add(ip_address)
        return False
    
    rate_limit_violations[ip_address].append(current_time)
    
    return True

def security_middleware(f):
    """Decorator para validação de segurança"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Verificar atividade suspeita
        if not check_suspicious_activity(request.sid if hasattr(request, 'sid') else 'http', request):
            return jsonify({"error": "Acesso negado"}), 403
        
        # Atualizar métricas de sessão
        session_id = request.sid if hasattr(request, 'sid') else request.headers.get('X-Session-Token')
        if session_id:
            session_metrics[session_id]['requests_count'] += 1
            session_metrics[session_id]['last_activity'] = time.time()
            session_metrics[session_id]['ip_address'] = request.environ.get('REMOTE_ADDR', '')
        
        return f(*args, **kwargs)
    return decorated_function

# ==================== CACHE TEMPORAL COM SEGURANÇA ====================

temporal_stats_cache = {
    "total_sessions": 0,
    "active_sessions": {},
    "realtime_data": defaultdict(list),
    "last_cleanup": time.time(),
    "security_events": []
}

TEMPORAL_CONFIG = {
    "REALTIME_INTERVAL": app.config.get("TEMPORAL_REALTIME_INTERVAL", 5000),
    "REGULAR_INTERVAL": app.config.get("TEMPORAL_REGULAR_INTERVAL", 15000),
    "CACHE_CLEANUP_INTERVAL": app.config.get("TEMPORAL_CLEANUP_INTERVAL", 300),
    "MAX_CACHE_ENTRIES": app.config.get("TEMPORAL_CACHE_SIZE", 1000)
}

def cleanup_temporal_cache():
    """Limpa cache temporal e sessões expiradas"""
    current_time = time.time()
    if current_time - temporal_stats_cache["last_cleanup"] > TEMPORAL_CONFIG["CACHE_CLEANUP_INTERVAL"]:
        # Limpar sessões expiradas
        expired_sessions = [
            sid for sid, data in active_sessions.items()
            if current_time - data.get('last_activity', 0) > 3600
        ]
        
        for sid in expired_sessions:
            del active_sessions[sid]
            if sid in temporal_stats_cache["active_sessions"]:
                del temporal_stats_cache["active_sessions"][sid]
        
        if expired_sessions:
            log_safe(security_logger, 'info', f"[CLEANUP] Removidas {len(expired_sessions)} sessoes expiradas")
        
        # Limitar entradas do cache
        for page in temporal_stats_cache["realtime_data"]:
            if len(temporal_stats_cache["realtime_data"][page]) > TEMPORAL_CONFIG["MAX_CACHE_ENTRIES"]:
                temporal_stats_cache["realtime_data"][page] = temporal_stats_cache["realtime_data"][page][-TEMPORAL_CONFIG["MAX_CACHE_ENTRIES"]//2:]
        
        temporal_stats_cache["last_cleanup"] = current_time

def detect_data_type(data: dict) -> str:
    """Detecta se os dados são de envio temporal ou regular"""
    current_time = int(time.time() * 1000)
    
    if data.get('timestamp_final'):
        time_diff = current_time - data['timestamp_final']
        if time_diff < 10000:
            return "temporal"
    
    total_interactions = 0
    for page_name in ['home', 'about', 'projects']:
        if page_name in data and data[page_name]:
            for session in data[page_name]:
                total_interactions += len(session.get('cliques', []))
                total_interactions += len(session.get('toques', []))
                total_interactions += len(session.get('scrolls', []))
    
    if total_interactions < 5:
        return "temporal"
    
    return "regular"

# Inicializar serviço InfluxDB
try:
    influxdb_service = get_influxdb_service()
    log_safe(security_logger, 'info', "[SUCCESS] InfluxDB service inicializado com sucesso")
except Exception as e:
    log_safe(security_logger, 'warning', f"[WARNING] Erro ao inicializar InfluxDB: {str(e)}")
    influxdb_service = None

# ==================== ROTAS PRINCIPAIS ====================

@app.route("/", methods=["GET"])
@limiter.limit("10 per minute")
def index():
    return jsonify({
        "message": "API do Portfólio está funcionando!",
        "security": "enabled",
        "timestamp": datetime.now().isoformat(),
        "influxdb_status": "connected" if influxdb_service else "disconnected"
    })

@app.route("/health", methods=["GET"])
@limiter.limit("30 per minute")
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "security": "enabled",
        "active_sessions": len(active_sessions),
        "influxdb": "connected" if influxdb_service else "disconnected"
    })

# ==================== WEBSOCKET EVENTS COM SEGURANÇA ====================

@socketio.on("connect")
def handle_connect():
    """Evento quando cliente se conecta via WebSocket"""
    session_id = request.sid
    ip_address = request.environ.get('REMOTE_ADDR', 'unknown')
    user_agent = request.headers.get('User-Agent', 'unknown')
    
    # Verificar atividade suspeita
    if not check_suspicious_activity(session_id, request):
        log_safe(security_logger, 'warning', f"[BLOCKED] Conexao WebSocket negada para IP suspeito: {ip_address}")
        disconnect()
        return
    
    # Criar fingerprint da sessão
    fingerprint = create_session_fingerprint(request)
    session_token = generate_session_token()
    
    # Registrar sessão ativa
    active_sessions[session_id] = {
        'token': session_token,
        'fingerprint': fingerprint,
        'ip_address': ip_address,
        'user_agent': user_agent,
        'created_at': time.time(),
        'last_activity': time.time(),
        'request_count': 0
    }
    
    log_safe(security_logger, 'info', f"[WEBSOCKET] Nova conexao WebSocket: {session_id} de {ip_address}")
    
    emit("connection_response", {
        "status": "connected",
        "session_token": session_token,
        "message": "Conectado com segurança ao servidor de analytics",
        "timestamp": datetime.now().isoformat(),
        "security_level": "high"
    })

@socketio.on("disconnect")
def handle_disconnect():
    """Evento quando cliente se desconecta"""
    session_id = request.sid
    
    if session_id in active_sessions:
        session_data = active_sessions[session_id]
        duration = time.time() - session_data.get('created_at', 0)
        
        log_safe(security_logger, 'info', f"[WEBSOCKET] Desconexao WebSocket: {session_id} (duracao: {duration:.1f}s)")
        del active_sessions[session_id]
    
    if session_id in temporal_stats_cache["active_sessions"]:
        del temporal_stats_cache["active_sessions"][session_id]

@socketio.on("analytics_data")
@security_middleware
def handle_analytics_data(data):
    """Evento WebSocket para receber dados de analytics com segurança"""
    try:
        session_id = request.sid
        
        # Validar integridade da sessão
        if not validate_session_integrity(session_id, request):
            log_safe(security_logger, 'warning', f"[SECURITY] Sessao invalida tentando enviar dados: {session_id}")
            emit("analytics_error", {"error": "Sessão inválida"})
            disconnect()
            return
        
        # Atualizar atividade da sessão
        active_sessions[session_id]['last_activity'] = time.time()
        active_sessions[session_id]['request_count'] += 1
        
        # Verificar rate limiting por sessão
        if active_sessions[session_id]['request_count'] > 100:  # Máximo 100 requests por sessão
            log_safe(security_logger, 'warning', f"[WARNING] Rate limit de sessao excedido: {session_id}")
            emit("analytics_error", {"error": "Rate limit excedido"})
            return
        
        cleanup_temporal_cache()
        
        if not data:
            emit("analytics_error", {"error": "Nenhum dado foi enviado"})
            return

        data_type = detect_data_type(data)
        is_temporal = data_type == "temporal"
        
        # Converter dados para o DTO
        heatmap_dados = HeatmapDados.from_dict(data)
        
        # Atualizar cache temporal
        if is_temporal:
            temporal_stats_cache["total_sessions"] += 1
            
            temporal_stats_cache["active_sessions"][session_id] = {
                "last_update": datetime.now().isoformat(),
                "data": heatmap_dados,
                "security_validated": True,
                "ip_address": active_sessions[session_id]['ip_address']
            }
        
        # Logs de segurança
        log_safe(security_logger, 'info', f"[ANALYTICS] Dados analytics recebidos: {session_id} ({data_type})")
        
        # Enviar para InfluxDB
        if influxdb_service:
            try:
                user_agent = request.headers.get('User-Agent', 'unknown')
                ip_address = request.environ.get('REMOTE_ADDR', 'unknown')
                
                temporal_metrics = create_temporal_metric_from_heatmap(
                    session_id=session_id,
                    heatmap_data=data,
                    user_agent=user_agent,
                    ip_address=ip_address
                )
                
                for metric in temporal_metrics:
                    influxdb_service.write_temporal_metrics_async(metric)
                    
            except Exception as influx_error:
                log_safe(security_logger, 'error', f"[ERROR] Erro InfluxDB: {str(influx_error)}")

        emit("analytics_received", {
            "status": "success",
            "message": f"Dados recebidos com segurança ({data_type})",
            "id_registro": heatmap_dados.id_registro,
            "timestamp_recebimento": datetime.now().isoformat(),
            "tipo_envio": data_type,
            "security_validated": True,
            "resumo": {
                "total_visualizacoes": heatmap_dados.get_total_visualizacoes(),
                "total_cliques": heatmap_dados.get_total_cliques(),
                "tempo_total_segundos": heatmap_dados.get_total_tempo_segundos(),
                "duracao_sessao_segundos": heatmap_dados.get_duracao_sessao_segundos(),
                "paginas_visitadas": {
                    "home": len(heatmap_dados.home),
                    "about": len(heatmap_dados.about),
                    "projects": len(heatmap_dados.projects),
                }
            }
        })

    except ValueError as e:
        log_safe(security_logger, 'warning', f"[ERROR] Dados invalidos de {session_id}: {str(e)}")
        emit("analytics_error", {"error": f"Dados inválidos: {str(e)}"})

    except Exception as e:
        log_safe(security_logger, 'error', f"[ERROR] Erro interno analytics de {session_id}: {str(e)}")
        emit("analytics_error", {"error": "Erro interno do servidor"})

# ==================== ENDPOINTS HTTP COM SEGURANÇA ====================

@app.route("/analytics/security/status", methods=["GET"])
@limiter.limit("5 per minute")
@security_middleware
def get_security_status():
    """Endpoint para verificar status de segurança"""
    try:
        current_time = time.time()
        
        # Estatísticas de segurança
        active_count = len([s for s in active_sessions.values() 
                           if current_time - s.get('last_activity', 0) < 300])  # Ativas nos últimos 5min
        
        suspicious_count = len(suspicious_ips)
        
        security_stats = {
            "active_sessions": active_count,
            "total_sessions_created": len(active_sessions),
            "suspicious_ips_blocked": suspicious_count,
            "security_events_last_hour": len([
                event for event in temporal_stats_cache.get("security_events", [])
                if current_time - event.get('timestamp', 0) < 3600
            ]),
            "timestamp": datetime.now().isoformat(),
            "security_level": "high",
            "protections_enabled": [
                "session_validation",
                "rate_limiting", 
                "fingerprinting",
                "ip_blocking",
                "csrf_protection"
            ]
        }
        
        return jsonify({
            "status": "success",
            "security": security_stats
        }), 200
        
    except Exception as e:
        log_safe(security_logger, 'error', f"[ERROR] Erro ao obter status seguranca: {str(e)}")
        return jsonify({"error": "Erro interno do servidor"}), 500

@app.route("/analytics/stats/temporal", methods=["GET"])
@limiter.limit("10 per minute")
@security_middleware
def get_temporal_statistics():
    """Endpoint para estatísticas temporais com segurança"""
    try:
        cleanup_temporal_cache()
        
        return jsonify({
            "status": "success",
            "temporal_stats": {
                "total_sessions": temporal_stats_cache["total_sessions"],
                "active_sessions_count": len(temporal_stats_cache["active_sessions"]),
                "cache_size": sum(len(data) for data in temporal_stats_cache["realtime_data"].values()),
                "last_cleanup": temporal_stats_cache["last_cleanup"],
            },
            "timestamp": datetime.now().isoformat()
        }), 200
        
    except Exception as e:
        log_safe(security_logger, 'error', f"[ERROR] Erro ao obter estatisticas temporais: {str(e)}")
        return jsonify({"error": "Erro interno do servidor"}), 500

# ==================== INICIALIZAÇÃO ====================

if __name__ == "__main__":
    # Configurações de segurança para produção
    if env == 'production':
        log_safe(security_logger, 'info', "[CONFIG] Iniciando servidor em modo PRODUCAO com seguranca maxima")
    else:
        log_safe(security_logger, 'info', "[CONFIG] Iniciando servidor em modo DESENVOLVIMENTO")
    
    socketio.run(
        app, 
        host="0.0.0.0", 
        port=5000, 
        debug=(env == 'development'),
        allow_unsafe_werkzeug=(env == 'development')
    )