import { v4 as uuidv4 } from 'uuid';

export interface Clique {
    x: number;
    y: number;
    timestamp: number;  // em ms
    elemento?: string;   // id, class ou tag
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

export interface HeatmapDados {
    id_registro: string;
    visualizacoes: number;
    segundos: number;
    timestamp_inicial: number | null; // ms
    cliques: Clique[];
    toques: Toque[];
    scrolls: ScrollData[];
    mouseMoves: Clique[];
    hover: HoverData;
    elementosExposicao: ElementoExposicao;
}

export class HeatmapUtils {
    root: HTMLElement;
    private _id_registro: string;
    private _visualizacoes: number;
    private _segundos: number;
    private _timestamp_inicial: number | null;
    private _intervalo: ReturnType<typeof setInterval> | null;

    private _cliques: Clique[];
    private _toques: Toque[];
    private _scrolls: ScrollData[];
    private _mouseMoves: Clique[];
    private _hovers: { [key: string]: number };
    private _hoverTimers: { [key: string]: { inicio: number; acumulado: number } };
    private _elementosVisiveis: { [key: string]: { tempo: number; visivel: boolean; inicio: number } };
    private _observer: IntersectionObserver | null;
    private hoverSelector: string | null;

    constructor(root: HTMLElement = document.body, hoverSelector: string | null = null) {
        this.root = root;
        this._id_registro = uuidv4();
        this._visualizacoes = 0;
        this._segundos = 0;
        this._timestamp_inicial = null;
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
    }

    iniciar() {
        this._visualizacoes += 1;
        this._timestamp_inicial = Date.now();

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

        this._observer = new IntersectionObserver(this._onIntersection, { threshold: [0, 0.25, 0.5, 0.75, 1] });
        const elementos = Array.from(this.root.querySelectorAll<HTMLElement>('*'));
        elementos.forEach(el => this._observer?.observe(el));
    }

    parar() {
        if (this._intervalo) { clearInterval(this._intervalo); this._intervalo = null; }

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
            const id = entry.target.id || entry.target.className || entry.target.tagName;
            if (!this._elementosVisiveis[id]) this._elementosVisiveis[id] = { tempo: 0, visivel: false, inicio: 0 };

            const elData = this._elementosVisiveis[id];
            if (entry.isIntersecting) {
                elData.visivel = true;
                elData.inicio = now;
            } else if (elData.visivel) {
                elData.tempo += now - elData.inicio;
                elData.visivel = false;
            }
        });
    }

    getDados(): HeatmapDados {
        const elementosExposicao: ElementoExposicao = {};
        Object.keys(this._elementosVisiveis).forEach(key => {
            elementosExposicao[key] = Math.round(this._elementosVisiveis[key].tempo / 1000);
        });

        const hoverSegundos: HoverData = {};
        Object.keys(this._hovers).forEach(key => { hoverSegundos[key] = Math.round(this._hovers[key] / 1000); });

        return {
            id_registro: this._id_registro,
            visualizacoes: this._visualizacoes,
            segundos: this._segundos,
            timestamp_inicial: this._timestamp_inicial,
            cliques: this._cliques,
            toques: this._toques,
            scrolls: this._scrolls,
            mouseMoves: this._mouseMoves,
            hover: hoverSegundos,
            elementosExposicao,
        };
    }
}
