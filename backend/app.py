from flask import Blueprint, Flask, jsonify, request, session
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
import json
from influxdb_service import get_influxdb_service

# ==================== CONFIGURAÇÃO DE SEGURANÇA ====================

# ✅ CONFIGURAR APPLICATION CONTEXT PARA /api/
app = Flask(__name__)
env = os.environ.get("FLASK_ENV", "development")
app.config.from_object(config[env])

# ✅ CONFIGURAR PREFIXO /api PARA PRODUÇÃO
if env == 'production':
    # Blueprint para organizar rotas com prefixo
    api_bp = Blueprint('api', __name__, url_prefix='/api')
else:
    # Em desenvolvimento, usar sem prefixo
    api_bp = Blueprint('api', __name__)

# ✅ CONFIGURAÇÕES DE SEGURANÇA AVANÇADAS
SECRET_KEY = app.config.get('SECRET_KEY') or secrets.token_urlsafe(32)
app.secret_key = SECRET_KEY

# Configurações de sessão seguras
app.config.update(
    SESSION_COOKIE_SECURE=env == 'production',
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE='Lax',
    PERMANENT_SESSION_LIFETIME=timedelta(hours=1),
    SESSION_COOKIE_NAME='portfolio_session',
    WTF_CSRF_TIME_LIMIT=None,
    # ✅ CONFIGURAÇÃO PARA PROXY REVERSO
    APPLICATION_ROOT='/api' if env == 'production' else '/',
    PREFERRED_URL_SCHEME='https' if env == 'production' else 'http'
)

# ✅ RATE LIMITING
limiter = Limiter(
    key_func=get_remote_address,
    app=app,
    default_limits=["200 per day", "50 per hour"],
    storage_uri="memory://"
)

# ✅ LOGGING SEGURO com rotacao
from logging.handlers import RotatingFileHandler


class SafeRotatingFileHandler(RotatingFileHandler):
    def __init__(self, filename, max_bytes=10 * 1024 * 1024, backup_count=5, encoding='utf-8'):
        super().__init__(filename, maxBytes=max_bytes, backupCount=backup_count, encoding=encoding)


class SafeStreamHandler(logging.StreamHandler):
    def emit(self, record):
        try:
            msg = self.format(record)
            msg = msg.encode('ascii', errors='ignore').decode('ascii')
            stream = self.stream
            stream.write(msg + self.terminator)
            self.flush()
        except Exception:
            self.handleError(record)


logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[SafeStreamHandler(sys.stdout)],
    force=True
)

# security.log recebe SO eventos do security_logger — CrowdSec parsa esse arquivo
# e qualquer ruido de logger root (Flask/Werkzeug/libs) geraria linhas unparsed.
security_logger = logging.getLogger('security')
security_logger.setLevel(logging.INFO)
_security_handler = SafeRotatingFileHandler('security.log')
_security_handler.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
security_logger.addHandler(_security_handler)
security_logger.propagate = False

# ✅ CORS configurado por ambiente
cors_origins = app.config.get("CORS_ORIGINS", ["http://localhost:5173"])

CORS(app, 
     origins=cors_origins,
     supports_credentials=True,
     allow_headers=['Content-Type', 'Authorization', 'X-Session-Token', 'X-Forwarded-For', 'X-Forwarded-Proto'],
     methods=['GET', 'POST', 'OPTIONS']
)

# ✅ SOCKETIO COM SUPORTE A PROXY REVERSO
socketio_config = {
    'cors_allowed_origins': cors_origins,
    'logger': False,
    'engineio_logger': False,
    'ping_timeout': 60,
    'ping_interval': 25
}

if env == 'production':
    socketio_config.update({
        'path': '/api/socket.io',  # Caminho customizado para produção
        'async_mode': 'eventlet'   # Melhor para produção
    })

socketio = SocketIO(app, **socketio_config)

# ==================== MIDDLEWARE PARA PROXY REVERSO ====================

