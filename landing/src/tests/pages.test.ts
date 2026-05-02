/**
 * Smoke tests das pages publicas. Foco: o build SSR roda sem erro e os
 * blocos chave (hero, CTA, FAQ, calculadora) renderizam — sem cobrir
 * comportamento JS que precisaria de browser real.
 *
 * As pages que fazem fetch no <script> (cliente/*) ficam fora desse
 * arquivo — AstroContainer nao executa scripts, entao testar so o
 * markup HTML estatico delas teria valor baixo.
 */
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, test } from 'vitest';

import Index from '~/pages/index.astro';
import Painel from '~/pages/cliente/painel.astro';
import Precos from '~/pages/precos.astro';

async function render(component: any): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString(component, {});
}

describe('index.astro (home)', () => {
  test('renderiza sem erro e tem head com title configurado', async () => {
    const html = await render(Index);
    expect(html).toContain('Entenda seu site sem complicar');
  });

  test('hero tem CTA principal pra cadastro', async () => {
    const html = await render(Index);
    expect(html).toMatch(/href="\/cliente\/cadastro"[^>]*data-cta="hero-cadastro"/);
  });

  test('hero tem CTA secundario pra precos', async () => {
    const html = await render(Index);
    expect(html).toMatch(/href="\/precos"[^>]*data-cta="hero-precos"/);
  });

  test('hero tem badge "Feito no Brasil"', async () => {
    const html = await render(Index);
    expect(html).toContain('Feito no Brasil');
  });

  test('mockup do dashboard renderiza com SVG do grafico', async () => {
    const html = await render(Index);
    expect(html).toMatch(/<svg[^>]*viewBox="0 0 400 140"/);
    expect(html).toContain('chart-fill');
  });

  test('comparacao com concorrentes lista GA, Plausible e Fathom', async () => {
    const html = await render(Index);
    expect(html).toContain('Google Analytics');
    expect(html).toContain('Plausible');
    expect(html).toContain('Fathom');
  });

  test('FAQ tem details/summary acessiveis', async () => {
    const html = await render(Index);
    expect(html).toMatch(/<details/);
    expect(html).toMatch(/<summary/);
    expect(html).toContain('Vou precisar de banner de cookie?');
  });

  test('CTA final aponta pra cadastro', async () => {
    const html = await render(Index);
    expect(html).toMatch(/data-cta="footer-cadastro"/);
  });
});

describe('precos.astro', () => {
  test('renderiza com h1 e os 3 planos', async () => {
    const html = await render(Precos);
    expect(html).toContain('Planos simples');
    expect(html).toContain('data-plano="free"');
    expect(html).toContain('data-plano="pro"');
    expect(html).toContain('data-plano="business"');
  });

  test('toggle mensal/anual presente com aria-pressed e botao default mensal', async () => {
    const html = await render(Precos);
    expect(html).toMatch(/data-billing="mensal"[^>]*aria-pressed="true"/);
    expect(html).toMatch(/data-billing="anual"[^>]*aria-pressed="false"/);
  });

  test('plano Pro tem badge "Mais popular"', async () => {
    const html = await render(Precos);
    expect(html).toContain('Mais popular');
  });

  test('precos Pro com data-mensal=99 e data-anual=83 (16% econ)', async () => {
    const html = await render(Precos);
    expect(html).toMatch(/data-mensal="99"[^>]*data-anual="83"/);
  });

  test('plano Business diz "Sob consulta" (sem preco numerico)', async () => {
    const html = await render(Precos);
    const businessSection = html.match(/data-plano="business"[\s\S]*?<\/article>/);
    expect(businessSection).not.toBeNull();
    expect(businessSection![0]).toContain('Sob consulta');
  });

  test('calculadora tem input range com id calc-volume', async () => {
    const html = await render(Precos);
    expect(html).toMatch(/<input[^>]*id="calc-volume"[^>]*type="range"/);
    expect(html).toContain('calc-resultado');
  });

  test('tabela comparativa lista as 3 colunas de plano', async () => {
    const html = await render(Precos);
    expect(html).toMatch(/<table/);
    expect(html).toMatch(/<th[^>]*>Free<\/th>/);
    expect(html).toMatch(/<th[^>]*>Business<\/th>/);
  });

  test('FAQ billing tem perguntas chaves sobre cancelamento e reembolso', async () => {
    const html = await render(Precos);
    expect(html).toContain('Tem multa pra cancelar?');
    expect(html).toContain('Reembolso se eu não gostar?');
  });

  test('CTA do plano Pro vai pra cadastro com query plano=pro', async () => {
    const html = await render(Precos);
    expect(html).toMatch(/href="\/cliente\/cadastro\?plano=pro"/);
  });
});

describe('cliente/painel.astro', () => {
  test('renderiza com title + skeleton inicial + secoes principais escondidas', async () => {
    const html = await render(Painel);
    expect(html).toContain('Painel');
    expect(html).toContain('Carregando dados do seu site');
    // skeleton com aria-busy
    expect(html).toMatch(/id="painel-loading"[^>]*aria-busy="true"/);
    // conteudo e erro escondidos por SSR
    expect(html).toMatch(/id="painel-conteudo"[^>]*hidden/);
    expect(html).toMatch(/id="painel-erro"[^>]*hidden/);
  });

  test('4 KPIs com classes js-card-* pra hidratar', async () => {
    const html = await render(Painel);
    expect(html).toContain('js-card-eventos-hoje');
    expect(html).toContain('js-card-quota');
    expect(html).toContain('js-card-cardinalidade');
    expect(html).toContain('js-card-plano');
  });

  test('ChartCard 24h em estado empty com link pro Grafana', async () => {
    const html = await render(Painel);
    expect(html).toContain('Eventos por hora');
    expect(html).toContain('app.dsplayground.com.br');
    expect(html).toMatch(/data-state="empty"/);
  });

  test('atalhos pra configuracoes/exportar/precos', async () => {
    const html = await render(Painel);
    expect(html).toMatch(/href="\/cliente\/configuracoes"[^>]*data-cta="painel-atalho-keys"/);
    expect(html).toMatch(/href="\/cliente\/exportar"[^>]*data-cta="painel-atalho-exportar"/);
    expect(html).toMatch(/href="\/precos"[^>]*data-cta="painel-atalho-precos"/);
  });

  test('marcado noindex (area logada)', async () => {
    const html = await render(Painel);
    expect(html).toContain('noindex');
  });
});
