import { HeatmapUtils } from '../utils/HeatmapUtils.js';

export default class ClasseAbout {
    constructor(root) {
        this.root = root;
        this.executando = false;
        
        // Usando os IDs padronizados para seletores específicos
        const seletoresInteresse = [
            '#about_title', 
            '#about_paragraph1', 
            '#about_paragraph2', 
            '#about_paragraph3',
            '#about_skill_badges',
            '.skill-badge',  // Mantém classe para compatibilidade
            '#about_avatar',
            '#about_contact_list a',  // Seletor combinado
            '#about_btn_stats',
            '#about_btn_restart'
        ].join(', ');
        
        // Especificar o tipo de página como 'about'
        this.heatmap = new HeatmapUtils(root, seletoresInteresse, 'about');
        console.info('[ClasseAbout] construído', { temRoot: !!root });
        
        // Mapeia elementos de interesse específicos
        this.elementos = {
            avatar: root?.querySelector('#about_avatar'),
            skills: Array.from(root?.querySelectorAll('.skill-badge') || []),
            paragrafos: Array.from(root?.querySelectorAll('.about-paragraph') || []),
            botoes: {
                stats: root?.querySelector('#about_btn_stats'),
                restart: root?.querySelector('#about_btn_restart')
            }
        };
    }

    start() {
        if (this.executando) return;
        this.executando = true;
        console.info('[ClasseAbout] iniciado');
        this.heatmap.iniciar();
    }

    stop() {
        if (!this.executando) return;
        this.executando = false;
        console.info('[ClasseAbout] parado');
        this.heatmap.parar();
        console.info('[ClasseAbout] heatmap dados', HeatmapUtils.getDadosGlobais());
    }
}