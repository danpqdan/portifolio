# Plano Futuro de Clientes e Ambientes

## Objetivo

A plataforma devera evoluir de um analytics local do portfolio para um servico multi-cliente. Cada cliente assinante devera conseguir enviar dados de navegacao de suas paginas e consultar apenas os dados do seu proprio ambiente, com garantias fortes de isolamento entre clientes na ingestao (Socket.IO) e na consulta (REST).

## Regra atual

Neste momento o projeto opera somente em ambiente local de desenvolvimento. Mesmo assim, toda nova configuracao deve manter separacao clara por ambiente para evitar misturar dados de desenvolvimento, testes, homologacao e producao futura.

## Separacao de ambientes

- Desenvolvimento local: `backend/.env`, `frontend/.env.development`, bucket `portifolio_dev`.
- Testes automatizados: configuracao propria e dados descartaveis.
- Producao futura: variaveis de ambiente separadas, segredo proprio, credenciais de InfluxDB fora do repositorio, Ansible Vault para segredos.

## Banco relacional — autorizacao e identidade

A partir da abertura comercial, o backend depende de um **PostgreSQL** para tudo que nao e serie temporal: identidade do cliente, tokens, quotas, auditoria de admin.

### Tabelas-base (primeira iteracao)

| tabela | chave | campos relevantes |
|---|---|---|
| `clientes` | `id` (uuid) | `nome`, `slug`, `ambiente`, `plano`, `status`, `criado_em` |
| `sites` | `id` (uuid) | `cliente_id`, `app_id` (unique), `dominios_permitidos` (array), `criado_em` |
| `tokens_api` | `jti` (uuid) | `site_id`, `tipo` (`publishable`\|`access`\|`refresh`), `scope`, `emitido_em`, `expira_em`, `revogado_em`, `hash_token` |
| `quotas` | `site_id` | `eventos_por_minuto`, `eventos_por_dia`, `retencao_dias` |
| `audit_admin` | `id` | `acao`, `session_id_alvo`, `operador`, `ip`, `timestamp` |

### Tipos de token

A plataforma opera com tres tipos distintos, com finalidades diferentes:

- **`publishable`** — identificador publico embarcado no SDK do navegador. Sem expiracao; ligado a um `site_id` e a `dominios_permitidos`. Scope fixo `ingest`. Pode ser revogado (`revogado_em`). Nunca permite consulta de dados.
- **`sdk_jwt`** — JWT assinado (RS256, com `kid`) e TTL de 5 min, stateless (nao persistido em `tokens_api`). Emitido por `POST /auth/sdk-token` mediante `publishable` valida e `Origin` na allowlist. E o que viaja no handshake do Socket.IO.
- **`access`** / **`refresh`** — fluxo de consulta REST (dashboard do cliente, integracoes server-to-server). Access curto (15 min), refresh opaco com rotacao. **Nao e usado pelo SDK do navegador.**

### Autenticacao na API de consulta REST

- Header obrigatorio: `Authorization: Bearer <access_token>`.
- Access token JWT assimetrico (`kid` + RS256) com claims `site_id`, `app_id`, `ambiente`, `scope`, `exp` (curto — 15 min).
- Refresh token opaco (nao-JWT) gravado hash na tabela `tokens_api`. Vida util maior (ex.: 30 dias), rotaciona a cada uso.
- Endpoint dedicado `POST /auth/refresh` recebe o refresh token e emite novo par.
- Revogacao: `revogado_em` preenchido invalida imediatamente; access tokens com `jti` em lista de revogacao sao rejeitados ate expirarem.

### Autenticacao na ingestao via Socket.IO

