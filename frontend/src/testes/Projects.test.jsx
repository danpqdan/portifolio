import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import Projects from '../pages/Projects';

afterEach(() => {
  cleanup();
});

describe('pagina Projects (mobile-first)', () => {
  it('renderiza com a classe page-root para layout responsivo', () => {
    const { container } = render(<Projects />);
    expect(container.querySelector('.page-root')).not.toBeNull();
  });

  it('lista de projetos usa classe projects-grid (sem styles inline de coluna fixa)', () => {
    render(<Projects />);
    const lista = screen.getByText('Projetos').closest('#projects_card')?.querySelector('#projects_list');
    expect(lista).not.toBeNull();
    expect(lista?.classList.contains('projects-grid')).toBe(true);
    const inline = lista?.getAttribute('style') ?? '';
    expect(inline).not.toMatch(/grid-template-columns/i);
    expect(inline).not.toMatch(/minmax\(400px/i);
  });

  it('cards de projeto sao acessiveis por teclado', () => {
    const { container } = render(<Projects />);
    const cards = container.querySelectorAll('.project-card-container');
    expect(cards.length).toBeGreaterThan(0);
    cards.forEach((card) => {
      expect(card.getAttribute('role')).toBe('button');
      expect(card.getAttribute('tabIndex')).toBe('0');
      expect(card.getAttribute('aria-pressed')).toBe('false');
    });
  });

  it('cards de projeto alternam aria-pressed ao acionar via Enter', () => {
    const { container } = render(<Projects />);
    const card = container.querySelector('.project-card-container');
    expect(card).not.toBeNull();
    expect(card?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(card!, { key: 'Enter' });
    expect(card?.getAttribute('aria-pressed')).toBe('true');
  });

  it('cards nao tem mais largura fixa de 300px inline', () => {
    const { container } = render(<Projects />);
    const cards = container.querySelectorAll('.project-card-container');
    cards.forEach((card) => {
      const style = card.getAttribute('style') ?? '';
      expect(style).not.toMatch(/width:\s*300px/i);
    });
  });
});
