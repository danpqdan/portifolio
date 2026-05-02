/**
 * TDD do mini design system. Renderiza cada component via
 * experimental_AstroContainer e valida atributos chave (a11y, classes,
 * estado).
 *
 * Foco aqui nao e visual regression — e' contrato API + a11y. Visual
 * fica pro `astro check` + dogfood manual no browser.
 */
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, test } from 'vitest';

import Badge from './Badge.astro';
import Button from './Button.astro';
import Card from './Card.astro';
import FormError from './FormError.astro';
import Input from './Input.astro';
import Section from './Section.astro';
import Tabs from './Tabs.astro';
import ToastContainer from './ToastContainer.astro';

async function render(component: any, props: Record<string, unknown> = {}, slots?: Record<string, string>) {
  const container = await AstroContainer.create();
  return container.renderToString(component, { props, slots });
}

describe('Button', () => {
  test('renderiza <button> por default com variant primary', async () => {
    const html = await render(Button, {}, { default: 'Entrar' });
    expect(html).toMatch(/<button[^>]*type="button"/);
    expect(html).toContain('btn-primary');
    expect(html).toContain('Entrar');
  });

  test('renderiza <a> quando href passado', async () => {
    const html = await render(Button, { href: '/cadastro', variant: 'secondary' }, { default: 'Criar conta' });
    expect(html).toMatch(/<a[^>]*href="\/cadastro"/);
    expect(html).toContain('btn-secondary');
    // Nao deve ter <button>
    expect(html).not.toMatch(/<button/);
  });

  test('type submit muda atributo', async () => {
    const html = await render(Button, { type: 'submit' }, { default: 'OK' });
    expect(html).toMatch(/type="submit"/);
  });

  test('disabled aplica atributo', async () => {
    const html = await render(Button, { disabled: true }, { default: 'OK' });
    expect(html).toContain('disabled');
  });

  test('data-cta passa pro elemento (rastreamento)', async () => {
    const html = await render(Button, { 'data-cta': 'hero-cadastro' }, { default: 'Criar' });
    expect(html).toContain('data-cta="hero-cadastro"');
  });

  test('size sm aplica classes menores', async () => {
    const html = await render(Button, { size: 'sm' }, { default: 'X' });
    expect(html).toContain('text-xs');
  });

  test('fullWidth adiciona w-full', async () => {
    const html = await render(Button, { fullWidth: true }, { default: 'X' });
    expect(html).toContain('w-full');
  });

  test('variant ghost usa estilo neutro', async () => {
    const html = await render(Button, { variant: 'ghost' }, { default: 'X' });
    expect(html).not.toContain('btn-primary');
    expect(html).not.toContain('btn-secondary');
    expect(html).toContain('text-slate-300');
  });
});

describe('Card', () => {
  test('renderiza <article> por default', async () => {
    const html = await render(Card, {}, { default: '<p>conteudo</p>' });
    expect(html).toMatch(/^<article/);
    expect(html).toContain('rounded-xl');
    expect(html).toContain('border-slate-800');
  });

  test('accent aplica borda brand', async () => {
    const html = await render(Card, { accent: true }, { default: 'x' });
    expect(html).toContain('border-brand-400');
    expect(html).toContain('ring-brand-500/40');
  });

  test('padding tight reduz', async () => {
    const html = await render(Card, { padding: 'tight' }, { default: 'x' });
    expect(html).toContain('p-4');
    expect(html).not.toMatch(/\bp-6\b/);
  });

  test('as="li" muda tag', async () => {
    const html = await render(Card, { as: 'li' }, { default: 'x' });
    expect(html).toMatch(/^<li/);
  });
});

