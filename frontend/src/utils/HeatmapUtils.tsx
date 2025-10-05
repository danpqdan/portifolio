import { v4 as uuidv4 } from 'uuid';

// Interfaces para estruturas de dados
export interface Clique {
    x: number;
    y: number;
    timestamp: number;  // em ms
    elemento?: string;  // id, class ou tag
}

export interface Toque {
    x: number;
    y: number;
    timestamp: number; // em milissegundos
    elemento?: string; // id, class ou tag
}

export interface ScrollData {
    timestamp: number; // em milissegundos
    scrollTop: number;
    scrollPercent: number;
}

export interface HoverData {
    [elementId: string]: number; // tempo em segundos
}

export interface ElementoExposicao {
    [elementId: string]: number; // tempo visível em segundos
}

// Estrutura de dados para cada página específica
export interface PaginaDados {
    cliques: Clique[];
    toques: Toque[];
    scrolls: ScrollData[];
    mouseMoves: Clique[];
    hover: HoverData;
    elementosExposicao: ElementoExposicao;
    visualizacoes: number;
    segundos: number;
    timestamp_inicial: number | null;
    timestamp_final: number | null;
}

// Nova estrutura que organiza dados por página
export interface HeatmapDados {
    id_registro: string;
    timestamp_inicial: number | null; // timestamp da primeira página vista
    timestamp_final: number | null;   // timestamp de quando o rastreamento parou
    home: PaginaDados[];
    about: PaginaDados[];
    projects: PaginaDados[];

    // Métodos auxiliares
    get_total_visualizacoes?: () => number;
    get_total_cliques?: () => number;
    get_total_tempo_segundos?: () => number;
    get_duracao_sessao_segundos?: () => number | null;
}

// Implementação do método from_dict para converter objetos JSON para HeatmapDados
export namespace HeatmapDados {
    export function from_dict(data: any): HeatmapDados {
        const result: HeatmapDados = {
            id_registro: data.id_registro || uuidv4(),
            timestamp_inicial: data.timestamp_inicial || null,
            timestamp_final: data.timestamp_final || null,
            home: data.home || [],
            about: data.about || [],
            projects: data.projects || [],
        };

        // Adicionar métodos auxiliares
        result.get_total_visualizacoes = function () {
            let total = 0;
            for (const pagina of ['home', 'about', 'projects']) {
                if (result[pagina as keyof typeof result] instanceof Array) {
                    for (const sessao of (result[pagina as keyof typeof result] as PaginaDados[])) {
                        total += sessao.visualizacoes;
                    }
                }
            }
            return total;
        };

        result.get_total_cliques = function () {
            let total = 0;
            for (const pagina of ['home', 'about', 'projects']) {
                if (result[pagina as keyof typeof result] instanceof Array) {
                    for (const sessao of (result[pagina as keyof typeof result] as PaginaDados[])) {
                        total += sessao.cliques.length;
                    }
                }
            }
            return total;
        };

        result.get_total_tempo_segundos = function () {
            let total = 0;
            for (const pagina of ['home', 'about', 'projects']) {
                if (result[pagina as keyof typeof result] instanceof Array) {
                    for (const sessao of (result[pagina as keyof typeof result] as PaginaDados[])) {
                        total += sessao.segundos;
                    }
                }
            }
            return total;
        };

        result.get_duracao_sessao_segundos = function () {
            if (!result.timestamp_inicial || !result.timestamp_final) return null;
            return (result.timestamp_final - result.timestamp_inicial) / 1000;
        };

        return result;
    }
}

// Singleton para armazenar estado global entre instâncias
class HeatmapRegistryGlobal {
    private static instance: HeatmapRegistryGlobal;
    private _id_registro: string;
    private _timestamp_inicial: number | null = null;
    private _timestamp_final: number | null = null;
    private _paginas: { [key: string]: PaginaDados[] } = {
        home: [],
        about: [],
        projects: []
    };

    private constructor() {
        this._id_registro = uuidv4();
    }

