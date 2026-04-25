# Dashboard do Cliente — Design Doc

> Status: **proposta** (ainda nao implementado).
> Autor: Daniel Santos + Claude (sessao 2026-04-24).
> Escopo: como expor metricas do SDK para clientes do `dsplayground` sem
> que eles precisem aprender Grafana, sem expor dados entre tenants, e
> sem reutilizar credencial publica como credencial de leitura.

---

## 1. Problema

O SDK ja coleta eventos arbitrarios por cliente em InfluxDB (medidas
padrao — Web Vitals, page view, scroll, hover, exposicao, toque,
clique, mouse move, page exit — alem de `evento_custom` livre). Falta
**entregar essas metricas pro proprio cliente** com:

- UX limpa (referencia: New Relic — telas pre-prontas por intencao).
- Isolamento entre tenants (cliente A nao ve dado de cliente B).
- Suporte a **eventos arbitrarios** (cliente pode definir qualquer
  `evento` via SDK — nao da pra ter so N dashboards fixos).
- Sem reutilizar token do SDK (publico, embedded em browser) como
  credencial de leitura.

## 2. Arquitetura — 2 camadas

### Camada 1 — Dashboards prontos (out-of-the-box)

Para o que **todo cliente** gera, JSON versionado em
`ark/monitoring/dashboards/`:

- **Web Vitals** — LCP, FID, CLS, INP por pagina e dispositivo.
- **Page Views & Sessoes** — volume, paginas mais vistas, retencao.
- **Engajamento** — clique, scroll, hover, exposicao.
- **Saidas** — page exit, tempo de sessao, bounce.

Hand-tuned, polidos. `cliente_id` injetado via header de auth (ver §3).

### Camada 2 — Event Explorer (1 dashboard generico)

Um dashboard com variaveis dinamicas:

- `$evento` — populado via Flux `schema.measurements()` (ou tag
  values), filtrado por `cliente_id`.
- `$breakdown` — lista as tags do evento selecionado.

Cliente escolhe `evento=botao_clicado` + `breakdown=pagina` e ve
timeseries + top values + amostras recentes — **sem mexer em Flux**.
Equivalente ao "Data Explorer" do New Relic.

### Camada 3 — Custom dashboards (v2)

Cliente salva combinacoes uteis do Explorer como dashboard proprio.
Fora do MVP.

## 3. Auth — Por que NAO usar o token SDK

**Falha critica:** o token do SDK e publico. Esta no JS bundle do
site do cliente. Qualquer end-user inspeciona e pega. Se ele
desbloqueasse leitura de dashboards, o end-user da loja-do-cliente
veria as metricas da loja-do-cliente.

Padrao da industria (NR, Datadog, Segment): **separar credenciais**.

| Credencial         | Onde vive            | Permissao             |
|--------------------|----------------------|-----------------------|
| Ingest token (SDK) | JS do site do cliente | `scope: ["ingest"]`  |
| Dashboard session  | Cookie HttpOnly       | `scope: ["dashboard"]`|

## 4. Fluxo de trafego

```
Cliente → Cloudflare → Nginx host → /cliente/metricas/*
                            ↓
              Flask /api/cliente/auth/gate
              (valida cookie de sessao → Postgres)
                            ↓ (200 + X-WEBAUTH-USER: <cliente_id>)
              proxy_pass → Grafana (127.0.0.1:3001)
                            ↓
              Grafana auth.proxy confia no header
                            ↓
              InfluxDB datasource filtra por v.cliente_id
                            ↓
              Dashboard renderizado
```

Guard rails:

- Grafana segue bindando em `127.0.0.1:3001`. Sem ingress externo.
- `firewalld` bloqueia 3001 mesmo se loopback exposto por engano.
- Audit do Flask em `security.log` (CrowdSec ja le).

## 5. Schema Postgres

