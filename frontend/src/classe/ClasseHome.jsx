import { HeatmapUtils } from '../utils/HeatmapUtils';
import WebSocketService from '../utils/WebSocketService.tsx';
import { DEBUG_ENABLED } from '../config.js';

export default class ClasseHome {
    constructor(root) {
        this.root = root;
        this.executando = false;

        // Definindo seletores específicos usando os IDs padronizados
        const seletoresInteresse = [
            '#home_header',
            '#home_content',
            '#home_footer',
            '#home_title',
            '.tech-btn',  // Mantém classes quando fizer sentido
            '#home_btn_grafana',
            '#home_btn_react',
            '#home_btn_redux',
            '#home_btn_reacticons',
            '#home_btn_vite'
        ].join(', ');

        // Especificar o tipo de página como 'home'
        this.heatmap = new HeatmapUtils(root, seletoresInteresse, 'home');

        // Mapeia elementos específicos para uso direto
        this.elementos = {
            header: root?.querySelector('#home_header'),
            content: root?.querySelector('#home_content'),
            footer: root?.querySelector('#home_footer'),
            techButtons: Array.from(root?.querySelectorAll('.tech-btn') || [])
        };

        // Configurar envio periódico dos dados (a cada 30 segundos em DEV)
        this.intervaloEnvio = null;
    }

    iniciar() {
        if (this.executando) return;
        this.executando = true;

        // Iniciar o HeatmapUtils para rastrear interações
        this.heatmap.iniciar();

        // Conectar ao WebSocket se necessário
        WebSocketService.connect();

        // Configurar envio periódico dos dados
        this.intervaloEnvio = setInterval(() => {
            if (this.executando) {
                this.enviarDados();
            }
        }, 30000); // 30 segundos
    }

    parar() {
        if (!this.executando) return;
        this.executando = false;
        // Limpar intervalo de envio
        if (this.intervaloEnvio) {
            clearInterval(this.intervaloEnvio);
            this.intervaloEnvio = null;
        }

        // Parar o HeatmapUtils
        this.heatmap.parar();

        // Enviar dados uma última vez antes de parar
        this.enviarDados();
    }

    enviarDados() {
        if (!this.heatmap) return false;

        const dados = this.heatmap.getDados();

        // Enviar dados via WebSocket
        WebSocketService.sendAnalyticsData(dados);
        return true;
    }

    // Este método precisa ser corrigido - a função estava com escopo incorreto
    getWebSocketStatus() {
        // Chama diretamente o WebSocketService para obter o status
        return WebSocketService.getConnectionStatus();
    }

    // Método para uso em componentes React
    criarControles() {
        return {
            enviarDados: this.enviarDados.bind(this),
            iniciar: this.iniciar.bind(this),
            parar: this.parar.bind(this),
            getWebSocketStatus: this.getWebSocketStatus.bind(this)
        };
    }
}