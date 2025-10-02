import { HeatmapUtils } from '../utils/HeatmapUtils';


export default class ClasseHome {
    constructor(root) {
        this.root = root;
        this.executando = false;
        this.heatmap = new HeatmapUtils(root, '.tech-btn, .card-header, .card-content');
        console.info('[ClasseHome] construído', { temRoot: !!root });
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
        console.info('[ClasseHome] heatmap dados', this.heatmap.getDados());
    }
}
