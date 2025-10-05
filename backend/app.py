from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import os
from config import config
from dto.Dados import HeatmapDados
import json
from datetime import datetime

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
    print(f"🔌 Cliente desconectado: {request.sid}")


@socketio.on("analytics_data")
def handle_analytics_data(data):
    """
    Evento WebSocket para receber dados de analytics/heatmap do frontend
    Aceita dados no formato JSON correspondente à estrutura HeatmapDados
    """
    try:
        print(f"\n🔌 Dados recebidos via WebSocket de: {request.sid}")

        if not data:
            emit("analytics_error", {"error": "Nenhum dado foi enviado"})
            return

        # Log dos dados recebidos (apenas primeiro nível para debug)
        print(
            f"🧩 Estrutura recebida: {list(data.keys()) if isinstance(data, dict) else 'Formato inválido'}"
        )

        # Converter dados para o DTO
        heatmap_dados = HeatmapDados.from_dict(data)

        # Imprimir dados no console para debug
        print("\n" + "=" * 80)
        print(
            f"📊 DADOS DE ANALYTICS RECEBIDOS VIA WEBSOCKET - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
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

        # Emitir confirmação de recebimento
        emit(
            "analytics_received",
            {
                "status": "success",
                "message": "Dados de analytics recebidos com sucesso via WebSocket",
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


if __name__ == "__main__":
    # Executar a aplicação com SocketIO
    socketio.run(app, host="0.0.0.0", port=5000, debug=True, allow_unsafe_werkzeug=True)
