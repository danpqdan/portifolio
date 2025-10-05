import { HeatmapUtils } from '../utils/HeatmapUtils';
import WebSocketService from '../utils/WebSocketService.tsx';
import { DEBUG_ENABLED } from '../config.js';

export default class ClasseAbout {
    constructor(root) {
        this.root = root;
        this.executando = false;

        // Definindo seletores específicos para About
        const seletoresInteresse = [
            '#about_header',
            '#about_content',
            '#about_footer',
            '.skill-badge',
            '#about_contact_list a'
        ].join(', ');

        this.heatmap = new HeatmapUtils(root, seletoresInteresse, 'about');

        this.intervaloEnvio = null;
    }

    // Renomeando para padronizar com a chamada feita no SlidesCarousel.jsx
    start() {
        return this.iniciar();
    }

    stop() {
        return this.parar();
    }

    iniciar() {
        if (this.executando) return;
        this.executando = true;

        this.heatmap.iniciar();
        WebSocketService.connect();

        this.intervaloEnvio = setInterval(() => {
            if (this.executando) {
                this.enviarDados();
            }
        }, 30000);
    }

    parar() {
        if (!this.executando) return;
        this.executando = false;
        if (this.intervaloEnvio) {
            clearInterval(this.intervaloEnvio);
            this.intervaloEnvio = null;
        }

        this.heatmap.parar();
        this.enviarDados();
    }

    enviarDados() {
        if (!this.heatmap) return false;

        const dados = this.heatmap.getDados();

        WebSocketService.sendAnalyticsData(dados);
        return true;
    }

    getWebSocketStatus() {
        return WebSocketService.getConnectionStatus();
    }

    criarControles() {
        return {
            enviarDados: this.enviarDados.bind(this),
            iniciar: this.iniciar.bind(this),
            parar: this.parar.bind(this),
            getWebSocketStatus: this.getWebSocketStatus.bind(this),
            // Adicionar aliases para compatibilidade
            start: this.iniciar.bind(this),
            stop: this.parar.bind(this)
        };
    }

    // Propriedade para compatibilidade
    get running() {
        return this.executando;
    }
}