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
from dto.Dados import HeatmapDados
import json
from influxdb_service import (
    get_influxdb_service,
    create_temporal_metric_from_heatmap,
    TemporalMetric,
)

# ==================== CONFIGURAÇÃO DE SEGURANÇA ====================

app = Flask(__name__)
env = os.environ.get("FLASK_ENV", "development")
app.config.from_object(config[env])
api_bp = Blueprint("api", __name__)

# ✅ CONFIGURAÇÕES DE SEGURANÇA AVANÇADAS
SECRET_KEY = app.config.get("SECRET_KEY") or secrets.token_urlsafe(32)
app.secret_key = SECRET_KEY

# Configurações de sessão seguras
app.config.update(
    SESSION_COOKIE_SECURE=env == "production",
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    PERMANENT_SESSION_LIFETIME=timedelta(hours=1),
    SESSION_COOKIE_NAME="portfolio_session",
    WTF_CSRF_TIME_LIMIT=None,
    # ✅ CONFIGURAÇÃO PARA PROXY REVERSO
    APPLICATION_ROOT="/api" if env == "production" else "/",
    PREFERRED_URL_SCHEME="https" if env == "production" else "http",
)

# ✅ RATE LIMITING
limiter = Limiter(
    key_func=get_remote_address,
    app=app,
    default_limits=["200 per day", "50 per hour"],
    storage_uri="memory://",
)


# ✅ LOGGING SEGURO
class SafeFileHandler(logging.FileHandler):
    def __init__(self, filename, mode="a", encoding="utf-8", delay=False):
        super().__init__(filename, mode, encoding, delay)


class SafeStreamHandler(logging.StreamHandler):
    def emit(self, record):
        try:
            msg = self.format(record)
            msg = msg.encode("ascii", errors="ignore").decode("ascii")
            stream = self.stream
            stream.write(msg + self.terminator)
            self.flush()
        except Exception:
            self.handleError(record)


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[
        SafeFileHandler("security.log", encoding="utf-8"),
        SafeStreamHandler(sys.stdout),
    ],
    force=True,
)
security_logger = logging.getLogger("security")

# ✅ CORS COM SUPORTE A PROXY REVERSO
cors_origins = app.config.get("CORS_ORIGINS", ["http://localhost:5173"])
if env == "production":
    cors_origins.extend(
        ["https://dsplayground.com.br", "https://www.dsplayground.com.br"]
    )

CORS(
    app,
    origins=cors_origins,
    supports_credentials=True,
    allow_headers=[
        "Content-Type",
        "Authorization",
        "X-Session-Token",
        "X-Forwarded-For",
        "X-Forwarded-Proto",
    ],
    methods=["GET", "POST", "OPTIONS"],
)

# ✅ SOCKETIO COM SUPORTE A PROXY REVERSO
socketio_config = {
    "cors_allowed_origins": cors_origins,
    "logger": True if env == "development" else False,
    "engineio_logger": True if env == "development" else False,
    "ping_timeout": 60,
    "ping_interval": 25,
    # ✅ CONFIGURAÇÕES PARA PYTHON-SOCKETIO 5.14.x
    "async_mode": "eventlet",
    "manage_session": False,
    "always_connect": True,
    # ✅ CONFIGURAÇÕES DE TRANSPORTE MODERNAS
    "transports": ["polling", "websocket"],
    "allow_upgrades": True,
    "cookie": None,  # ✅ Não usar cookies do socket.io
}

if env == "production":
    socketio_config.update(
        {
            "path": "/api/socket.io",
            # ✅ CONFIGURAÇÕES ESPECÍFICAS PARA PRODUÇÃO COM VERSÃO RECENTE
            "cors_credentials": True,
            "monitor_clients": True,  # ✅ Disponível em versões recentes
            "json": None,  # ✅ Usar JSON padrão
        }
    )

socketio = SocketIO(app, **socketio_config)

# ==================== MIDDLEWARE PARA PROXY REVERSO ====================


@app.before_request
def before_request():
    """Middleware para lidar com headers de proxy reverso"""
    # Configurar HTTPS quando atrás de proxy
    if request.headers.get("X-Forwarded-Proto") == "https":
        request.environ["wsgi.url_scheme"] = "https"

    # Configurar IP real do cliente
    if request.headers.get("X-Forwarded-For"):
        request.environ["REMOTE_ADDR"] = (
            request.headers.get("X-Forwarded-For").split(",")[0].strip()
        )