describe('Input', () => {
  test('label associada via for/id (a11y obrigatorio)', async () => {
    const html = await render(Input, { id: 'email', label: 'Email' });
    expect(html).toMatch(/<label[^>]*for="email"/);
    expect(html).toMatch(/<input[^>]*id="email"/);
  });

  test('name herda do id quando nao passado', async () => {
    const html = await render(Input, { id: 'senha', label: 'Senha' });
    expect(html).toContain('name="senha"');
  });

  test('hint vira <p> com aria-describedby', async () => {
    const html = await render(Input, {
      id: 'slug',
      label: 'Apelido',
      hint: 'Use letras minusculas',
    });
    expect(html).toContain('aria-describedby="slug-hint"');
    expect(html).toMatch(/<p[^>]*id="slug-hint"[^>]*>Use letras minusculas/);
  });

  test('required, type, autocomplete passam pro <input>', async () => {
    const html = await render(Input, {
      id: 'email',
      label: 'Email',
      type: 'email',
      required: true,
      autocomplete: 'email',
    });
    expect(html).toContain('type="email"');
    expect(html).toContain('autocomplete="email"');
    expect(html).toMatch(/<input[^>]*required/);
  });
});

describe('FormError', () => {
  test('hidden por default + role=alert', async () => {
    const html = await render(FormError, { id: 'erro' }, { default: 'mensagem' });
    expect(html).toContain('role="alert"');
    expect(html).toContain('hidden');
    expect(html).toContain('id="erro"');
  });

  test('variant warning usa amber', async () => {
    const html = await render(FormError, { id: 'aviso', variant: 'warning' });
    expect(html).toContain('border-amber-500/40');
    expect(html).not.toContain('border-red-500');
  });

  test('variant success usa emerald', async () => {
    const html = await render(FormError, { id: 'ok', variant: 'success' });
    expect(html).toContain('border-emerald-500/40');
  });
});

describe('Section', () => {
  test('default e <section> max-6xl com padding md', async () => {
    const html = await render(Section, {}, { default: 'x' });
    expect(html).toMatch(/^<section/);
    expect(html).toContain('max-w-6xl');
    expect(html).toMatch(/\bpy-16\b/);
  });

  test('narrow reduz pra max-md (forms)', async () => {
    const html = await render(Section, { narrow: true }, { default: 'x' });
    expect(html).toContain('max-w-md');
    expect(html).not.toContain('max-w-6xl');
  });

  test('spacing lg aplica py maior pra hero', async () => {
    const html = await render(Section, { spacing: 'lg' }, { default: 'x' });
    expect(html).toMatch(/\bpy-20\b/);
  });

  test('as="main" troca tag semantica', async () => {
    const html = await render(Section, { as: 'main' }, { default: 'x' });
    expect(html).toMatch(/^<main/);
  });
});

describe('Badge', () => {
  test('renderiza <span> com variant neutral por default', async () => {
    const html = await render(Badge, {}, { default: 'production' });
    expect(html).toMatch(/^<span/);
    expect(html).toContain('bg-slate-800');
    expect(html).toContain('text-slate-200');
    expect(html).toContain('production');
    expect(html).toContain('data-variant="neutral"');
  });

  test('variant success usa tokens semanticos', async () => {
    const html = await render(Badge, { variant: 'success' }, { default: 'OK' });
    expect(html).toContain('bg-success-500/15');
    expect(html).toContain('text-success-200');
    expect(html).not.toContain('bg-slate-800');
  });

  test('variant danger usa danger-*', async () => {
    const html = await render(Badge, { variant: 'danger' }, { default: 'X' });
    expect(html).toContain('bg-danger-500/15');
    expect(html).toContain('ring-danger-500/30');
  });

  test('size md aumenta padding/text', async () => {
    const html = await render(Badge, { size: 'md' }, { default: 'X' });
    expect(html).toContain('text-sm');
    expect(html).toContain('px-2.5');
  });

  test('dot=true adiciona indicador circular escondido pra a11y', async () => {
    const html = await render(Badge, { variant: 'success', dot: true }, { default: 'Ativo' });
    // Atributos podem vir em qualquer ordem — checar presenca individual
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('bg-success-400');
    expect(html).toMatch(/h-1\.5[^"]*w-1\.5[^"]*rounded-full/);
  });

  test('dot=false (default) nao renderiza indicador', async () => {
    const html = await render(Badge, {}, { default: 'X' });
    expect(html).not.toContain('aria-hidden="true"');
  });
});

