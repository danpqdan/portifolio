from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import os
from config import config
from dto.Dados import HeatmapDados
import json
from datetime import datetime
from collections import defaultdict
import time
from typing import Dict, List, Optional
from flask_socketio import request

# Importar serviço InfluxDB
from influxdb_service import (
    get_influxdb_service,
    create_temporal_metric_from_heatmap,
    TemporalMetric,
)

app = Flask(__name__)
env = os.environ.get("FLASK_ENV", "development")
app.config.from_object(config[env])

# Configurar CORS para Flask
CORS(app, origins=app.config["CORS_ORIGINS"])

# Configurar SocketIO com CORS
socketio = SocketIO(
    app,
    cors_allowed_origins=app.config["CORS_ORIGINS"],
    logger=True,
    engineio_logger=True,
)

# Inicializar serviço InfluxDB
influxdb_service = get_influxdb_service()

# ==================== CACHE E CONTROLE TEMPORAL ====================

# Cache para estatísticas temporais em tempo real
temporal_stats_cache = {
    "total_sessions": 0,
    "active_sessions": {},  # session_id: dados da sessão
    "realtime_data": defaultdict(list),  # página: [dados temporais]
    "last_cleanup": time.time(),
}

# Configurações temporais (usar da config)
TEMPORAL_CONFIG = {
    "REALTIME_INTERVAL": app.config.get("TEMPORAL_REALTIME_INTERVAL", 5000),
    "REGULAR_INTERVAL": app.config.get("TEMPORAL_REGULAR_INTERVAL", 15000),
    "CACHE_CLEANUP_INTERVAL": app.config.get("TEMPORAL_CLEANUP_INTERVAL", 300),
    "MAX_CACHE_ENTRIES": app.config.get("TEMPORAL_CACHE_SIZE", 1000),
}