    public static getInstance(): HeatmapRegistryGlobal {
        if (!HeatmapRegistryGlobal.instance) {
            HeatmapRegistryGlobal.instance = new HeatmapRegistryGlobal();
        }
        return HeatmapRegistryGlobal.instance;
    }

    public getIdRegistro(): string {
        return this._id_registro;
    }

    public getTimestampInicial(): number | null {
        return this._timestamp_inicial;
    }

    public setTimestampInicial(timestamp: number): void {
        if (this._timestamp_inicial === null) {
            this._timestamp_inicial = timestamp;
        }
    }

    public setTimestampFinal(timestamp: number): void {
        this._timestamp_final = timestamp;
    }

    public getTimestampFinal(): number | null {
        return this._timestamp_final;
    }

    public addPaginaDados(tipo: 'home' | 'about' | 'projects', dados: PaginaDados): void {
        if (!this._paginas[tipo]) {
            this._paginas[tipo] = [];
        }
        this._paginas[tipo].push(dados);
    }

    public getPaginasDados(): { [key: string]: PaginaDados[] } {
        return this._paginas;
    }

    public resetarRegistro(): void {
        this._id_registro = uuidv4();
        this._timestamp_inicial = null;
        this._timestamp_final = null;
        this._paginas = {
            home: [],
            about: [],
            projects: []
        };
    }

    public getDados(): HeatmapDados {
        const dados: HeatmapDados = {
            id_registro: this._id_registro,
            timestamp_inicial: this._timestamp_inicial,
            timestamp_final: this._timestamp_final,
            home: this._paginas.home,
            about: this._paginas.about,
            projects: this._paginas.projects
        };

        // Adicionar métodos auxiliares
        return HeatmapDados.from_dict(dados);
    }
}

export class HeatmapUtils {
    root: HTMLElement;
    private _paginaTipo: 'home' | 'about' | 'projects';
    private _visualizacoes: number;
    private _segundos: number;
    private _timestamp_inicial: number | null;
    private _timestamp_final: number | null;
    private _intervalo: ReturnType<typeof setInterval> | null;
    private _executando: boolean = false;

    private _cliques: Clique[];
    private _toques: Toque[];
    private _scrolls: ScrollData[];
    private _mouseMoves: Clique[];
    private _hovers: { [key: string]: number };
    private _hoverTimers: { [key: string]: { inicio: number; acumulado: number } };
    private _elementosVisiveis: { [key: string]: { tempo: number; visivel: boolean; inicio: number } };
    private _observer: IntersectionObserver | null;
    private hoverSelector: string | null;

    private _registry: HeatmapRegistryGlobal;

    constructor(root: HTMLElement = document.body, hoverSelector: string | null = null, paginaTipo: 'home' | 'about' | 'projects' = 'home') {
        this.root = root;
        this._paginaTipo = paginaTipo;
        this._registry = HeatmapRegistryGlobal.getInstance();
        this._visualizacoes = 0;
        this._segundos = 0;
        this._timestamp_inicial = null;
        this._timestamp_final = null;
        this._intervalo = null;

        this._cliques = [];
        this._toques = [];
        this._scrolls = [];
        this._mouseMoves = [];
        this._hovers = {};
        this._hoverTimers = {};
        this._elementosVisiveis = {};
        this._observer = null;
        this.hoverSelector = hoverSelector;

        this._onClick = this._onClick.bind(this);
        this._onScroll = this._onScroll.bind(this);
        this._onMouseMove = this._onMouseMove.bind(this);
        this._onTouchMove = this._onTouchMove.bind(this);
        this._onIntersection = this._onIntersection.bind(this);

        console.log(`[HeatmapUtils] Construído para página ${paginaTipo}`, { id_registro: this._registry.getIdRegistro() });
    }

