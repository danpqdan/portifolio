import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HeatmapDados, HeatmapUtils } from '../utils/HeatmapUtils.tsx';

const criarPaginaDados = (sobrescritas = {}) => ({
  cliques: [],
  toques: [],
  scrolls: [],
  mouseMoves: [],
  hover: {},
  elementosExposicao: {},
  visualizacoes: 0,
  segundos: 0,
  timestamp_inicial: null,
  timestamp_final: null,
  ...sobrescritas,
});

describe('HeatmapDados.from_dict', () => {
  it('calcula totais de visualizacoes, cliques e tempo por pagina', () => {
    const dados = HeatmapDados.from_dict({
      id_registro: 'registro-local',
      timestamp_inicial: 1000,
      timestamp_final: 7000,
      home: [criarPaginaDados({ visualizacoes: 2, segundos: 10, cliques: [{ x: 1, y: 2, timestamp: 1000 }] })],
      about: [criarPaginaDados({ visualizacoes: 1, segundos: 5, cliques: [{ x: 3, y: 4, timestamp: 2000 }] })],
      projects: [criarPaginaDados({ visualizacoes: 3, segundos: 8 })],
    });

    expect(dados.get_total_visualizacoes?.()).toBe(6);
    expect(dados.get_total_cliques?.()).toBe(2);
    expect(dados.get_total_tempo_segundos?.()).toBe(23);
    expect(dados.get_duracao_sessao_segundos?.()).toBe(6);
  });

  it('gera valores padrao seguros quando campos opcionais nao sao enviados', () => {
    const dados = HeatmapDados.from_dict({});

    expect(dados.id_registro).toEqual(expect.any(String));
    expect(dados.home).toEqual([]);
    expect(dados.about).toEqual([]);
    expect(dados.projects).toEqual([]);
    expect(dados.get_duracao_sessao_segundos?.()).toBeNull();
  });
});

describe('HeatmapUtils', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    HeatmapUtils.resetarRegistro();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    HeatmapUtils.resetarRegistro();
  });

  it('coleta visualizacao, clique, scroll e movimento de mouse da pagina ativa', () => {
    const raiz = document.createElement('div');
    const botao = document.createElement('button');
    botao.id = 'botao-teste';
    raiz.appendChild(botao);
    document.body.appendChild(raiz);

    Object.defineProperty(raiz, 'scrollHeight', { configurable: true, value: 1000 });
    Object.defineProperty(raiz, 'clientHeight', { configurable: true, value: 500 });
    Object.defineProperty(raiz, 'scrollTop', { configurable: true, value: 250, writable: true });

    const heatmap = new HeatmapUtils(raiz, null, 'home');
    heatmap.iniciar();

    botao.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 20 }));
    raiz.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 30, clientY: 40 }));
    raiz.dispatchEvent(new Event('scroll', { bubbles: true }));

    const dados = heatmap.getDados();
    const pagina = dados.home[0];

    expect(pagina.visualizacoes).toBe(1);
    expect(pagina.cliques).toHaveLength(1);
    expect(pagina.cliques[0].elemento).toBe('botao-teste');
    expect(pagina.mouseMoves).toHaveLength(1);
    expect(pagina.scrolls[0].scrollPercent).toBe(50);

    heatmap.parar();
  });

  it('reseta o registro global entre sessoes de coleta', () => {
    const heatmap = new HeatmapUtils(document.body, null, 'about');
    heatmap.iniciar();
    heatmap.getDados();

    expect(HeatmapUtils.getDadosGlobais().about).toHaveLength(1);

    HeatmapUtils.resetarRegistro();

    const dados = HeatmapUtils.getDadosGlobais();
    expect(dados.home).toEqual([]);
    expect(dados.about).toEqual([]);
    expect(dados.projects).toEqual([]);
  });
});