- O SDK passa `auth = { token }` no handshake do Socket.IO, onde `token` e um `sdk_jwt` valido obtido previamente em `POST /auth/sdk-token`.
- Handler de `connect` valida: assinatura (`kid` + RS256), `exp`, `scope=ingest`, `site_id` existe e nao revogado.
- Revalida o `Origin` do handshake contra `dominios_permitidos` — a validacao no `/auth/sdk-token` **nao** substitui a validacao aqui (defesa em profundidade; tokens podem ser reapresentados fora do contexto original).
- Falha -> rejeitar conexao antes de qualquer `analytics_data`.
- Cada socket e associado a um `site_id` na estrutura `active_sessions`; `handle_analytics_data` confia no `site_id` do servidor, **nao** no `app_id` que vem no payload.
- Expiracao do `sdk_jwt` em conexao aberta: o backend desconecta quando `exp` passa. O SDK deve pedir novo token aos ~4 min e reconectar antes do corte, preservando a fila de eventos pendentes.

### Emissao do `sdk_jwt` — `POST /auth/sdk-token`

Endpoint publico chamado pelo SDK no boot e a cada ~4 min.

Entrada:

```json
{ "publishable_key": "pk_xxx" }
```

Headers relevantes: `Origin`.

Fluxo do handler:

1. Resolve `publishable_key` -> `site_id`. Rejeita com 401 se inexistente ou revogado.
2. Valida `Origin` contra `sites.dominios_permitidos`. Rejeita com 403 se nao listada.
3. Valida rate limit de emissao por `publishable_key` (ex.: 1 token/min esperado; protecao extra mesmo com key vazada).
4. Valida quota do site (`eventos_por_minuto`, `eventos_por_dia`); recusa com 429 se estourado.
5. Emite JWT com claims `site_id`, `app_id`, `ambiente`, `scope=ingest`, `exp=now+300s`, `kid`.

Resposta de sucesso:

```json
{ "token": "<jwt>", "expires_in": 300 }
```

Responsabilidade do SDK: solicitar novo token antes da expiracao e reconectar o Socket.IO sem perder a fila de eventos pendentes.

### Modelo de ameaca do SDK

- **Abuso browser-based** (site malicioso copiou `publishable_key` e tenta usar): bloqueado pela validacao de `Origin`, que o navegador forca em requisicoes cross-origin.
- **Abuso server-based** (script fora do browser com `publishable_key` copiada): `Origin` e spoofavel fora do navegador. A defesa efetiva e a **quota rigida por `publishable_key`** em `quotas`. Ao ultrapassar o limite, a key e bloqueada automaticamente e o cliente e notificado.
- **`sdk_jwt` vazado**: janela maxima de abuso = 5 min. Nao ha refresh nem rotacao do `sdk_jwt` — ele simplesmente expira. A emissao continua controlada pela `publishable_key`.
- **Revogacao de `publishable_key`**: `revogado_em` -> backend para de emitir novos `sdk_jwt` -> todas as sessoes existentes caem em ≤5 min por expiracao natural, sem precisar rastrear JWTs individualmente.

### Refresh token (consulta REST)

- Aplicavel **apenas** ao fluxo de consulta REST (dashboards e integracoes server-to-server autenticadas). **Nao e usado pelo SDK de analytics do navegador**, que opera com `publishable_key` + `sdk_jwt`.
- Dashboard web armazena refresh em cookie HTTP-only; integracoes server-to-server mantem em cofre proprio.
- Troca transparente quando o access token expira: cliente faz `POST /auth/refresh` e recebe novo par.
- Rotacao e obrigatoria: reusar refresh token ja consumido gera alerta e invalidacao da cadeia.

## Isolamento multi-cliente — ingestao em Socket.IO

Requisito forte: **em nenhuma hipotese** um cliente pode receber eventos ou observar trafego de outro cliente.

### Diretrizes de design

1. **Rooms por `site_id`**: cada socket entra em `room = f"site:{site_id}"` logo apos o `connect` autenticado. Qualquer broadcast futuro (pushes, notificacoes) usa `emit(..., room=site_room)`.
2. **Nenhum broadcast global** fora de eventos operacionais do servidor. Handlers que receberam evento nao re-emitem para outros sockets.
3. **Ack apenas para o remetente**: toda resposta (`analytics_received`, `analytics_error`) e direcionada para `request.sid`, nunca para room.
4. **Validacao na camada de persistencia**: `ServicoIngestao.ingerir` recebe `site_id` do contexto autenticado do socket, nao do payload. Toda escrita no InfluxDB tag `site_id` como compulsorio.
5. **Query com filtro forcado**: endpoints de consulta REST adicionam `and r.site_id == "<site_id_do_token>"` em toda Flux query — nao ha como consultar sem filtro.

