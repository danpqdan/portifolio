import { HeatmapUtils } from '../utils/HeatmapUtils';

export default class ClasseProjects {
    constructor(root) {
        this.root = root;
        this.running = false;
        
        // Usando os IDs padronizados para seletores específicos
        const seletoresInteresse = [
            '#projects_title',
            '#projects_description',
            '#projects_list',
            '.project-item',  // Mantém classe para compatibilidade
            '#projects_item_1',
            '#projects_item_2',
            '#projects_btn_view',
            '#projects_btn_github'
        ].join(', ');
        
        // Especificar o tipo de página como 'projects'
        this.heatmap = new HeatmapUtils(root, seletoresInteresse, 'projects');
        console.info('[ClasseProjects] construído', { temRoot: !!root });
        
        // Mapeia elementos de interesse específicos
        this.elementos = {
            projetos: Array.from(root?.querySelectorAll('.project-item') || []),
            botoes: {
                verTodos: root?.querySelector('#projects_btn_view'),
                github: root?.querySelector('#projects_btn_github')
            }
        };
    }

    start() {
        if (this.running) return;
        this.running = true;
        console.info('[ClasseProjects] started');
        
        // Iniciar o HeatmapUtils
        this.heatmap.iniciar();
    }

    stop() {
        if (!this.running) return;
        this.running = false;
        console.info('[ClasseProjects] stopped');
        
        // Parar o HeatmapUtils e registrar dados
        this.heatmap.parar();
        console.info('[ClasseProjects] heatmap dados', HeatmapUtils.getDadosGlobais());
    }
}