@app.before_request
def before_request():
    """Middleware para lidar com headers de proxy reverso"""
    # Configurar HTTPS quando atrás de proxy
    if request.headers.get('X-Forwarded-Proto') == 'https':
        request.environ['wsgi.url_scheme'] = 'https'
    
    # Configurar IP real do cliente
    if request.headers.get('X-Forwarded-For'):
        request.environ['REMOTE_ADDR'] = request.headers.get('X-Forwarded-For').split(',')[0].strip()

def log_safe(logger, level, message, *args):
    """Log seguro que remove emojis problemáticos"""
    emoji_map = {
        '🔧': '[CONFIG]', '🔒': '[SECURITY]', '✅': '[SUCCESS]',
        '⚠️': '[WARNING]', '❌': '[ERROR]', '🔌': '[WEBSOCKET]',
        '📊': '[ANALYTICS]', '🚫': '[BLOCKED]', '🧹': '[CLEANUP]',
        '⏰': '[TIMEOUT]', '🌐': '[REMOTE]', '💻': '[LOCAL]', '🔍': '[DEBUG]'
    }
    
    safe_message = message
    for emoji, replacement in emoji_map.items():
        safe_message = safe_message.replace(emoji, replacement)
    
    getattr(logger, level)(safe_message, *args)

# ==================== SISTEMA DE SESSÕES (mantido igual) ====================
active_sessions = {}
session_metrics = defaultdict(lambda: {
    'requests_count': 0, 'last_activity': time.time(),
    'ip_address': None, 'user_agent': None,
    'security_score': 100, 'warnings': []
})
suspicious_ips = set()
rate_limit_violations = defaultdict(list)

def generate_session_token():
    return secrets.token_urlsafe(32)

def create_session_fingerprint(request):
    user_agent = request.headers.get('User-Agent', '')
    ip_address = request.environ.get('REMOTE_ADDR', '')
    accept_language = request.headers.get('Accept-Language', '')
    fingerprint_string = f"{ip_address}:{user_agent}:{accept_language}"
    return hashlib.sha256(fingerprint_string.encode()).hexdigest()[:16]

def validate_session_integrity(session_id: str, request) -> bool:
    if session_id not in active_sessions:
        return False
    session_data = active_sessions[session_id]
    current_fingerprint = create_session_fingerprint(request)
    if session_data.get('fingerprint') != current_fingerprint:
        log_safe(security_logger, 'warning', f"[SECURITY] Possivel session hijacking detectado: {session_id}")
        return False
    if time.time() - session_data.get('created_at', 0) > 3600:
        log_safe(security_logger, 'info', f"[TIMEOUT] Sessao expirada: {session_id}")
        return False
    return True

def check_suspicious_activity(session_id: str, request) -> bool:
    ip_address = request.environ.get('REMOTE_ADDR', '')
    current_time = time.time()
    if ip_address in suspicious_ips:
        log_safe(security_logger, 'warning', f"[BLOCKED] IP suspeito tentando acesso: {ip_address}")
        return False
    recent_requests = [t for t in rate_limit_violations[ip_address] if current_time - t < 60]
    if len(recent_requests) > 30:
        log_safe(security_logger, 'warning', f"[WARNING] Rate limit excedido para IP: {ip_address}")
        suspicious_ips.add(ip_address)
        return False
    rate_limit_violations[ip_address].append(current_time)
    return True

