import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cadastrar, login, urlDashboard } from './api';

const API_URL = 'https://api.dsplayground.com.br';

function fetchMock(status: number, body: unknown): typeof fetch {
  return vi.fn(async () => {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

describe('cadastrar()', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock(201, {
      status: 'success',
      user: { id: 'u1', site_id: 's1', email: 'd@x.com', papel: 'admin' },
      site: { id: 's1', slug: 'acme', nome: 'ACME', bucket_name: 'cliente_acme', plano: 'free' },
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  test('faz POST em /cliente/auth/cadastro com credentials include', async () => {
    const r = await cadastrar({
      email: 'd@x.com', senha: 'secret-123',
      nome_site: 'ACME', slug: 'acme',
    }, { apiUrl: API_URL });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.user.email).toBe('d@x.com');

    expect(fetch).toHaveBeenCalledWith(
      `${API_URL}/cliente/auth/cadastro`,
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          email: 'd@x.com', senha: 'secret-123',
          nome_site: 'ACME', slug: 'acme',
        }),
      }),
    );
  });

  test('mapeia 409 EMAIL_JA_CADASTRADO em ErrorResult tipado', async () => {
    vi.stubGlobal('fetch', fetchMock(409, {
      status: 'error', code: 'EMAIL_JA_CADASTRADO', message: 'email ja existe',
    }));

    const r = await cadastrar({
      email: 'd@x.com', senha: 'secret-123',
      nome_site: 'ACME', slug: 'acme',
    }, { apiUrl: API_URL });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('EMAIL_JA_CADASTRADO');
      expect(r.status).toBe(409);
    }
  });

  test('400 SLUG_INVALIDO retorna code do backend', async () => {
    vi.stubGlobal('fetch', fetchMock(400, {
      status: 'error', code: 'SLUG_INVALIDO', message: 'slug invalido',
    }));
    const r = await cadastrar({
      email: 'd@x.com', senha: 'secret-123',
      nome_site: 'ACME', slug: 'AC',
    }, { apiUrl: API_URL });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('SLUG_INVALIDO');
  });

  test('falha de rede retorna code REDE', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    const r = await cadastrar({
      email: 'd@x.com', senha: 'secret-123',
      nome_site: 'ACME', slug: 'acme',
    }, { apiUrl: API_URL });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('REDE');
  });
});

describe('login()', () => {
  afterEach(() => vi.unstubAllGlobals());

  test('faz POST em /cliente/auth/login com credentials include', async () => {
    vi.stubGlobal('fetch', fetchMock(200, {
      status: 'success',
      user: { id: 'u1', site_id: 's1', email: 'd@x.com', papel: 'admin' },
    }));
    const r = await login({ email: 'd@x.com', senha: 'secret-123' }, { apiUrl: API_URL });
    expect(r.ok).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      `${API_URL}/cliente/auth/login`,
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });

  test('401 retorna code CREDENCIAIS_INVALIDAS', async () => {
    vi.stubGlobal('fetch', fetchMock(401, {
      status: 'error', code: 'CREDENCIAIS_INVALIDAS', message: 'email ou senha incorretos',
    }));
    const r = await login({ email: 'd@x.com', senha: 'errada' }, { apiUrl: API_URL });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('CREDENCIAIS_INVALIDAS');
  });
});


describe('urlDashboard()', () => {
  const DASH = 'https://app.dsplayground.com.br/cliente/metricas';

  test('sem query devolve a URL base inalterada', () => {
    expect(urlDashboard(DASH)).toBe(DASH);
  });

  test('com query vazia devolve a URL base inalterada', () => {
    expect(urlDashboard(DASH, {})).toBe(DASH);
  });

  test('adiciona query string com ? quando URL nao tem', () => {
    expect(urlDashboard(DASH, { welcome: 'true' })).toBe(`${DASH}?welcome=true`);
  });

  test('usa & quando URL ja tem query', () => {
    const url = `${DASH}?ref=signup`;
    expect(urlDashboard(url, { plano: 'free' })).toBe(`${url}&plano=free`);
  });

  test('escapa valores com URL-encode', () => {
    const out = urlDashboard(DASH, { ref: 'a b c' });
    expect(out).toContain('ref=a+b+c');
  });
});
