import { HeatmapUtils } from '../utils/HeatmapUtils';

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
        console.info('[ClasseHome] construído', { temRoot: !!root });

        // Mapeia elementos específicos para uso direto
        this.elementos = {
            header: root?.querySelector('#home_header'),
            content: root?.querySelector('#home_content'),
            footer: root?.querySelector('#home_footer'),
            techButtons: Array.from(root?.querySelectorAll('.tech-btn') || [])
        };
    }

    iniciar() {
        if (this.executando) return;
        this.executando = true;
        console.info('[ClasseHome] iniciado');

        // Iniciar o HeatmapUtils para rastrear interações
        this.heatmap.iniciar();
    }

    parar() {
        if (!this.executando) return;
        this.executando = false;
        console.info('[ClasseHome] parado');

        // Parar o HeatmapUtils e registrar os dados coletados
        this.heatmap.parar();
        console.info('[ClasseHome] heatmap dados', HeatmapUtils.getDadosGlobais());
    }
}