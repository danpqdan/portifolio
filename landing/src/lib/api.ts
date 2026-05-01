/**
 * Cliente HTTP do landing -> api.dsplayground.com.br.
 *
 * Endpoints de auth humana retornam JSON com forma:
 *   sucesso: { status: 'success', user, site? }
 *   erro:    { status: 'error', code, message }
 *
 * Aqui tipamos os codes conhecidos e retornamos um discriminated union
 * `Result<T>` para o caller fazer narrowing por `r.ok`. Cookies de sessao
 * sao gerenciados pelo browser (HttpOnly), portanto sempre `credentials: 'include'`.
 */

export interface CadastroPayload {
  email: string;
  senha: string;
  nome_site: string;
  slug: string;
}

export interface LoginPayload {
  email: string;
  senha: string;
}

export interface UserDto {
  id: string;
  site_id: string;
  email: string;
  papel: string;
}

export interface SiteDto {
  id: string;
  slug: string;
  nome: string;
  bucket_name: string | null;
  plano: string;
}

export type CadastroErrorCode =
  | 'PAYLOAD_INCOMPLETO'
  | 'EMAIL_INVALIDO'
  | 'SENHA_CURTA'
  | 'SLUG_INVALIDO'
  | 'EMAIL_JA_CADASTRADO'
  | 'SLUG_JA_CADASTRADO'
  | 'CADASTRO_NAO_CONFIGURADO'
  | 'REDE'
  | 'INESPERADO';

export type LoginErrorCode =
  | 'CREDENCIAIS_INVALIDAS'
  | 'REDE'
  | 'INESPERADO';

export type Result<T, E> =
  | { ok: true } & T
  | { ok: false; code: E; message: string; status: number };

export interface CadastroOk {
  user: UserDto;
  site: SiteDto;
}

export interface LoginOk {
  user: UserDto;
}

export interface ApiOptions {
  apiUrl: string;
  fetchImpl?: typeof fetch;
}

async function postJson<TOk, TErr extends string>(
  url: string,
  body: unknown,
  fetchImpl: typeof fetch,
): Promise<Result<TOk, TErr>> {
  let resp: Response;
  try {
    resp = await fetchImpl(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, code: 'REDE' as TErr, message: 'falha de rede', status: 0 };
  }

  let data: any;
  try {
    data = await resp.json();
  } catch {
    return {
      ok: false,
      code: 'INESPERADO' as TErr,
      message: `resposta nao-JSON (status ${resp.status})`,
      status: resp.status,
    };
  }

  if (resp.ok) {
    const { status: _ignored, ...rest } = data;
    return { ok: true, ...(rest as TOk) };
  }
  return {
    ok: false,
    code: (data?.code ?? 'INESPERADO') as TErr,
    message: data?.message ?? 'erro inesperado',
    status: resp.status,
  };
}

export function cadastrar(
  payload: CadastroPayload,
  opts: ApiOptions,
): Promise<Result<CadastroOk, CadastroErrorCode>> {
  return postJson<CadastroOk, CadastroErrorCode>(
    `${opts.apiUrl}/cliente/auth/cadastro`,
    payload,
    opts.fetchImpl ?? fetch,
  );
}

export function login(
  payload: LoginPayload,
  opts: ApiOptions,
): Promise<Result<LoginOk, LoginErrorCode>> {
  return postJson<LoginOk, LoginErrorCode>(
    `${opts.apiUrl}/cliente/auth/login`,
    payload,
    opts.fetchImpl ?? fetch,
  );
}

/**
 * Constroi URL absoluta pro dashboard logado (subdominio app.X em prod).
 * Necessario porque, depois do cutover do apex pro CF Pages, redirect
 * relativo `/cliente/metricas` cai numa pagina estatica que nao existe.
 *
 * @param dashboardUrl base (ex: https://app.dsplayground.com.br/cliente/metricas)
 * @param query params opcionais (ex: { welcome: 'true' })
 */
export function urlDashboard(
  dashboardUrl: string,
  query?: Record<string, string>,
): string {
  if (!query || Object.keys(query).length === 0) return dashboardUrl;
  const sep = dashboardUrl.includes('?') ? '&' : '?';
  const qs = new URLSearchParams(query).toString();
  return `${dashboardUrl}${sep}${qs}`;
}