def security_middleware(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        session_id = request.sid if hasattr(request, 'sid') else 'http'
        if not check_suspicious_activity(session_id, request):
            log_safe(security_logger, 'warning',
                     f"evento=acesso_bloqueado session_id={session_id} "
                     f"ip={request.environ.get('REMOTE_ADDR', 'unknown')} motivo=suspicious")
            return jsonify({"error": "Acesso negado"}), 403
        session_id = request.sid if hasattr(request, 'sid') else request.headers.get('X-Session-Token')
        if session_id:
            session_metrics[session_id]['requests_count'] += 1
            session_metrics[session_id]['last_activity'] = time.time()
            session_metrics[session_id]['ip_address'] = request.environ.get('REMOTE_ADDR', '')
        return f(*args, **kwargs)
    return decorated_function

# ==================== CACHE TEMPORAL ====================
temporal_stats_cache = {
    "total_sessions": 0, "active_sessions": {},
    "realtime_data": defaultdict(list), "last_cleanup": time.time(), "security_events": []
}

TEMPORAL_CONFIG = {
    "REALTIME_INTERVAL": app.config.get("TEMPORAL_REALTIME_INTERVAL", 5000),
    "REGULAR_INTERVAL": app.config.get("TEMPORAL_REGULAR_INTERVAL", 15000),
    "CACHE_CLEANUP_INTERVAL": app.config.get("TEMPORAL_CLEANUP_INTERVAL", 300),
    "MAX_CACHE_ENTRIES": app.config.get("TEMPORAL_CACHE_SIZE", 1000)
}

def cleanup_temporal_cache():
    current_time = time.time()
    if current_time - temporal_stats_cache["last_cleanup"] > TEMPORAL_CONFIG["CACHE_CLEANUP_INTERVAL"]:
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
        for page in temporal_stats_cache["realtime_data"]:
            if len(temporal_stats_cache["realtime_data"][page]) > TEMPORAL_CONFIG["MAX_CACHE_ENTRIES"]:
                temporal_stats_cache["realtime_data"][page] = temporal_stats_cache["realtime_data"][page][-TEMPORAL_CONFIG["MAX_CACHE_ENTRIES"]//2:]
        temporal_stats_cache["last_cleanup"] = current_time

# Inicializar InfluxDB
try:
    influxdb_service = get_influxdb_service()
    log_safe(security_logger, 'info', "[SUCCESS] InfluxDB service inicializado com sucesso")
except Exception as e:
    log_safe(security_logger, 'warning', f"[WARNING] Erro ao inicializar InfluxDB: {str(e)}")
    influxdb_service = None

# Servico de ingestao — handler Socket.IO apenas delega para este servico.
from ingestao import ServicoIngestao  # noqa: E402
servico_ingestao = ServicoIngestao(influxdb_service=influxdb_service)

# ==================== AUTENTICACAO MULTI-TENANT ====================
from auth.jwt_service import obter_servico as obter_jwt_service  # noqa: E402
from auth.middleware import AuthError, normalizar_origin, validar_token_socketio  # noqa: E402
from auth.routes import auth_bp  # noqa: E402
from auth.tenants_repo import obter_repo as obter_tenants_repo  # noqa: E402

try:
    obter_tenants_repo(app.config["TENANTS_DATABASE_URL"])
    obter_jwt_service(
        keys_dir=app.config["JWT_KEYS_DIR"],
        audience=app.config["JWT_AUDIENCE"],
    )
    log_safe(security_logger, 'info', "[SUCCESS] Auth multi-tenant inicializado")
except Exception as e:
    log_safe(security_logger, 'error', f"[ERROR] Falha ao inicializar auth: {str(e)}")
    raise

app.register_blueprint(auth_bp, url_prefix=('/api/auth' if env == 'production' else '/auth'))

# ==================== AUTH DO DASHBOARD DO CLIENTE ====================
# Blueprint `/api/cliente/auth` com login humano (cookie HttpOnly) para
# acessar o dashboard de metricas em /cliente/metricas/*.
# Referencia: ark/docs/dashboard-cliente.md
from auth.clientes_users_repo import obter_repo as obter_clientes_users_repo  # noqa: E402
from auth.sessao_service import SessaoService  # noqa: E402
from auth import cliente_routes as _cliente_routes_mod  # noqa: E402

try:
    _clientes_users_repo = obter_clientes_users_repo(app.config["TENANTS_DATABASE_URL"])
    _sessao_service = SessaoService(_clientes_users_repo)
    _cliente_routes_mod.configurar(_sessao_service)
    app.register_blueprint(_cliente_routes_mod.cliente_auth_bp)
    log_safe(security_logger, 'info', "[SUCCESS] Auth do dashboard inicializado")
except Exception as e:
    log_safe(security_logger, 'error', f"[ERROR] Falha ao inicializar auth do dashboard: {str(e)}")
    raise

# ==================== ROTAS COM BLUEPRINT ====================

@api_bp.route("/", methods=["GET"])
@limiter.limit("10 per minute")
def index():
    return jsonify({
        "message": "API do Portfólio está funcionando!",
        "security": "enabled",
        "timestamp": datetime.now().isoformat(),
        "influxdb_status": "connected" if influxdb_service else "disconnected",
        "environment": env,
        "context": "api" if env == 'production' else "root"
    })

@api_bp.route("/health", methods=["GET"])
@limiter.limit("30 per minute")
def health_check():
    """Resumo agregado. Mantem formato anterior para compat."""
    return jsonify({
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "security": "enabled",
        "active_sessions": len(active_sessions),
        "influxdb": "connected" if (influxdb_service and _influxdb_saudavel()) else "disconnected"
    })


def _influxdb_saudavel() -> bool:
    if not influxdb_service:
        return False
    try:
        return bool(influxdb_service.is_healthy())
    except Exception:
        return False


@api_bp.route("/health/app", methods=["GET"])
@limiter.limit("60 per minute")
def health_app():
    return jsonify({
        "status": "healthy",
        "detalhe": {
            "timestamp": datetime.now().isoformat(),
            "active_sessions": len(active_sessions),
        },
    })


@api_bp.route("/health/socketio", methods=["GET"])
@limiter.limit("60 per minute")
def health_socketio():
    # Se a aplicacao responde e o socketio foi inicializado, considera saudavel.
    return jsonify({
        "status": "healthy" if socketio is not None else "unavailable",
        "detalhe": {"conexoes_ativas": len(active_sessions)},
    })


@api_bp.route("/health/influxdb", methods=["GET"])
@limiter.limit("60 per minute")
def health_influxdb():
    if influxdb_service is None:
        return jsonify({
            "status": "unavailable",
            "detalhe": "InfluxDB service nao inicializado",
        }), 503

    if _influxdb_saudavel():
        url = getattr(influxdb_service, 'url', None)
        return jsonify({
            "status": "healthy",
            "detalhe": {"url": url if isinstance(url, str) else None},
        })

    return jsonify({
        "status": "degraded",
        "detalhe": "InfluxDB configurado mas is_healthy() retornou False",
    }), 503

@api_bp.route("/analytics/security/status", methods=["GET"])
@limiter.limit("5 per minute")
@security_middleware
def get_security_status():
    try:
        current_time = time.time()
        active_count = len([s for s in active_sessions.values() 
                           if current_time - s.get('last_activity', 0) < 300])
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
                "session_validation", "rate_limiting", "fingerprinting",
                "ip_blocking", "csrf_protection"
            ]
        }
        
        return jsonify({"status": "success", "security": security_stats}), 200
        
    except Exception as e:
        log_safe(security_logger, 'error', f"[ERROR] Erro ao obter status seguranca: {str(e)}")
        return jsonify({"error": "Erro interno do servidor"}), 500

