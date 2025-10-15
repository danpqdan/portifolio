import { HeatmapUtils } from '../utils/HeatmapUtils';
import WebSocketService from '../utils/WebSocketService.tsx';
import { DEBUG_ENABLED } from '../config.js';

// Usar o mesmo controle global das outras classes
export default class ClasseAbout {
    constructor(root) {
        this.root = root;
        this.executando = false;
        this.pageType = 'about';
        this.isPageVisible = true; // Controle de visibilidade

        // Definindo seletores específicos para About
        const seletoresInteresse = [
            '#about_header',
            '#about_content',
            '#about_footer',
            '.skill-badge',
            '#about_contact_list a'
        ].join(', ');

        this.heatmap = new HeatmapUtils(root, seletoresInteresse, 'about');

        // Controle para coleta temporal
        this.colecaoTemporalAtiva = false;

        // Listener para verificar visibilidade da página
        this.visibilityChangeHandler = () => {
            this.isPageVisible = !document.hidden;
        };
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
        
        // Verificar se há outra página ativa e pará-la
        if (window.__ACTIVE_PAGE_CONTROLLER__ && window.__ACTIVE_PAGE_CONTROLLER__ !== this) {
            try {
                window.__ACTIVE_PAGE_CONTROLLER__.parar();
            } catch (error) {
                // 
            }
        }
        
        // Definir como página ativa
        window.__ACTIVE_PAGE_CONTROLLER__ = this;
        window.__ACTIVE_PAGE_TYPE__ = this.pageType;
        
        this.executando = true;
        
        // Adicionar listener de visibilidade
        document.addEventListener('visibilitychange', this.visibilityChangeHandler);

        // Configurar coleta temporal em tempo real (5 segundos)
        this.heatmap.configurarColecaoTempoReal(
            (dados) => {
                // Só enviar se página estiver visível e for a página ativa
                if (this.isPageVisible && window.__ACTIVE_PAGE_CONTROLLER__ === this) {
                    WebSocketService.sendAnalyticsDataImmediate(dados, false);   
                }
            },5000 
        );

        // Iniciar coleta temporal
        this.heatmap.iniciarColecaoTempoReal();
        this.colecaoTemporalAtiva = true;

        this.heatmap.iniciar();
        WebSocketService.connect();
        
    }

    parar() {
        if (!this.executando) return;
        this.executando = false;
        
        // Limpar controle global se for a página ativa
        if (window.__ACTIVE_PAGE_CONTROLLER__ === this) {
            window.__ACTIVE_PAGE_CONTROLLER__ = null;
            window.__ACTIVE_PAGE_TYPE__ = null;
        }
        
        // Remover listener de visibilidade
        document.removeEventListener('visibilitychange', this.visibilityChangeHandler);

        // Parar coleta temporal
        this.colecaoTemporalAtiva = false;

        this.heatmap.parar();
        
        // Enviar dados finais com prioridade
        const dados = this.heatmap.getDados();
        WebSocketService.sendAnalyticsDataImmediate(dados, true);

    }

    enviarDados() {
        if (!this.heatmap) return false;

        const dados = this.heatmap.getDados();

        WebSocketService.sendAnalyticsData(dados);
        return true;
    }

    // Novo método para obter tempo de permanência
    getTempoPermancia() {
        if (this.heatmap) {
            return this.heatmap.getTempoPermanciaSegundos();
        }
        return 0;
    }

    // Novo método para configurar intervalo de coleta temporal
    setIntervaloColecaoTemporal(intervalMs) {
        if (this.heatmap && this.colecaoTemporalAtiva) {
            // Reconfigurar coleta temporal
            this.heatmap.configurarColecaoTempoReal(
                (dados) => {
                    WebSocketService.sendAnalyticsDataImmediate(dados, false);
                },
                intervalMs
            );
            
            // Reiniciar coleta temporal com novo intervalo
            this.heatmap.iniciarColecaoTempoReal();
        }
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
            getTempoPermancia: this.getTempoPermancia.bind(this),
            setIntervaloColecaoTemporal: this.setIntervaloColecaoTemporal.bind(this),
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