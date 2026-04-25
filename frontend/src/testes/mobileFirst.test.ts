import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lerCss = (caminhoRelativo: string) => {
  const absoluto = resolve(__dirname, '..', caminhoRelativo);
  return readFileSync(absoluto, 'utf-8');
};

describe('estilizacao mobile-first', () => {
  describe('index.css', () => {
    const css = lerCss('index.css');

    it('expoe variavel de touch target minimo de 44px', () => {
      expect(css).toMatch(/--touch-target-min:\s*44px/);
    });

    it('aplica tipografia fluida com clamp em h1 e body', () => {
      expect(css).toMatch(/--fluid-h1:\s*clamp\(/);
      expect(css).toMatch(/--fluid-body:\s*clamp\(/);
      expect(css).toMatch(/font-size:\s*var\(--fluid-h1\)/);
      expect(css).toMatch(/font-size:\s*var\(--fluid-body\)/);
    });

    it('garante touch target minimo em todos os botoes', () => {
      expect(css).toMatch(/button[\s\S]{0,80}min-height:\s*var\(--touch-target-min\)/);
      expect(css).toMatch(/button[\s\S]{0,120}min-width:\s*var\(--touch-target-min\)/);
    });

    it('inclui media query mobile-first com min-width', () => {
      expect(css).toMatch(/@media\s+screen\s+and\s+\(min-width:\s*768px\)/);
    });

    it('aplica box-sizing border-box global', () => {
      expect(css).toMatch(/\*\s*,\s*\*::before\s*,\s*\*::after\s*\{[\s\S]*?box-sizing:\s*border-box/);
    });
  });

  describe('cards.css', () => {
    const css = lerCss('styles/cards.css');

    it('card-carousel comeca em 100% (mobile) e cresce para 70% via min-width', () => {
      expect(css).toMatch(/\.card-carousel\s*\{[^}]*width:\s*100%/);
      expect(css).toMatch(/@media\s+screen\s+and\s+\(min-width:\s*768px\)[\s\S]*?\.card-carousel[\s\S]*?width:\s*70%/);
    });

    it('projects-grid escala 1col -> 2col -> auto-fit conforme breakpoints', () => {
      expect(css).toMatch(/\.projects-grid\s*\{[^}]*grid-template-columns:\s*1fr/);
      expect(css).toMatch(/@media\s+screen\s+and\s+\(min-width:\s*600px\)[\s\S]*?\.projects-grid[\s\S]*?repeat\(2,\s*1fr\)/);
      expect(css).toMatch(/@media\s+screen\s+and\s+\(min-width:\s*1024px\)[\s\S]*?\.projects-grid[\s\S]*?minmax\(min\(280px,\s*100%\),\s*1fr\)/);
    });

    it('botao do carrossel respeita touch target minimo', () => {
      expect(css).toMatch(/\.carousel-nav-btn\s*\{[\s\S]*?min-width:\s*var\(--touch-target-min\)/);
      expect(css).toMatch(/\.carousel-nav-btn\s*\{[\s\S]*?min-height:\s*var\(--touch-target-min\)/);
    });

    it('botao do carrossel tem foco visivel acessivel', () => {
      expect(css).toMatch(/\.carousel-nav-btn:focus-visible[\s\S]*?outline:/);
    });

    it('page-root e centralizado em mobile e desloca para flex-start em desktop', () => {
      expect(css).toMatch(/\.page-root\s*\{[^}]*justify-content:\s*center/);
      expect(css).toMatch(/@media\s+screen\s+and\s+\(min-width:\s*768px\)[\s\S]*?\.page-root[\s\S]*?justify-content:\s*flex-start/);
    });
  });
});