@api_bp.route("/analytics/stats/temporal", methods=["GET"])
@limiter.limit("10 per minute")
@security_middleware
def get_temporal_statistics():
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


def _parametros_consulta_comuns():
    """Extrai os parametros de filtro usados em todos os endpoints de query."""
    app_id = request.args.get('app_id')
    page_type = request.args.get('page_type')
    ambiente = request.args.get('ambiente')
    inicio = request.args.get('inicio', '-24h')
    fim = request.args.get('fim', 'now()')
    try:
        limit = int(request.args.get('limit', '100'))
    except ValueError:
        limit = 100
    limit = max(1, min(limit, 1000))
    return {
        'app_id': app_id,
        'page_type': page_type,
        'ambiente': ambiente,
        'inicio': inicio,
        'fim': fim,
        'limit': limit,
    }


@api_bp.route("/analytics/metricas", methods=["GET"])
@limiter.limit("30 per minute")
@security_middleware
def get_analytics_metricas():
    """Soma contadores agregados de `page_analytics` por pagina e periodo."""
    if not influxdb_service:
        return jsonify({"status": "unavailable", "detalhe": "InfluxDB nao inicializado"}), 503

    params = _parametros_consulta_comuns()
    pontos = influxdb_service.query_metricas_agregadas(**params)
    return jsonify({
        "status": "success",
        "filtros": params,
        "pontos": pontos,
    })