```sql
-- usuarios humanos do cliente que acessam dashboard
CREATE TABLE clientes_users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id   UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  email        CITEXT UNIQUE NOT NULL,
  senha_hash   TEXT,                                  -- null se magic-link only
  papel        TEXT NOT NULL DEFAULT 'viewer',        -- admin | viewer
  ativo        BOOLEAN NOT NULL DEFAULT true,
  ultimo_login TIMESTAMPTZ,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_clientes_users_cliente ON clientes_users(cliente_id);

-- sessoes ativas (cookie sha256-hash)
CREATE TABLE clientes_users_sessoes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES clientes_users(id) ON DELETE CASCADE,
  token_hash  TEXT UNIQUE NOT NULL,                   -- sha256 do cookie, nunca plaintext
  ip          INET,
  user_agent  TEXT,
  expira_em   TIMESTAMPTZ NOT NULL,
  revogada_em TIMESTAMPTZ,
  criada_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessoes_token ON clientes_users_sessoes(token_hash)
  WHERE revogada_em IS NULL;
CREATE INDEX idx_sessoes_user  ON clientes_users_sessoes(user_id);

-- magic links (login passwordless)
CREATE TABLE clientes_magic_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES clientes_users(id) ON DELETE CASCADE,
  token_hash      TEXT UNIQUE NOT NULL,               -- sha256 do token enviado por email
  expira_em       TIMESTAMPTZ NOT NULL,               -- 15 min
  consumido_em    TIMESTAMPTZ,
  ip_solicitacao  INET,
  criada_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## 6. Endpoints (Flask blueprint `/api/cliente/auth`)

| Metodo | Rota                          | Payload          | Resposta                                            |
|--------|-------------------------------|------------------|-----------------------------------------------------|
| POST   | `/magic-link/solicitar`       | `{email}`        | sempre `200 {ok:true}` (nao vaza emails existentes) |
| GET    | `/magic-link/verificar?t=...` | —                | 302 → `/cliente/metricas` + Set-Cookie              |
| POST   | `/login`                      | `{email,senha}`  | 200 + cookie OR 401                                 |
| POST   | `/logout`                     | —                | revoga sessao, limpa cookie                         |
| GET    | `/me`                         | —                | `{user_id, cliente_id, papel}` ou 401               |
| GET    | `/gate`                       | —                | 200 + `X-WEBAUTH-USER: <cliente_id>` ou 401         |

`/gate` e o endpoint do `auth_request` do nginx.

## 7. Cookie de sessao

- Nome: `cliente_session`
- Valor: `base64url(random_bytes(32))` (256-bit, gerado com
  `secrets.token_urlsafe`).
- Server guarda apenas `sha256(token)` na tabela `sessoes`.
- Flags: `HttpOnly; Secure; SameSite=Strict; Path=/`.
- `Max-Age`: 7 dias rolando (renovado a cada `/gate` ok).
- `Domain`: `dsplayground.com.br`.

## 8. Fluxo magic-link

1. Cliente abre `/cliente/login`, digita email, submete.
2. POST `/magic-link/solicitar` → rate-limit (3/email/15min,
   10/IP/15min) → gera token 32B → salva
   `sha256(token) + expira_em (now+15min)` → envia email com link
   `https://dsplayground.com.br/cliente/auth/verificar?t=<token>`.
3. Cliente clica → GET `/verificar?t=...` → valida (existe, nao
   expirou, nao foi consumido) → marca `consumido_em = now()` →
   cria sessao → Set-Cookie → 302 → `/cliente/metricas`.
4. Cada request a `/cliente/metricas/*` passa por
   `auth_request /api/cliente/auth/gate` → valida cookie → injeta
   header `X-WEBAUTH-USER: <cliente_id>`.

## 9. Rate-limit & lockout

- 5 logins falhos por (email + IP) em 15min → 30min lockout.
- 3 magic-links solicitados por email em 15min.
- 10 magic-links solicitados por IP em 15min.
- Tudo logado em `security.log` → CrowdSec parseia → bane IP abusivo.

## 10. Audit events (`security.log`)

Formato `evento=<x> cliente_id=<id> user_id=<id> ip=<ip> ua=<ua>`:

- `auth_login_ok` / `auth_login_fail`
- `auth_magic_solicitado` / `auth_magic_consumido` / `auth_magic_expirado`
- `auth_session_criada` / `auth_session_revogada` / `auth_session_expirada`
- `auth_gate_ok` / `auth_gate_negado`

## 11. Provisionamento de novo cliente