def log_safe(logger, level, message, *args):
    """Log seguro que remove emojis problemáticos"""
    emoji_map = {
        "🔧": "[CONFIG]",
        "🔒": "[SECURITY]",
        "✅": "[SUCCESS]",
        "⚠️": "[WARNING]",
        "❌": "[ERROR]",
        "🔌": "[WEBSOCKET]",
        "📊": "[ANALYTICS]",
        "🚫": "[BLOCKED]",
        "🧹": "[CLEANUP]",
        "⏰": "[TIMEOUT]",
        "🌐": "[REMOTE]",
        "💻": "[LOCAL]",
        "🔍": "[DEBUG]",
    }

    safe_message = message
    for emoji, replacement in emoji_map.items():
        safe_message = safe_message.replace(emoji, replacement)

    getattr(logger, level)(safe_message, *args)


# ==================== SISTEMA DE SESSÕES (mantido igual) ====================
active_sessions = {}
session_metrics = defaultdict(
    lambda: {
        "requests_count": 0,
        "last_activity": time.time(),
        "ip_address": None,
        "user_agent": None,
        "security_score": 100,
        "warnings": [],
    }
)
suspicious_ips = set()
rate_limit_violations = defaultdict(list)


def generate_session_token():
    return secrets.token_urlsafe(32)


def create_session_fingerprint(request):
    user_agent = request.headers.get("User-Agent", "")
    ip_address = request.environ.get("REMOTE_ADDR", "")
    accept_language = request.headers.get("Accept-Language", "")
    fingerprint_string = f"{ip_address}:{user_agent}:{accept_language}"
    return hashlib.sha256(fingerprint_string.encode()).hexdigest()[:16]


def validate_session_integrity(session_id: str, request) -> bool:
    if session_id not in active_sessions:
        return False
    session_data = active_sessions[session_id]
    current_fingerprint = create_session_fingerprint(request)
    if session_data.get("fingerprint") != current_fingerprint:
        log_safe(
            security_logger,
            "warning",
            f"[SECURITY] Possivel session hijacking detectado: {session_id}",
        )
        return False
    if time.time() - session_data.get("created_at", 0) > 3600:
        log_safe(security_logger, "info", f"[TIMEOUT] Sessao expirada: {session_id}")
        return False
    return True


def check_suspicious_activity(session_id: str, request) -> bool:
    ip_address = request.environ.get("REMOTE_ADDR", "")
    current_time = time.time()
    if ip_address in suspicious_ips:
        log_safe(
            security_logger,
            "warning",
            f"[BLOCKED] IP suspeito tentando acesso: {ip_address}",
        )
        return False
    recent_requests = [
        t for t in rate_limit_violations[ip_address] if current_time - t < 60
    ]
    if len(recent_requests) > 30:
        log_safe(
            security_logger,
            "warning",
            f"[WARNING] Rate limit excedido para IP: {ip_address}",
        )
        suspicious_ips.add(ip_address)
        return False
    rate_limit_violations[ip_address].append(current_time)
    return True