describe('Tabs', () => {
  const tabs = [
    { id: 'visao', label: 'Visão geral' },
    { id: 'keys', label: 'Chaves' },
    { id: 'plano', label: 'Plano' },
  ];

  test('renderiza tablist com aria-label', async () => {
    const html = await render(Tabs, { tabs, ariaLabel: 'Configurações' });
    expect(html).toMatch(/role="tablist"[^>]*aria-label="Configurações"/);
  });

  test('cada tab tem role, id, aria-controls e data-tab-id', async () => {
    const html = await render(Tabs, { tabs });
    for (const t of tabs) {
      expect(html).toMatch(new RegExp(`role="tab"[^>]*id="tab-${t.id}"`));
      expect(html).toMatch(new RegExp(`aria-controls="panel-${t.id}"`));
      expect(html).toMatch(new RegExp(`data-tab-id="${t.id}"`));
    }
  });

  test('primeira tab fica ativa por default (aria-selected=true, tabindex=0)', async () => {
    const html = await render(Tabs, { tabs });
    expect(html).toMatch(/id="tab-visao"[^>]*aria-controls="panel-visao"[^>]*aria-selected="true"[^>]*tabindex="0"/);
    expect(html).toMatch(/id="tab-keys"[^>]*aria-selected="false"[^>]*tabindex="-1"/);
  });

  test('defaultTab override muda aba ativa', async () => {
    const html = await render(Tabs, { tabs, defaultTab: 'plano' });
    expect(html).toMatch(/id="tab-plano"[^>]*aria-selected="true"/);
    expect(html).toMatch(/id="tab-visao"[^>]*aria-selected="false"/);
  });

  test('paineis tem role=tabpanel + aria-labelledby coerente', async () => {
    const html = await render(Tabs, { tabs });
    for (const t of tabs) {
      expect(html).toMatch(new RegExp(`role="tabpanel"[^>]*id="panel-${t.id}"[^>]*aria-labelledby="tab-${t.id}"`));
    }
  });

  test('paineis inativos vem com hidden', async () => {
    const html = await render(Tabs, { tabs });
    // panel-keys e panel-plano estao inativos -> devem ter hidden
    expect(html).toMatch(/id="panel-keys"[^>]*hidden/);
    expect(html).toMatch(/id="panel-plano"[^>]*hidden/);
    // panel-visao ativo nao deve ter hidden (regex negativa simplificada:
    // verifica que nao ha 'hidden' antes do proximo '>')
    const visaoMatch = html.match(/id="panel-visao"[^>]*>/);
    expect(visaoMatch).not.toBeNull();
    expect(visaoMatch![0]).not.toContain('hidden');
  });

  test('hashSync=true seta data attr pro script ler', async () => {
    const html = await render(Tabs, { tabs, hashSync: true });
    expect(html).toContain('data-hash-sync="true"');
  });

  test('hashSync default e false', async () => {
    const html = await render(Tabs, { tabs });
    expect(html).toContain('data-hash-sync="false"');
  });
});

describe('ToastContainer', () => {
  test('renderiza region com aria-live=polite', async () => {
    const html = await render(ToastContainer);
    expect(html).toMatch(/id="ds-toast-region"[^>]*role="region"[^>]*aria-label="Notificações"[^>]*aria-live="polite"/);
  });

  test('inclui template de toast com slots data-slot', async () => {
    const html = await render(ToastContainer);
    expect(html).toContain('id="ds-toast-tpl"');
    expect(html).toContain('data-slot="icon"');
    expect(html).toContain('data-slot="message"');
    expect(html).toContain('data-slot="close"');
    expect(html).toContain('aria-label="Fechar notificação"');
  });

  test('region usa pointer-events-none pra nao bloquear cliques', async () => {
    const html = await render(ToastContainer);
    expect(html).toMatch(/id="ds-toast-region"[^>]*pointer-events-none/);
  });
});