@api_bp.route("/analytics/web-vitals", methods=["GET"])
@limiter.limit("30 per minute")
@security_middleware
def get_analytics_web_vitals():
    """Lista pontos de Web Vitals (LCP/CLS/INP)."""
    if not influxdb_service:
        return jsonify({"status": "unavailable"}), 503

    params = _parametros_consulta_comuns()
    nome = request.args.get('nome')
    # page_type/ambiente nao sao usados no filter do web-vitals atualmente
    pontos = influxdb_service.query_web_vitals(
        app_id=params['app_id'],
        page_type=params['page_type'],
        nome=nome,
        inicio=params['inicio'],
        fim=params['fim'],
        limit=params['limit'],
    )
    return jsonify({
        "status": "success",
        "filtros": {**params, "nome": nome},
        "pontos": pontos,
    })


@api_bp.route("/analytics/custom-events", methods=["GET"])
@limiter.limit("30 per minute")
@security_middleware
def get_analytics_custom_events():
    """Soma ocorrencias de eventos customizados por nome e pagina."""
    if not influxdb_service:
        return jsonify({"status": "unavailable"}), 503

    params = _parametros_consulta_comuns()
    nome = request.args.get('nome')
    pontos = influxdb_service.query_custom_events(
        app_id=params['app_id'],
        nome=nome,
        page_type=params['page_type'],
        inicio=params['inicio'],
        fim=params['fim'],
        limit=params['limit'],
    )
    return jsonify({
        "status": "success",
        "filtros": {**params, "nome": nome},
        "pontos": pontos,
    })


# ==================== LGPD — ADMIN ====================


def _verificar_token_admin():
    token_esperado = os.environ.get('ADMIN_API_TOKEN')
    if not token_esperado:
        return False, "ADMIN_API_TOKEN nao configurado"
    header = request.headers.get('Authorization', '')
    if not header.startswith('Bearer '):
        return False, "Header Authorization: Bearer <token> ausente"
    token = header[len('Bearer '):].strip()
    if token != token_esperado:
        return False, "Token invalido"
    return True, None


def _registrar_audit(acao: str, session_id: str, resultado: str):
    """Grava linha de auditoria administrativa."""
    log_safe(security_logger, 'info',
             f"[ADMIN-AUDIT] acao={acao} session_id={session_id} "
             f"resultado={resultado} ip={request.environ.get('REMOTE_ADDR', 'unknown')} "
             f"timestamp={datetime.now().isoformat()}")


@api_bp.route("/admin/analytics/sessao/<session_id>", methods=["GET"])
@limiter.limit("60 per minute")
def admin_sessao_consultar(session_id):
    """LGPD — acesso: retorna todos os pontos de uma sessao."""
    ok, motivo = _verificar_token_admin()
    if not ok:
        return jsonify({"status": "error", "code": "UNAUTHORIZED", "message": motivo}), 401

    if not influxdb_service:
        return jsonify({"status": "unavailable"}), 503

    dados = influxdb_service.consultar_por_session_id(session_id)
    _registrar_audit('consultar', session_id, 'ok')
    return jsonify({
        "status": "success",
        "session_id": session_id,
        "dados": dados,
    })