def cleanup_temporal_cache():
    """Limpa cache temporal periodicamente"""
    current_time = time.time()
    if (
        current_time - temporal_stats_cache["last_cleanup"]
        > TEMPORAL_CONFIG["CACHE_CLEANUP_INTERVAL"]
    ):
        # Limitar entradas do cache
        for page in temporal_stats_cache["realtime_data"]:
            if (
                len(temporal_stats_cache["realtime_data"][page])
                > TEMPORAL_CONFIG["MAX_CACHE_ENTRIES"]
            ):
                temporal_stats_cache["realtime_data"][page] = temporal_stats_cache[
                    "realtime_data"
                ][page][-TEMPORAL_CONFIG["MAX_CACHE_ENTRIES"] // 2 :]

        temporal_stats_cache["last_cleanup"] = current_time
        print(f"🧹 Cache temporal limpo em {datetime.now().strftime('%H:%M:%S')}")


def detect_data_type(data: dict) -> str:
    """Detecta se os dados são de envio temporal ou regular"""
    # Verifica se há dados recentes (últimos 10 segundos)
    current_time = int(time.time() * 1000)

    # Verifica timestamps dos dados
    if data.get("timestamp_final"):
        time_diff = current_time - data["timestamp_final"]
        if time_diff < 10000:  # Menos de 10 segundos = temporal
            return "temporal"

    # Verifica se há poucas interações (indicativo de envio temporal)
    total_interactions = 0
    for page_name in ["home", "about", "projects"]:
        if page_name in data and data[page_name]:
            for session in data[page_name]:
                total_interactions += len(session.get("cliques", []))
                total_interactions += len(session.get("toques", []))
                total_interactions += len(session.get("scrolls", []))

    # Poucos dados = provavelmente temporal
    if total_interactions < 5:
        return "temporal"

    return "regular"


def print_temporal_logs(heatmap_dados: HeatmapDados, session_id: str):
    """Logs específicos para dados temporais (5s)"""
    print("\n" + "⏱️" * 20)
    print(
        f"📊 DADOS TEMPORAIS RECEBIDOS - {datetime.now().strftime('%H:%M:%S.%f')[:-3]}"
    )
    print("⏱️" * 20)

    print(f"🆔 Sessão: {session_id}")
    print(f"🆔 ID Registro: {heatmap_dados.id_registro}")

    # Estatísticas de tempo em tempo real
    for page_name in ["home", "about", "projects"]:
        page_data = getattr(heatmap_dados, page_name, [])
        if page_data:
            for i, sessao in enumerate(page_data):
                print(f"  ⏱️ {page_name.upper()}: {sessao.segundos}s ativos")
                if sessao.timestamp_inicial and sessao.timestamp_final:
                    duracao = (sessao.timestamp_final - sessao.timestamp_inicial) / 1000
                    print(f"    🕐 Duração real: {duracao:.1f}s")

    print("⏱️" * 20 + "\n")


def print_regular_logs(heatmap_dados: HeatmapDados):
    """Logs detalhados para dados regulares (15s)"""
    print("\n" + "=" * 80)
    print(
        f"📦 DADOS REGULARES RECEBIDOS - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
    )
    print("=" * 80)

    print(f"🆔 ID do Registro: {heatmap_dados.id_registro}")
    print(f"⏰ Timestamp Inicial: {heatmap_dados.timestamp_inicial}")
    print(f"⏰ Timestamp Final: {heatmap_dados.timestamp_final}")

    # Calcular duração da sessão
    duracao_segundos = heatmap_dados.get_duracao_sessao_segundos()
    if duracao_segundos:
        print(f"⏱️  Duração da Sessão: {duracao_segundos:.2f} segundos")

    # Estatísticas gerais
    print(f"📈 Total de Visualizações: {heatmap_dados.get_total_visualizacoes()}")
    print(f"🖱️  Total de Cliques: {heatmap_dados.get_total_cliques()}")
    print(f"⏳ Tempo Total: {heatmap_dados.get_total_tempo_segundos()} segundos")

    # Dados por página
    print("\n📄 DADOS POR PÁGINA:")

    if heatmap_dados.home:
        print(f"  🏠 HOME: {len(heatmap_dados.home)} sessão(ões)")
        for i, sessao in enumerate(heatmap_dados.home):
            print(
                f"    Sessão {i+1}: {sessao.visualizacoes} visualizações, {sessao.segundos}s, {len(sessao.cliques)} cliques"
            )

    if heatmap_dados.about:
        print(f"  👤 ABOUT: {len(heatmap_dados.about)} sessão(ões)")
        for i, sessao in enumerate(heatmap_dados.about):
            print(
                f"    Sessão {i+1}: {sessao.visualizacoes} visualizações, {sessao.segundos}s, {len(sessao.cliques)} cliques"
            )

    if heatmap_dados.projects:
        print(f"  💼 PROJECTS: {len(heatmap_dados.projects)} sessão(ões)")
        for i, sessao in enumerate(heatmap_dados.projects):
            print(
                f"    Sessão {i+1}: {sessao.visualizacoes} visualizações, {sessao.segundos}s, {len(sessao.cliques)} cliques"
            )

    print("=" * 80)
    print("✅ Dados processados com sucesso!")
    print("=" * 80 + "\n")


def get_temporal_stats() -> Dict:
    """Retorna estatísticas temporais em tempo real"""
    stats = {
        "total_sessions": temporal_stats_cache["total_sessions"],
        "active_sessions_count": len(temporal_stats_cache["active_sessions"]),
        "timestamp": datetime.now().isoformat(),
        "pages_stats": {},
    }

    # Estatísticas por página
    for page_name in ["home", "about", "projects"]:
        page_data = temporal_stats_cache["realtime_data"][page_name]
        if page_data:
            recent_data = [
                d
                for d in page_data
                if (datetime.now() - datetime.fromisoformat(d["timestamp"])).seconds
                < 60
            ]  # Últimos 60s

            if recent_data:
                avg_time = sum(d["tempo_permanencia"] for d in recent_data) / len(
                    recent_data
                )
                total_interactions = sum(d["interacoes"] for d in recent_data)

                stats["pages_stats"][page_name] = {
                    "entries_last_minute": len(recent_data),
                    "avg_permanencia_segundos": round(avg_time, 1),
                    "total_interacoes": total_interactions,
                }

    return stats


@app.route("/", methods=["GET"])
def index():
    return jsonify({"message": "API do Portfólio está funcionando!"})


# ==================== WEBSOCKET EVENTS ====================


@socketio.on("connect")
def handle_connect():
    """Evento quando um cliente se conecta via WebSocket"""
    print(f"🔌 Cliente conectado: {request.sid}")
    emit(
        "connection_response",
        {
            "status": "connected",
            "message": "Conectado ao servidor de analytics",
            "timestamp": datetime.now().isoformat(),
        },
    )


@socketio.on("disconnect")
def handle_disconnect():
    """Evento quando um cliente se desconecta"""
    session_id = request.sid
    print(f"🔌 Cliente desconectado: {session_id}")

    # Limpar sessão ativa do cache temporal
    if session_id in temporal_stats_cache["active_sessions"]:
        session_data = temporal_stats_cache["active_sessions"][session_id]
        print(f"🧹 Removendo sessão temporal: {session_id}")
        print(f"   ⏱️ Duração da sessão: {session_data.get('last_update', 'N/A')}")
        del temporal_stats_cache["active_sessions"][session_id]


@socketio.on("analytics_data")
def handle_analytics_data(data):
    """
    Evento WebSocket para receber dados de analytics/heatmap do frontend
    Suporte para coleta temporal em tempo real (5s) e envios regulares (15s)
    """
    try:
        cleanup_temporal_cache()  # Limpar cache periodicamente

        print(f"\n🔌 Dados recebidos via WebSocket de: {request.sid}")

        if not data:
            emit("analytics_error", {"error": "Nenhum dado foi enviado"})
            return

        # Detectar tipo de envio
        data_type = detect_data_type(data)
        is_temporal = data_type == "temporal"

        # Log dos dados recebidos com tipo
        print(
            f"🧩 Tipo de envio: {'⏱️ TEMPORAL (5s)' if is_temporal else '📦 REGULAR (15s)'}"
        )
        print(
            f"🧩 Estrutura recebida: {list(data.keys()) if isinstance(data, dict) else 'Formato inválido'}"
        )

        # Converter dados para o DTO
        heatmap_dados = HeatmapDados.from_dict(data)

        # Atualizar cache temporal
        if is_temporal:
            temporal_stats_cache["total_sessions"] += 1
            session_id = request.sid

            # Atualizar sessão ativa
            temporal_stats_cache["active_sessions"][session_id] = {
                "last_update": datetime.now().isoformat(),
                "data": heatmap_dados,
                "page_times": {},
            }

            # Adicionar aos dados temporais por página
            for page_name in ["home", "about", "projects"]:
                page_data = getattr(heatmap_dados, page_name, [])
                if page_data:
                    for session_data in page_data:
                        temporal_stats_cache["realtime_data"][page_name].append(
                            {
                                "timestamp": datetime.now().isoformat(),
                                "session_id": session_id,
                                "tempo_permanencia": session_data.segundos,
                                "visualizacoes": session_data.visualizacoes,
                                "interacoes": len(session_data.cliques)
                                + len(session_data.toques),
                            }
                        )

        # Logs diferenciados por tipo
        if is_temporal:
            print_temporal_logs(heatmap_dados, request.sid)
        else:
            print_regular_logs(heatmap_dados)

        # ==================== ENVIO PARA INFLUXDB ====================
        # Enviar dados para InfluxDB de forma assíncrona
        try:
            # Extrair informações do request
            user_agent = request.headers.get("User-Agent", "unknown")
            ip_address = request.environ.get("REMOTE_ADDR", "unknown")

            # Converter dados do heatmap para métricas temporais
            temporal_metrics = create_temporal_metric_from_heatmap(
                session_id=request.sid,
                heatmap_data=data,
                user_agent=user_agent,
                ip_address=ip_address,
            )

            # Enviar cada métrica para InfluxDB (assíncrono)
            for metric in temporal_metrics:
                influxdb_service.write_temporal_metrics_async(metric)

            print(
                f"📊 InfluxDB: {len(temporal_metrics)} métricas enviadas para série temporal"
            )

        except Exception as influx_error:
            print(f"⚠️ Erro ao enviar para InfluxDB: {str(influx_error)}")
            # Não falhar o processo principal por erro no InfluxDB

        # Emitir confirmação de recebimento com informações do tipo
        emit(
            "analytics_received",
            {
                "status": "success",
                "message": f"Dados de analytics recebidos via WebSocket ({'temporal' if is_temporal else 'regular'})",
                "id_registro": heatmap_dados.id_registro,
                "timestamp_recebimento": datetime.now().isoformat(),
                "tipo_envio": data_type,
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
                "stats_temporais": get_temporal_stats() if is_temporal else None,
            },
        )

    except ValueError as e:
        print(f"❌ Erro de validação de dados via WebSocket: {str(e)}")
        emit("analytics_error", {"error": f"Dados inválidos: {str(e)}"})

    except Exception as e:
        import traceback

        print(f"❌ Erro interno ao processar analytics via WebSocket: {str(e)}")
        print(f"Stack trace: {traceback.format_exc()}")
        emit("analytics_error", {"error": "Erro interno do servidor"})


# ==================== HTTP ENDPOINTS ====================


@app.route("/analytics/stats/temporal", methods=["GET"])
def get_temporal_statistics():
    """
    Endpoint para consultar estatísticas temporais em tempo real
    """
    try:
        cleanup_temporal_cache()

        stats = get_temporal_stats()

        # Adicionar informações extras
        stats["config"] = TEMPORAL_CONFIG
        stats["cache_info"] = {
            "total_realtime_entries": sum(
                len(temporal_stats_cache["realtime_data"][page])
                for page in temporal_stats_cache["realtime_data"]
            ),
            "last_cleanup": datetime.fromtimestamp(
                temporal_stats_cache["last_cleanup"]
            ).isoformat(),
        }

        return (
            jsonify(
                {
                    "status": "success",
                    "timestamp": datetime.now().isoformat(),
                    "stats": stats,
                }
            ),
            200,
        )

    except Exception as e:
        print(f"❌ Erro ao obter estatísticas temporais: {str(e)}")
        return jsonify({"error": "Erro interno do servidor"}), 500


@app.route("/analytics/stats/summary", methods=["GET"])
def get_analytics_summary():
    """
    Endpoint para resumo geral de analytics
    """
    try:
        # Obter parâmetros de query
        page = request.args.get("page", "all")
        time_range = request.args.get("time_range", "1h")  # 1h, 24h, 7d

        current_time = datetime.now()

        # Calcular filtro de tempo
        time_filters = {"1h": 3600, "24h": 86400, "7d": 604800}
        seconds_back = time_filters.get(time_range, 3600)

        summary = {
            "time_range": time_range,
            "timestamp": current_time.isoformat(),
            "temporal_data": {},
            "active_sessions": len(temporal_stats_cache["active_sessions"]),
        }

        # Filtrar dados por página e tempo
        for page_name in ["home", "about", "projects"]:
            if page == "all" or page == page_name:
                page_entries = temporal_stats_cache["realtime_data"][page_name]

                # Filtrar por tempo
                recent_entries = []
                for entry in page_entries:
                    entry_time = datetime.fromisoformat(entry["timestamp"])
                    if (current_time - entry_time).total_seconds() <= seconds_back:
                        recent_entries.append(entry)

                if recent_entries:
                    summary["temporal_data"][page_name] = {
                        "total_entries": len(recent_entries),
                        "avg_permanencia": round(
                            sum(e["tempo_permanencia"] for e in recent_entries)
                            / len(recent_entries),
                            1,
                        ),
                        "total_visualizacoes": sum(
                            e["visualizacoes"] for e in recent_entries
                        ),
                        "total_interacoes": sum(
                            e["interacoes"] for e in recent_entries
                        ),
                        "unique_sessions": len(
                            set(e["session_id"] for e in recent_entries)
                        ),
                    }

        return jsonify({"status": "success", "summary": summary}), 200

    except Exception as e:
        print(f"❌ Erro ao obter resumo de analytics: {str(e)}")
        return jsonify({"error": "Erro interno do servidor"}), 500


@app.route("/analytics", methods=["POST"])
def receive_analytics():
    """
    Endpoint para receber dados de analytics/heatmap do frontend
    Aceita dados no formato JSON correspondente à estrutura HeatmapDados
    """
    try:
        # Obter dados JSON do request
        data = request.get_json()

        if not data:
            return jsonify({"error": "Nenhum dado foi enviado"}), 400

        # Converter dados para o DTO
        heatmap_dados = HeatmapDados.from_dict(data)

        # Imprimir dados no console para debug
        print("\n" + "=" * 80)
        print(
            f"📊 DADOS DE ANALYTICS RECEBIDOS - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
        )
        print("=" * 80)

        print(f"🆔 ID do Registro: {heatmap_dados.id_registro}")
        print(f"⏰ Timestamp Inicial: {heatmap_dados.timestamp_inicial}")
        print(f"⏰ Timestamp Final: {heatmap_dados.timestamp_final}")

        # Calcular duração da sessão
        duracao_segundos = heatmap_dados.get_duracao_sessao_segundos()
        if duracao_segundos:
            print(f"⏱️  Duração da Sessão: {duracao_segundos:.2f} segundos")

        # Estatísticas gerais
        print(f"📈 Total de Visualizações: {heatmap_dados.get_total_visualizacoes()}")
        print(f"🖱️  Total de Cliques: {heatmap_dados.get_total_cliques()}")
        print(f"⏳ Tempo Total: {heatmap_dados.get_total_tempo_segundos()} segundos")

        # Dados por página
        print("\n📄 DADOS POR PÁGINA:")

        if heatmap_dados.home:
            print(f"  🏠 HOME: {len(heatmap_dados.home)} sessão(ões)")
            for i, sessao in enumerate(heatmap_dados.home):
                print(
                    f"    Sessão {i+1}: {sessao.visualizacoes} visualizações, {sessao.segundos}s, {len(sessao.cliques)} cliques"
                )

        if heatmap_dados.about:
            print(f"  👤 ABOUT: {len(heatmap_dados.about)} sessão(ões)")
            for i, sessao in enumerate(heatmap_dados.about):
                print(
                    f"    Sessão {i+1}: {sessao.visualizacoes} visualizações, {sessao.segundos}s, {len(sessao.cliques)} cliques"
                )

        if heatmap_dados.projects:
            print(f"  💼 PROJECTS: {len(heatmap_dados.projects)} sessão(ões)")
            for i, sessao in enumerate(heatmap_dados.projects):
                print(
                    f"    Sessão {i+1}: {sessao.visualizacoes} visualizações, {sessao.segundos}s, {len(sessao.cliques)} cliques"
                )

        # Dados detalhados (opcional - descomente se quiser ver todos os dados)
        # print("\n🔍 DADOS COMPLETOS:")
        # print(json.dumps(heatmap_dados.to_dict(), indent=2, ensure_ascii=False))

        print("=" * 80)
        print("✅ Dados processados com sucesso!")
        print("=" * 80 + "\n")

        # Resposta de sucesso
        return (
            jsonify(
                {
                    "status": "success",
                    "message": "Dados de analytics recebidos com sucesso",
                    "id_registro": heatmap_dados.id_registro,
                    "timestamp_recebimento": datetime.now().isoformat(),
                    "resumo": {
                        "total_visualizacoes": heatmap_dados.get_total_visualizacoes(),
                        "total_cliques": heatmap_dados.get_total_cliques(),
                        "tempo_total_segundos": heatmap_dados.get_total_tempo_segundos(),
                        "duracao_sessao_segundos": duracao_segundos,
                        "paginas_visitadas": {
                            "home": len(heatmap_dados.home),
                            "about": len(heatmap_dados.about),
                            "projects": len(heatmap_dados.projects),
                        },
                    },
                }
            ),
            200,
        )

    except ValueError as e:
        print(f"❌ Erro de validação de dados: {str(e)}")
        return jsonify({"error": f"Dados inválidos: {str(e)}"}), 400

    except Exception as e:
        print(f"❌ Erro interno ao processar analytics: {str(e)}")
        return jsonify({"error": "Erro interno do servidor"}), 500


# ==================== ENDPOINTS INFLUXDB TEMPORAL ====================


@app.route("/analytics/influxdb/realtime", methods=["GET"])
def get_influxdb_realtime_metrics():
    """
    Endpoint para consultar métricas em tempo real do InfluxDB
    """
    try:
        time_range = request.args.get("time_range", "-5m")  # Padrão: últimos 5 minutos

        metrics = influxdb_service.query_realtime_metrics(time_range)

        return jsonify(
            {
                "status": "success",
                "time_range": time_range,
                "timestamp": datetime.now().isoformat(),
                "metrics": metrics,
                "count": len(metrics),
                "influxdb_healthy": influxdb_service.is_healthy(),
            }
        )

    except Exception as e:
        print(f"❌ Erro ao consultar InfluxDB realtime: {str(e)}")
        return (
            jsonify(
                {
                    "status": "error",
                    "error": str(e),
                    "influxdb_healthy": influxdb_service.is_healthy(),
                }
            ),
            500,
        )


@app.route("/analytics/influxdb/summary", methods=["GET"])
def get_influxdb_page_summary():
    """
    Endpoint para resumo de analytics por página do InfluxDB
    """
    try:
        time_range = request.args.get("time_range", "-1h")  # Padrão: última hora

        summary = influxdb_service.get_page_analytics_summary(time_range)

        return jsonify(
            {
                "status": "success",
                "time_range": time_range,
                "timestamp": datetime.now().isoformat(),
                "page_analytics": summary,
                "influxdb_healthy": influxdb_service.is_healthy(),
            }
        )

    except Exception as e:
        print(f"❌ Erro ao consultar InfluxDB summary: {str(e)}")
        return (
            jsonify(
                {
                    "status": "error",
                    "error": str(e),
                    "influxdb_healthy": influxdb_service.is_healthy(),
                }
            ),
            500,
        )


@app.route("/analytics/influxdb/health", methods=["GET"])
def get_influxdb_health():
    """
    Endpoint para verificar saúde da conexão InfluxDB
    """
    try:
        is_healthy = influxdb_service.is_healthy()

        return jsonify(
            {
                "status": "success",
                "influxdb_enabled": influxdb_service.enabled,
                "influxdb_healthy": is_healthy,
                "influxdb_url": influxdb_service.url,
                "influxdb_bucket": influxdb_service.bucket,
                "timestamp": datetime.now().isoformat(),
            }
        )

    except Exception as e:
        print(f"❌ Erro ao verificar saúde InfluxDB: {str(e)}")
        return (
            jsonify(
                {
                    "status": "error",
                    "error": str(e),
                    "influxdb_enabled": False,
                    "influxdb_healthy": False,
                }
            ),
            500,
        )


@app.route("/analytics/influxdb/navigate", methods=["POST"])
def record_navigation_event():
    """
    Endpoint para registrar eventos de navegação entre páginas
    """
    try:
        data = request.json
        session_id = data.get("session_id")
        from_page = data.get("from_page")
        to_page = data.get("to_page")
        navigation_time = float(data.get("navigation_time", 0))

        if not all([session_id, from_page, to_page]):
            return (
                jsonify(
                    {
                        "status": "error",
                        "error": "session_id, from_page e to_page são obrigatórios",
                    }
                ),
                400,
            )

        # Extrair informações do request
        user_agent = request.headers.get("User-Agent", "unknown")
        ip_address = request.environ.get("REMOTE_ADDR", "unknown")

        # Registrar navegação no InfluxDB
        success = influxdb_service.write_navigation_event(
            session_id=session_id,
            from_page=from_page,
            to_page=to_page,
            navigation_time=navigation_time,
            user_agent=user_agent,
            ip_address=ip_address,
        )

        if success:
            return jsonify(
                {
                    "status": "success",
                    "message": "Evento de navegação registrado com sucesso",
                    "timestamp": datetime.now().isoformat(),
                }
            )
        else:
            return (
                jsonify(
                    {
                        "status": "warning",
                        "message": "InfluxDB não disponível, evento não registrado",
                    }
                ),
                202,
            )

    except Exception as e:
        print(f"❌ Erro ao registrar navegação: {str(e)}")
        return jsonify({"status": "error", "error": str(e)}), 500


if __name__ == "__main__":
    # Executar a aplicação com SocketIO
    socketio.run(app, host="0.0.0.0", port=5000, debug=True, allow_unsafe_werkzeug=True)