### Connector pool (multiplas conexoes concorrentes)

Quando volume exigir, introduzir um pool de conexoes para o InfluxDB e para o Postgres **com particionamento por site_id** para evitar contaminacao:

- **Postgres**: pool compartilhado, mas toda query obrigatoriamente prefixada com `SET LOCAL app.site_id = ...` e RLS (Row Level Security) ativo garantindo que nenhuma query enxergue dados de outro site mesmo com bug de aplicacao.
- **InfluxDB**: clientes separados por ambiente. Caso a escolha final seja bucket-por-cliente, um cliente InfluxDB por bucket, reutilizando conexoes via pool. Caso seja tag-por-cliente, cliente unico com filtro compulsorio.
- **Socket.IO**: nenhum worker Gunicorn/eventlet compartilha estado entre sites alem das tabelas autenticadas. O `active_sessions` ganha chave composta `(sid, site_id)` e lookups por apenas `sid` passam a verificar o `site_id` anexado.

### Garantias testaveis

Antes de virar a chave comercial, a suite precisa provar:

- Socket autenticado como `site_A` tenta enviar payload com `app_id=B` -> rejeitado com `MISMATCH_APP_ID`.
- Socket autenticado como `site_A` nao recebe eventos emitidos em rooms de `site_B` (teste com dois clientes simultaneos).
- Query REST com token de `site_A` **nao** retorna pontos de `site_B` mesmo com filtros construidos para tentar (ex.: `?app_id=B`).
- `sdk_jwt` expirado ou revogado -> `connect` rejeita imediatamente.
- Refresh token reusado -> cadeia invalidada e todos os tokens derivados rejeitados.
- `POST /auth/sdk-token` com `publishable_key` valida mas `Origin` fora da allowlist -> 403.
- `POST /auth/sdk-token` com `publishable_key` revogada -> 401, mesmo com `Origin` valida.
- `publishable_key` que estourou a quota diaria -> `POST /auth/sdk-token` retorna 429 ate o reset da janela.
- Handshake Socket.IO com `sdk_jwt` valido mas `Origin` fora da allowlist -> rejeitado (defesa em profundidade, nao apenas no `/auth/sdk-token`).

## Modelo de isolamento de dados

A definicao final sera feita junto com a estrategia de buckets. Opcoes em avaliacao:

- **Bucket por cliente** — retencao e ACL individual no InfluxDB. Melhor isolamento, mais overhead operacional.
- **Bucket por plano + tag `site_id`** — reduz overhead, depende de RLS no filtro de query ser infalivel.
- **Bucket unico por ambiente + tag `site_id`** — mais simples, maior risco: um bug no filtro vaza tudo.

Preferencia inicial: bucket-por-cliente em planos pagos, bucket-por-ambiente para tier gratuito, sempre com tag `site_id` compulsoria.

## Consulta dos dados

A API de consulta REST ja entregue (`/analytics/metricas`, `/analytics/web-vitals`, `/analytics/custom-events`) sera a base. No modo comercial ela passa a exigir auth JWT e filtra automaticamente por `site_id` do token. Consumidores avancados podem receber acesso read-only ao Grafana provisionado, com datasource apontando para o bucket/tag do proprio cliente.

## Dependencias do deploy

Todo o provisionamento novo (Postgres, pooler, Grafana multi-tenant, CrowdSec com cenarios por cliente) entra em `ark/` — roles novas (`postgres`, `auth-service`) e compose separado quando aplicavel.

## Documentos relacionados

- `docs/plano-backend.md` — Frente E lista os itens tecnicos (validar app_id, token handshake, rate limit por app, isolamento).
- `ark/docs/servidor-producao.md` — arquitetura resumida, ja inclui caixa de PostgreSQL para o modo comercial.
- `ark/ansible/` — roles a serem adicionadas quando o modelo for escolhido.