@api_bp.route("/admin/analytics/sessao/<session_id>", methods=["DELETE"])
@limiter.limit("20 per minute")
def admin_sessao_apagar(session_id):
    """LGPD — exclusao: apaga todos os pontos de uma sessao em todos os measurements."""
    ok, motivo = _verificar_token_admin()
    if not ok:
        return jsonify({"status": "error", "code": "UNAUTHORIZED", "message": motivo}), 401

    if not influxdb_service:
        _registrar_audit('apagar', session_id, 'falha_influxdb_ausente')
        return jsonify({"status": "unavailable"}), 503

    sucesso = influxdb_service.apagar_por_session_id(session_id)
    _registrar_audit('apagar', session_id, 'ok' if sucesso else 'falha')
    return jsonify({
        "status": "success" if sucesso else "partial",
        "session_id": session_id,
        "apagado": sucesso,
    })


# ✅ REGISTRAR BLUEPRINT
app.register_blueprint(api_bp)

# ==================== WEBSOCKET EVENTS ====================

@socketio.on("connect")
def handle_connect(auth=None):
    session_id = request.sid
    ip_address = request.environ.get('REMOTE_ADDR', 'unknown')
    user_agent = request.headers.get('User-Agent', 'unknown')
    origin = normalizar_origin(request.headers.get('Origin') or request.environ.get('HTTP_ORIGIN'))

    if not check_suspicious_activity(session_id, request):
        log_safe(security_logger, 'warning', f"[BLOCKED] Conexao WebSocket negada para IP suspeito: {ip_address}")
        disconnect()
        return

    # Validacao do sdk_jwt (quando presente ou quando obrigatorio).
    token = None
    if isinstance(auth, dict):
        token = auth.get('token')

    auth_claims = None
    site_id_auth = None

    if token:
        try:
            auth_claims = validar_token_socketio(token, scope_esperado='ingest')
        except AuthError as err:
            log_safe(security_logger, 'warning',
                     f"[SECURITY] handshake rejeitado code={err.code} ip={ip_address}")
            disconnect()
            return

        # Defesa em profundidade: revalida Origin contra allowlist do site.
        repo = obter_tenants_repo()
        if origin is None or not repo.origin_permitido(auth_claims.site_id, origin):
            log_safe(security_logger, 'warning',
                     f"[SECURITY] handshake rejeitado code=ORIGIN_NOT_ALLOWED site={auth_claims.site_id} origin={origin}")
            disconnect()
            return

        site_id_auth = auth_claims.site_id
    elif app.config.get('SDK_AUTH_REQUIRED', False):
        log_safe(security_logger, 'warning',
                 f"[SECURITY] handshake rejeitado code=TOKEN_MISSING ip={ip_address}")
        disconnect()
        return

    fingerprint = create_session_fingerprint(request)
    session_token = generate_session_token()

    active_sessions[session_id] = {
        'token': session_token, 'fingerprint': fingerprint,
        'ip_address': ip_address, 'user_agent': user_agent,
        'created_at': time.time(), 'last_activity': time.time(), 'request_count': 0,
        'site_id': site_id_auth,
        'app_id': auth_claims.app_id if auth_claims else None,
        'ambiente': auth_claims.ambiente if auth_claims else None,
        'scope': auth_claims.scope if auth_claims else None,
        'jwt_exp': auth_claims.exp if auth_claims else None,
        'origin': origin,
    }

    log_safe(security_logger, 'info',
             f"evento=conectado session_id={session_id} ip={ip_address} site={site_id_auth or '-'}")

    # Onda 1 — resync pos-reconnect: se o cliente passar analytics_session_id no
    # handshake, devolvemos o ultimo id_registro aceito para aquela sessao logica,
    # permitindo ao SDK descartar itens da fila ja processados.
    analytics_session_id = None
    if isinstance(auth, dict):
        analytics_session_id = auth.get('analytics_session_id')
    last_id = last_at = None
    if analytics_session_id:
        from ingestao.idempotencia import obter_registro_ultimo
        last_id, last_at = obter_registro_ultimo().obter(analytics_session_id)

    emit("connection_response", {
        "status": "connected",
        "session_token": session_token,
        "site_id": site_id_auth,
        "authenticated": auth_claims is not None,
        "timestamp": datetime.now().isoformat(),
        "server_time": int(time.time() * 1000),
        "last_received_id_registro": last_id,
        "last_received_at": last_at,
        "security_level": "high" if auth_claims else "legacy"
    })