1. Cliente SDK e criado (fluxo existente — Postgres `clientes`).
2. Trigger cria 1 `clientes_users` com `papel='admin'` e email do
   contato.
3. Backend dispara magic-link "bem-vindo, clique pra acessar seu
   dashboard". Sem fricção de senha inicial.
4. Admin pode adicionar mais users via `/api/cliente/users`
   (futuro v2).

## 12. E-mail — lacuna do stack

Stack atual nao tem SMTP/MTA. Opcoes:

| Provider  | Free tier        | Notas                        |
|-----------|------------------|------------------------------|
| Resend    | 100/dia, 3k/mes  | API moderna, recomendado MVP |
| SES       | $0.10/1k         | Mais barato em escala        |
| Postmark  | 100/mes          | Entregabilidade premium      |

Adicionar `RESEND_API_KEY` em `backend/.env` via Ansible Vault.

## 13. Multi-tenant data scoping no Grafana

### Grafana side

- `grafana.ini`:
  ```
  [auth.proxy]
  enabled         = true
  header_name     = X-WEBAUTH-USER
  header_property = username
  auto_sign_up    = true
  sync_ttl        = 60
  ```
- Cada `cliente_id` vira user Grafana com role `Viewer`.

### Datasource InfluxDB

- Header `X-Cliente-ID` propagado para o datasource (Grafana suporta
  via "Custom HTTP Headers" no datasource).
- Variavel Grafana `cliente_id` do tipo `Constant`, populada por
  `${__user.login}`.

### Flux nas queries

Toda query comeca com:

```flux
from(bucket: "metricas")
  |> range(start: v.timeRangeStart, stop: v.timeRangeStop)
  |> filter(fn: (r) => r.cliente_id == "${cliente_id}")
```

Para reforcar (caso usuario duplique dashboard e remova o filter):
**datasource secundario com query header forwarding** que injeta o
filtro server-side antes de bater no Influx.

## 14. Risco residual

- Senha de dashboard reusada e vazada → atacante entra. Mitigacao:
  2FA TOTP no v2 + alerta de novo IP/UA via CrowdSec.
- Magic-link interceptado em e-mail comprometido → atacante entra.
  Mitigacao: link expira 15min + 1 uso unico + audit alerta.
- `cliente_id` 1:1 com user Grafana **explode em escala alta**
  (>500 clientes). Trocar para `auth.jwt` com claims customizados —
  mais complexo, vale so pra esse volume.
- Cardinalidade alta em InfluxDB se cliente colocar `user_id` como
  tag → cluster derrete. **Documentar no SDK**: tags = categorias
  finitas, fields = valores. Quota de series unicas por cliente em
  Postgres + reject no ingest.

## 15. Roadmap

- **MVP (~3-4 dias):** schema + endpoints `/login`, `/logout`,
  `/me`, `/gate` + magic-link + Resend + nginx `auth_request` +
  `auth.proxy` no Grafana + 1 dashboard provisionado (Web Vitals)
  como prova de conceito.
- **v1 (~1-2 sprints):** 4 dashboards out-of-the-box + Event
  Explorer + onboarding magic-link automatico no provisionamento.
- **v2:** 2FA TOTP, custom dashboards salvos pelo cliente, papel
  admin gerenciando users, dashboards programaticos via API.
- **v3 (se >500 clientes):** migrar pra `auth.jwt`, considerar UI
  React custom no portfolio para 2-3 telas mais usadas (resto
  continua Grafana embedded).

## 16. Decisoes em aberto

- Comecar pela **tabela + `/me` + `/gate`** (testavel com cookie
  manual em Postman, ~1 dia) ou **fluxo completo magic-link**
  (~3-4 dias)?
- Resend ou SES?
- Embedar Grafana via iframe em `/cliente/metricas` ou redirecionar
  pro subdominio `grafana.dsplayground.com.br` autenticado?

## 17. Referencias

- Padrao "ingest key vs read key": New Relic, Datadog, Segment.
- Grafana auth.proxy:
  https://grafana.com/docs/grafana/latest/setup-grafana/configure-security/configure-authentication/auth-proxy/
- nginx `auth_request`:
  http://nginx.org/en/docs/http/ngx_http_auth_request_module.html
- OWASP session management cheat sheet (cookie flags, lifetime).