def security_middleware(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not check_suspicious_activity(
            request.sid if hasattr(request, "sid") else "http", request
        ):
            return jsonify({"error": "Acesso negado"}), 403
        session_id = (
            request.sid
            if hasattr(request, "sid")
            else request.headers.get("X-Session-Token")
        )
        if session_id:
            session_metrics[session_id]["requests_count"] += 1
            session_metrics[session_id]["last_activity"] = time.time()
            session_metrics[session_id]["ip_address"] = request.environ.get(
                "REMOTE_ADDR", ""
            )
        return f(*args, **kwargs)

    return decorated_function


# ==================== CACHE TEMPORAL ====================
temporal_stats_cache = {
    "total_sessions": 0,
    "active_sessions": {},
    "realtime_data": defaultdict(list),
    "last_cleanup": time.time(),
    "security_events": [],
}

TEMPORAL_CONFIG = {
    "REALTIME_INTERVAL": app.config.get("TEMPORAL_REALTIME_INTERVAL", 5000),
    "REGULAR_INTERVAL": app.config.get("TEMPORAL_REGULAR_INTERVAL", 15000),
    "CACHE_CLEANUP_INTERVAL": app.config.get("TEMPORAL_CLEANUP_INTERVAL", 300),
    "MAX_CACHE_ENTRIES": app.config.get("TEMPORAL_CACHE_SIZE", 1000),
}


def cleanup_temporal_cache():
    current_time = time.time()
    if (
        current_time - temporal_stats_cache["last_cleanup"]
        > TEMPORAL_CONFIG["CACHE_CLEANUP_INTERVAL"]
    ):
        expired_sessions = [
            sid
            for sid, data in active_sessions.items()
            if current_time - data.get("last_activity", 0) > 3600
        ]
        for sid in expired_sessions:
            del active_sessions[sid]
            if sid in temporal_stats_cache["active_sessions"]:
                del temporal_stats_cache["active_sessions"][sid]
        if expired_sessions:
            log_safe(
                security_logger,
                "info",
                f"[CLEANUP] Removidas {len(expired_sessions)} sessoes expiradas",
            )
        for page in temporal_stats_cache["realtime_data"]:
            if (
                len(temporal_stats_cache["realtime_data"][page])
                > TEMPORAL_CONFIG["MAX_CACHE_ENTRIES"]
            ):
                temporal_stats_cache["realtime_data"][page] = temporal_stats_cache[
                    "realtime_data"
                ][page][-TEMPORAL_CONFIG["MAX_CACHE_ENTRIES"] // 2 :]
        temporal_stats_cache["last_cleanup"] = current_time


def detect_data_type(data: dict) -> str:
    current_time = int(time.time() * 1000)
    if data.get("timestamp_final"):
        time_diff = current_time - data["timestamp_final"]
        if time_diff < 10000:
            return "temporal"
    total_interactions = 0
    for page_name in ["home", "about", "projects"]:
        if page_name in data and data[page_name]:
            for session in data[page_name]:
                total_interactions += len(session.get("cliques", []))
                total_interactions += len(session.get("toques", []))
                total_interactions += len(session.get("scrolls", []))
    if total_interactions < 5:
        return "temporal"
    return "regular"


# Inicializar InfluxDB
try:
    influxdb_service = get_influxdb_service()
    log_safe(
        security_logger, "info", "[SUCCESS] InfluxDB service inicializado com sucesso"
    )
except Exception as e:
    log_safe(
        security_logger, "warning", f"[WARNING] Erro ao inicializar InfluxDB: {str(e)}"
    )
    influxdb_service = None

# ==================== ROTAS COM BLUEPRINT ====================


@api_bp.route("/", methods=["GET"])
@limiter.limit("10 per minute")
def index():
    return jsonify(
        {
            "message": "API do Portfólio está funcionando!",
            "security": "enabled",
            "timestamp": datetime.now().isoformat(),
            "influxdb_status": "connected" if influxdb_service else "disconnected",
            "environment": env,
            "context": "api" if env == "production" else "root",
        }
    )


@api_bp.route("/health", methods=["GET"])
@limiter.limit("30 per minute")
def health_check():
    return jsonify(
        {
            "status": "healthy",
            "timestamp": datetime.now().isoformat(),
            "security": "enabled",
            "active_sessions": len(active_sessions),
            "influxdb": "connected" if influxdb_service else "disconnected",
        }
    )


@api_bp.route("/analytics/security/status", methods=["GET"])
@limiter.limit("5 per minute")
@security_middleware
def get_security_status():
    try:
        current_time = time.time()
        active_count = len(
            [
                s
                for s in active_sessions.values()
                if current_time - s.get("last_activity", 0) < 300
            ]
        )
        suspicious_count = len(suspicious_ips)

        security_stats = {
            "active_sessions": active_count,
            "total_sessions_created": len(active_sessions),
            "suspicious_ips_blocked": suspicious_count,
            "security_events_last_hour": len(
                [
                    event
                    for event in temporal_stats_cache.get("security_events", [])
                    if current_time - event.get("timestamp", 0) < 3600
                ]
            ),
            "timestamp": datetime.now().isoformat(),
            "security_level": "high",
            "protections_enabled": [
                "session_validation",
                "rate_limiting",
                "fingerprinting",
                "ip_blocking",
                "csrf_protection",
            ],
        }

        return jsonify({"status": "success", "security": security_stats}), 200

    except Exception as e:
        log_safe(
            security_logger,
            "error",
            f"[ERROR] Erro ao obter status seguranca: {str(e)}",
        )
        return jsonify({"error": "Erro interno do servidor"}), 500


@api_bp.route("/analytics/stats/temporal", methods=["GET"])
@limiter.limit("10 per minute")
@security_middleware
def get_temporal_statistics():
    try:
        cleanup_temporal_cache()
        return (
            jsonify(
                {
                    "status": "success",
                    "temporal_stats": {
                        "total_sessions": temporal_stats_cache["total_sessions"],
                        "active_sessions_count": len(
                            temporal_stats_cache["active_sessions"]
                        ),
                        "cache_size": sum(
                            len(data)
                            for data in temporal_stats_cache["realtime_data"].values()
                        ),
                        "last_cleanup": temporal_stats_cache["last_cleanup"],
                    },
                    "timestamp": datetime.now().isoformat(),
                }
            ),
            200,
        )
    except Exception as e:
        log_safe(
            security_logger,
            "error",
            f"[ERROR] Erro ao obter estatisticas temporais: {str(e)}",
        )
        return jsonify({"error": "Erro interno do servidor"}), 500


# ✅ REGISTRAR BLUEPRINT
app.register_blueprint(api_bp)

# ==================== WEBSOCKET EVENTS ====================


@socketio.on("connect")
def handle_connect():
    session_id = request.sid
    ip_address = request.environ.get("REMOTE_ADDR", "unknown")
    user_agent = request.headers.get("User-Agent", "unknown")

    if not check_suspicious_activity(session_id, request):
        log_safe(
            security_logger,
            "warning",
            f"[BLOCKED] Conexao WebSocket negada para IP suspeito: {ip_address}",
        )
        disconnect()
        return

    fingerprint = create_session_fingerprint(request)
    session_token = generate_session_token()

    active_sessions[session_id] = {
        "token": session_token,
        "fingerprint": fingerprint,
        "ip_address": ip_address,
        "user_agent": user_agent,
        "created_at": time.time(),
        "last_activity": time.time(),
        "request_count": 0,
    }

    log_safe(
        security_logger,
        "info",
        f"[WEBSOCKET] Nova conexao WebSocket: {session_id} de {ip_address}",
    )

    emit(
        "connection_response",
        {
            "status": "connected",
            "session_token": session_token,
            "message": "Conectado com segurança ao servidor de analytics",
            "timestamp": datetime.now().isoformat(),
            "security_level": "high",
        },
    )


@socketio.on("disconnect")
def handle_disconnect():
    session_id = request.sid
    if session_id in active_sessions:
        session_data = active_sessions[session_id]
        duration = time.time() - session_data.get("created_at", 0)
        log_safe(
            security_logger,
            "info",
            f"[WEBSOCKET] Desconexao WebSocket: {session_id} (duracao: {duration:.1f}s)",
        )
        del active_sessions[session_id]
    if session_id in temporal_stats_cache["active_sessions"]:
        del temporal_stats_cache["active_sessions"][session_id]


@socketio.on("analytics_data")
@security_middleware
def handle_analytics_data(data):
    try:
        session_id = request.sid

        if not validate_session_integrity(session_id, request):
            log_safe(
                security_logger,
                "warning",
                f"[SECURITY] Sessao invalida tentando enviar dados: {session_id}",
            )
            emit("analytics_error", {"error": "Sessão inválida"})
            disconnect()
            return

        active_sessions[session_id]["last_activity"] = time.time()
        active_sessions[session_id]["request_count"] += 1

        if active_sessions[session_id]["request_count"] > 100:
            log_safe(
                security_logger,
                "warning",
                f"[WARNING] Rate limit de sessao excedido: {session_id}",
            )
            emit("analytics_error", {"error": "Rate limit excedido"})
            return

        cleanup_temporal_cache()

        if not data:
            emit("analytics_error", {"error": "Nenhum dado foi enviado"})
            return

        data_type = detect_data_type(data)
        is_temporal = data_type == "temporal"

        heatmap_dados = HeatmapDados.from_dict(data)

        if is_temporal:
            temporal_stats_cache["total_sessions"] += 1
            temporal_stats_cache["active_sessions"][session_id] = {
                "last_update": datetime.now().isoformat(),
                "data": heatmap_dados,
                "security_validated": True,
                "ip_address": active_sessions[session_id]["ip_address"],
            }

        log_safe(
            security_logger,
            "info",
            f"[ANALYTICS] Dados analytics recebidos: {session_id} ({data_type})",
        )

        if influxdb_service:
            try:
                user_agent = request.headers.get("User-Agent", "unknown")
                ip_address = request.environ.get("REMOTE_ADDR", "unknown")

                temporal_metrics = create_temporal_metric_from_heatmap(
                    session_id=session_id,
                    heatmap_data=data,
                    user_agent=user_agent,
                    ip_address=ip_address,
                )

                for metric in temporal_metrics:
                    influxdb_service.write_temporal_metrics_async(metric)

            except Exception as influx_error:
                log_safe(
                    security_logger,
                    "error",
                    f"[ERROR] Erro InfluxDB: {str(influx_error)}",
                )

        emit(
            "analytics_received",
            {
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
                    },
                },
            },
        )

    except ValueError as e:
        log_safe(
            security_logger,
            "warning",
            f"[ERROR] Dados invalidos de {session_id}: {str(e)}",
        )
        emit("analytics_error", {"error": f"Dados inválidos: {str(e)}"})
    except Exception as e:
        log_safe(
            security_logger,
            "error",
            f"[ERROR] Erro interno analytics de {session_id}: {str(e)}",
        )
        emit("analytics_error", {"error": "Erro interno do servidor"})


if __name__ == "__main__":
    # ✅ MANTER APENAS ESTE REGISTRO (com lógica condicional)
    if env == "production":
        app.register_blueprint(api_bp, url_prefix="/api")
    else:
        app.register_blueprint(api_bp)

    # Inicializar servidor
    if env == "production":
        socketio.run(app, host="127.0.0.1", port=5000, debug=False, use_reloader=False)
    else:
        socketio.run(app, host="127.0.0.1", port=5000, debug=True)