    iniciar() {
        if (this._executando) return;
        this._executando = true;

        this._visualizacoes += 1;
        this._timestamp_inicial = Date.now();

        // Registrar o timestamp inicial global se for o primeiro
        this._registry.setTimestampInicial(this._timestamp_inicial);

        if (this._intervalo) clearInterval(this._intervalo);
        this._intervalo = setInterval(() => { this._segundos += 1; }, 1000);

        this.root.addEventListener('click', this._onClick);
        this.root.addEventListener('scroll', this._onScroll, { passive: true });
        this.root.addEventListener('mousemove', this._onMouseMove);
        this.root.addEventListener('touchmove', this._onTouchMove, { passive: true });

        if (this.hoverSelector) {
            const elems = Array.from(this.root.querySelectorAll<HTMLElement>(this.hoverSelector));
            elems.forEach(el => {
                el.addEventListener('mouseenter', () => this._startHover(el));
                el.addEventListener('mouseleave', () => this._stopHover(el));
            });
        }

        // Inicializar o observer com novas opções
        this._observer = new IntersectionObserver(this._onIntersection, {
            threshold: [0, 0.25, 0.5, 0.75, 1],
            // Adicionar root como viewport de referência
            root: null, // viewport do browser
            rootMargin: '0px' // sem margem adicional
        });

        // Observar elementos importantes (filtrados para reduzir ruído)
        const elementos = Array.from(this.root.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, p, button, a, img, .card-carousel, .skill-badge, .tech-btn, [id^="home_"], [id^="about_"], [id^="projects_"]'));
        elementos.forEach(el => {
            this._observer?.observe(el);

            const rect = el.getBoundingClientRect();
            const isInViewport = (
                rect.top >= 0 &&
                rect.left >= 0 &&
                rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                rect.right <= (window.innerWidth || document.documentElement.clientWidth)
            );

            const id = el.id || el.className || el.tagName;
            if (!this._elementosVisiveis[id]) {
                this._elementosVisiveis[id] = { tempo: 0, visivel: false, inicio: 0 };
            }

            if (isInViewport) {
                this._elementosVisiveis[id].visivel = true;
                this._elementosVisiveis[id].inicio = Date.now();
            }
        });
    }

    parar() {
        if (!this._executando) return;
        this._executando = false;

        const now = Date.now();
        this._timestamp_final = now;

        // Atualizar o timestamp final global
        this._registry.setTimestampFinal(now);

        // Finalizar o tempo para todos os elementos que ainda estão visíveis
        Object.keys(this._elementosVisiveis).forEach(id => {
            const elData = this._elementosVisiveis[id];
            if (elData.visivel) {
                elData.tempo += now - elData.inicio;
                elData.visivel = false;
            }
        });

        if (this._intervalo) {
            clearInterval(this._intervalo);
            this._intervalo = null;
        }

        this.root.removeEventListener('click', this._onClick);
        this.root.removeEventListener('scroll', this._onScroll);
        this.root.removeEventListener('mousemove', this._onMouseMove);
        this.root.removeEventListener('touchmove', this._onTouchMove);

        if (this.hoverSelector) {
            const elems = Array.from(this.root.querySelectorAll<HTMLElement>(this.hoverSelector));
            elems.forEach(el => {
                el.removeEventListener('mouseenter', () => this._startHover(el));
                el.removeEventListener('mouseleave', () => this._stopHover(el));
            });
        }

        if (this._observer) this._observer.disconnect();

        // Armazenar os dados desta sessão no registro global
        this._registry.addPaginaDados(this._paginaTipo, this.getPaginaDados());
    }

    private _onClick(e: MouseEvent) {
        const el = e.target as HTMLElement;
        const elementoId = el.id || el.className || el.tagName;

        this._cliques.push({
            x: e.pageX,
            y: e.pageY,
            timestamp: Date.now(),
            elemento: elementoId
        });
    }

    private _onTouchMove(e: TouchEvent) {
        const touch = e.touches[0];
        if (!touch) return;

        const el: HTMLElement | null = document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement;
        const elementoId: string = el?.id || el?.className || el?.tagName || 'desconhecido';

        this._toques.push({
            x: touch.pageX,
            y: touch.pageY,
            timestamp: Date.now(),
            elemento: elementoId
        });
    }

    private _onScroll() {
        const scrollMax = this.root.scrollHeight - this.root.clientHeight;
        const perc = scrollMax > 0 ? Math.round((this.root.scrollTop / scrollMax) * 100) : 0;
        this._scrolls.push({ timestamp: Date.now(), scrollTop: this.root.scrollTop, scrollPercent: perc });
    }

    private _onMouseMove(e: MouseEvent) {
        this._mouseMoves.push({ x: e.pageX, y: e.pageY, timestamp: Date.now() });
    }

    private _startHover(el: HTMLElement) {
        const id = el.id || el.className || el.tagName;
        if (!this._hoverTimers[id]) this._hoverTimers[id] = { inicio: Date.now(), acumulado: 0 };
    }

    private _stopHover(el: HTMLElement) {
        const id = el.id || el.className || el.tagName;
        const timer = this._hoverTimers[id];
        if (!timer) return;
        timer.acumulado += (Date.now() - timer.inicio);
        this._hovers[id] = (this._hovers[id] || 0) + timer.acumulado;
        delete this._hoverTimers[id];
    }

    private _onIntersection(entries: IntersectionObserverEntry[]) {
        const now = Date.now();
        entries.forEach(entry => {
            const el = entry.target as HTMLElement;
            const id = el.id || el.className || el.tagName;

            if (!this._elementosVisiveis[id]) {
                this._elementosVisiveis[id] = { tempo: 0, visivel: false, inicio: 0 };
            }

            const elData = this._elementosVisiveis[id];

            // Verifica se mudou de estado (entrou ou saiu da viewport)
            if (entry.isIntersecting && !elData.visivel) {
                // Elemento entrou na viewport
                elData.visivel = true;
                elData.inicio = now;
            } else if (!entry.isIntersecting && elData.visivel) {
                // Elemento saiu da viewport
                elData.tempo += now - elData.inicio;
                elData.visivel = false;
            }
        });
    }

    // Retorna apenas os dados desta sessão da página
    private getPaginaDados(): PaginaDados {
        const now = Date.now();
        const elementosExposicao: ElementoExposicao = {};

        // Atualizar o tempo para elementos ainda visíveis
        Object.keys(this._elementosVisiveis).forEach(key => {
            const elData = this._elementosVisiveis[key];
            let tempoTotal = elData.tempo;

            // Se ainda estiver visível, adicionar o tempo desde o início até agora
            if (elData.visivel) {
                tempoTotal += (now - elData.inicio);
            }

            // Converter para segundos
            elementosExposicao[key] = Math.round(tempoTotal / 1000);
        });

        const hoverSegundos: HoverData = {};
        Object.keys(this._hovers).forEach(key => {
            hoverSegundos[key] = Math.round(this._hovers[key] / 1000);
        });

        return {
            visualizacoes: this._visualizacoes,
            segundos: this._segundos,
            timestamp_inicial: this._timestamp_inicial,
            timestamp_final: this._timestamp_final,
            cliques: this._cliques,
            toques: this._toques,
            scrolls: this._scrolls,
            mouseMoves: this._mouseMoves,
            hover: hoverSegundos,
            elementosExposicao,
        };
    }

    // Retorna os dados globais de todas as páginas
    getDados(): HeatmapDados {
        // Atualizar timestamp final
        const now = Date.now();
        this._timestamp_final = now;
        this._registry.setTimestampFinal(now);

        // Atualizar dados da página atual no registro
        this._registry.addPaginaDados(this._paginaTipo, this.getPaginaDados());

        // Retornar todos os dados coletados
        return this._registry.getDados();
    }

    // Métodos adicionais para compatibilidade
    get running(): boolean {
        return this._executando;
    }

    get executando(): boolean {
        return this._executando;
    }

    // Aliases para compatibilidade com inglês/português
    start() {
        return this.iniciar();
    }

    stop() {
        return this.parar();
    }

    // Método para exportar todos os dados coletados em todas as páginas
    static getDadosGlobais(): HeatmapDados {
        return HeatmapRegistryGlobal.getInstance().getDados();
    }

    // Método para resetar o rastreamento global
    static resetarRegistro(): void {
        HeatmapRegistryGlobal.getInstance().resetarRegistro();
    }
}