@socketio.on("disconnect")
def handle_disconnect():
    session_id = request.sid
    if session_id in active_sessions:
        session_data = active_sessions[session_id]
        duration = time.time() - session_data.get('created_at', 0)
        log_safe(security_logger, 'info',
                 f"evento=desconectado session_id={session_id} duracao_s={duration:.1f}")
        del active_sessions[session_id]
    if session_id in temporal_stats_cache["active_sessions"]:
        del temporal_stats_cache["active_sessions"][session_id]

@socketio.on("analytics_data")
@security_middleware
def handle_analytics_data(data):
    try:
        session_id = request.sid

        if not validate_session_integrity(session_id, request):
            log_safe(security_logger, 'warning', f"[SECURITY] Sessao invalida tentando enviar dados: {session_id}")
            emit("analytics_error", {"status": "error", "code": "INVALID_SESSION", "message": "Sessao invalida"})
            disconnect()
            return

        active_sessions[session_id]['last_activity'] = time.time()
        active_sessions[session_id]['request_count'] += 1

        if active_sessions[session_id]['request_count'] > 100:
            log_safe(security_logger, 'warning', f"[WARNING] Rate limit de sessao excedido: {session_id}")
            emit("analytics_error", {"status": "error", "code": "RATE_LIMIT", "message": "Rate limit excedido"})
            return

        cleanup_temporal_cache()

        if not data:
            emit("analytics_error", {"status": "error", "code": "EMPTY_PAYLOAD", "message": "Nenhum dado foi enviado"})
            return

        user_agent = request.headers.get('User-Agent', 'unknown')
        ip_address = request.environ.get('REMOTE_ADDR', 'unknown')

        site_id_ativo = active_sessions[session_id].get('site_id')
        resumo = servico_ingestao.ingerir(
            session_id=session_id,
            data=data,
            user_agent=user_agent,
            ip_address=ip_address,
            site_id=site_id_ativo,
        )

        if resumo.status == 'success':
            temporal_stats_cache["total_sessions"] += 1
            temporal_stats_cache["active_sessions"][session_id] = {
                "last_update": datetime.now().isoformat(),
                "id_registro": resumo.id_registro,
                "security_validated": True,
                "ip_address": active_sessions[session_id]['ip_address'],
            }

            log_safe(security_logger, 'info',
                     f"[ANALYTICS] validado session={session_id} id_registro={resumo.id_registro}")
            emit("analytics_received", resumo.to_dict())
        else:
            log_safe(security_logger, 'warning',
                     f"[ANALYTICS] rejeitado session={session_id} erros={resumo.erros}")
            emit("analytics_error", resumo.to_dict())

    except Exception as e:
        log_safe(security_logger, 'error', f"[ERROR] Erro interno analytics de {session_id}: {str(e)}")
        emit("analytics_error", {"status": "error", "code": "INTERNAL_ERROR", "message": "Erro interno do servidor"})

# ==================== INICIALIZAÇÃO ====================

if __name__ == "__main__":
    if env == 'production':
        log_safe(security_logger, 'info', "[CONFIG] Iniciando servidor em modo PRODUCAO com seguranca maxima")
    else:
        log_safe(security_logger, 'info', "[CONFIG] Iniciando servidor em modo DESENVOLVIMENTO")
    
    socketio.run(
        app, host=app.config.get("HOST", "127.0.0.1"), port=app.config.get("PORT", 5000),
        debug=(env == 'development'),
        allow_unsafe_werkzeug=(env == 'development')
    )
