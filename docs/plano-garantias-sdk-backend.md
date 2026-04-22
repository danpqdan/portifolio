# Plano de Garantias SDK <-> Backend

## Objetivo

Este documento define o contrato de confiabilidade e autenticacao entre o SDK de analytics (browser) e o backend de ingestao (Flask + Socket.IO). Ele fecha os buracos auditados em `docs/escalabilidade.md` (perda silenciosa, duplicacao, ausencia de resync pos-reconnect) e integra o fluxo multi-tenant previsto em `docs/plano-clientes-ambientes.md`.

A diretriz fundamental e: **nenhum evento coletado pelo SDK pode ser perdido ou duplicado silenciosamente, e nenhum token emitido para o SDK pode pivotar para endpoints fora da ingestao.**

## Dominio e isolamento de endpoints

Toda comunicacao SDK <-> backend passa por:

```
https://api.dsplayground
```

O dominio `api.dsplayground` hospeda ao menos tres familias de endpoint:

| Prefixo | Uso | Token aceito |
|---|---|---|
| `/auth/sdk-token` | Emissao do `sdk_jwt` a partir da `publishable_key` | Nenhum (endpoint publico, validado por publishable + Origin) |
| `/analytics/ingest` + Socket.IO | Ingestao de eventos do SDK | `sdk_jwt` com `scope=ingest` |
| `/analytics/query`, `/admin/*` | Consulta, dashboard, admin | `access_token` com `scope=query` ou `scope=admin` |

**Regra inviolavel**: um `sdk_jwt` obtido pelo SDK **so** e aceito em `/analytics/ingest` e nos eventos Socket.IO de ingestao. Qualquer outro endpoint no mesmo dominio retorna 403 mesmo que o JWT esteja valido.

## Pre-requisito: autenticacao multi-tenant

Integra e depende do modelo descrito em `plano-clientes-ambientes.md`. Resumo operacional aqui, sem repetir estruturas de banco.

### Fluxo de emissao do token

```
SDK (browser)                                Backend api.dsplayground
  │                                            │
  │ POST /auth/sdk-token                       │
  │   body: { publishable_key: "pk_xxx" }      │
  │   headers: Origin: https://cliente.com     │
  ├──────────────────────────────────────────>│
  │                                            │
  │                                            │ 1. publishable_key -> site_id (rejeita se revogada)
  │                                            │ 2. Origin ∈ sites.dominios_permitidos (rejeita se fora)
  │                                            │ 3. rate limit emissao por key
  │                                            │ 4. quota ativa (site nao bloqueado)
  │                                            │ 5. monta sdk_jwt
  │                                            │
  │ 200 { token, expires_in: 300,              │
  │       server_time, last_received_id }      │
  │<──────────────────────────────────────────┤
  │                                            │
  │ connect Socket.IO                          │
  │   auth: { token }                          │
  ├──────────────────────────────────────────>│
  │                                            │
  │                                            │ valida jwt (aud, scope, exp, kid)
  │                                            │ revalida Origin contra dominios_permitidos
  │                                            │ anexa site_id em active_sessions
  │                                            │
  │ aos ~4 min: POST /auth/sdk-token novamente │
  │                                            │
```

### Claims obrigatorios do `sdk_jwt`

```json
{
  "iss": "api.dsplayground",
  "aud": "api.dsplayground",
  "sub": "site_<uuid>",
  "site_id": "<uuid>",
  "app_id": "<slug>",
  "ambiente": "production",
  "scope": "ingest",
  "exp": 1714750000,
  "iat": 1714749700,
  "jti": "<uuid>",
  "kid": "<chave-ativa>"
}
```

### Prevencao de pivoting (defesa em profundidade)

Um `sdk_jwt` **NAO** deve ser aceito fora do escopo de ingestao. Tres camadas enforcam isso:

1. **Middleware global de autenticacao**: todo endpoint autenticado em `api.dsplayground` declara o `scope` exigido. Handler `/analytics/query` exige `scope=query`; `sdk_jwt` com `scope=ingest` e rejeitado com `403 INVALID_SCOPE` antes de qualquer processamento.
2. **Audience check**: o middleware rejeita JWTs com `aud != "api.dsplayground"`. Garante que tokens de outros servicos (se houver no futuro) nao sejam reaproveitados aqui.
3. **Socket.IO event-level guard**: o handler de `connect` armazena `scope` em `active_sessions[sid]`. Cada evento subsequente (`analytics_data`, etc.) valida que o socket tem `scope=ingest` antes de processar.

### Isolamento por tenant

- Cadeia de tokens **por tenant**: `publishable_key` e todo `jti` emitido derivam de um `site_id`. A revogacao de `publishable_key` (`revogado_em`) para emissao nova e, em ate 5 min, todas as sessoes do tenant caem por expiracao natural do `sdk_jwt`.
- Nenhuma chave e compartilhada entre tenants. Comprometimento de um cliente nao vaza para outro.
- `active_sessions` e indexado por `(sid, site_id)`; nao ha como um socket autenticado como `site_A` afetar estado de `site_B`.

## Onda 1 — Entrega confiavel (nao perder, nao duplicar)

Prioridade maxima. Resolve os tres maiores buracos de confiabilidade.

### 1.1 Idempotencia no backend

**Problema atual**: `id_registro` repetida gera N Points no InfluxDB (`influxdb_service.py:134`).

**Solucao**:

- Cache em memoria (LRU com TTL 10 min) no backend mapeando `(site_id, id_registro) -> resumo`.
- Handler `analytics_data` consulta o cache antes de processar. Hit: retorna o mesmo `resumo` do ack original, sem reescrever no InfluxDB. Miss: processa normalmente e grava no cache.
- Quando Redis entrar na arquitetura (ver `plano-clientes-ambientes.md`), migrar o cache para Redis com mesma semantica.
- `id_registro` continua sendo UUID gerado no SDK (`filaAnalytics.ts:176`). Nao ha alteracao no contrato do SDK para isso.

### 1.2 Delivery ack-confirmed

**Problema atual**: no caminho feliz, item sai de `emVoo` sem garantia de ack (`WebSocketService.tsx:209`).

**Solucao no SDK**:

- Item permanece em `emVoo` ate um dos dois: ack `success` recebido **OU** timeout de 10s.
- Em timeout, item volta para o inicio da fila com `tentativas++`. Retry com backoff exponencial (1s, 2s, 4s, 8s, max 30s).
- Em ack `error` com `code=INVALID_PAYLOAD`, item e descartado e reportado por evento interno `analytics:payload_rejected` com o `code` e os `fields` (ver secao 2.1).
- Em disconnect durante `emVoo`, itens retornam para a fila preservando ordem de insercao original.
- Limite de `tentativas` por item: **5**. Excedeu, item vai para `dead_letter` interno (ver secao 2.2).

### 1.3 Resync pos-reconnect

**Problema atual**: apos reconnect, SDK redrena toda a fila desde o inicio; backend nao sabe distinguir retry de novo (`WebSocketService.tsx:129`).

**Solucao**:

- Backend mantem em `active_sessions` (ou Redis) um campo `last_received_id_registro` **por `session_id` logico do SDK** (nao confundir com `sid` do Socket.IO, que muda a cada reconnect).
- No ack de `connect` (e no retorno de `POST /auth/sdk-token`), backend envia:
  ```json
  {
    "last_received_id_registro": "<uuid>",
    "last_received_at": 1714749800000,
    "server_time": 1714749802000
  }
  ```
- SDK, ao receber, percorre a fila e descarta todo item com `inserido_em <= last_received_at`. Itens posteriores sao redrenados normalmente.
- Combinado com a idempotencia (1.1), essa estrategia garante: nenhum evento perdido entre disconnect e reconnect, nenhum evento duplicado se o SDK for agressivo no retry.

### 1.4 Contrato de ack (novo formato)

Ack de **sucesso** (evento `analytics_received`):

```json
{
  "status": "success",
  "schema_version": "1.1",
  "id_registro": "<uuid>",
  "server_seq": 12345,
  "server_time": 1714749802000,
  "resumo": {
    "visualizacoes": 1,
    "cliques": 3,
    "segundos": 5
  }
}
```

Ack de **erro de validacao** (evento `analytics_error`):

```json
{
  "status": "error",
  "schema_version": "1.1",
  "id_registro": "<uuid>",
  "code": "INVALID_ANALYTICS_PAYLOAD",
  "message": "Payload invalido",
  "fields": ["pagina.page_id"],
  "retriable": false
}
```

Campos obrigatorios no ack (novos em **negrito**):

- `status`, `schema_version`, **`id_registro`** (ecoa o do payload, amarra ack ao item), **`server_seq`** (monotonico por session, usado em deteccao de gap opcional), **`server_time`** (referencia para correcao de skew), **`retriable`** (false para erros de validacao, true para erros transitorios do backend).

### 1.5 Estado logico de sessao vs. transporte

A `session_id` do analytics (ver `levantamento-sdk-analytics.md`) e **logica** e sobrevive a reconexoes. O `sid` do Socket.IO muda a cada reconnect. Backend precisa tratar:

- `active_sessions[sid]` mapeia para `session_id` no handshake.
- Estado de deduplicacao e `last_received_id_registro` sao indexados por `session_id`, nunca por `sid`.
- Reconnect com mesmo `session_id` e autorizado se o `sdk_jwt` carrega o mesmo `site_id` da sessao anterior.

## Onda 2 — Dados limpos

### 2.1 Timestamp plausibility

**Problema atual**: backend aceita qualquer `timestamp_inicial` numerico (`validador.py:31-32`).

**Solucao no backend**:

- Valida `timestamp_inicial` dentro da janela `[server_time - 24h, server_time + 5min]`.
- Valida `timestamp_final >= timestamp_inicial` e `timestamp_final - timestamp_inicial <= 1 hora`.
- Rejeita com `code=INVALID_TIMESTAMP`, `retriable=false`.

**Solucao no SDK**:

- No `connect` ack, SDK calcula `skew = server_time - Date.now()`.
- Se `|skew| > 30s`, corrige todos os timestamps de payload usando `Date.now() + skew` antes de enfileirar.
- Correcao aplicada tambem em eventos ja enfileirados mas nao enviados, para evitar rejeicao em massa apos um laptop acordar do sleep.

### 2.2 Fila overflow com aviso

**Problema atual**: `aplicarLimite()` descarta silenciosamente (`filaAnalytics.ts:202-208`).

**Solucao**:

- Ao descartar, emitir evento `analytics:queue_overflow` com:
  ```json
  { "dropped_count": 10, "oldest_dropped_at": 1714749000000, "reason": "limit_exceeded" }
  ```
- Consumidor do SDK pode subscrever para logar. Sem subscritor, evento e silencioso (nao quebra nada).
- **Prioridade de descarte**: `mouse_move` > `hover` > `scroll` > `click` > `page_view`. Itens com `priority=high` (ex.: `page_exit`) **nunca** sao descartados por overflow — se necessario, descarta-se o mais antigo dentre os baixos.
- Itens que excederam `tentativas=5` vao para `dead_letter` (contador interno), que tambem emite `analytics:item_dead_lettered` com `id_registro` e `code` do ultimo erro. Nao bloqueiam a fila principal.

## Onda 3 — Coordenacao dinamica

### 3.1 Backpressure reativo

**Problema atual**: backend loga saturacao (`servico_ingestao.py:74-77`), SDK nao recebe sinal.

**Solucao**:

- Backend inclui em cada ack um campo `backpressure_hint`:
  - `"ok"` — operacao normal
  - `"slow"` — fila pendente > 50 itens no thread pool do InfluxDB
  - `"stop"` — fila pendente > 200 itens ou InfluxDB retornando erro sustentado
- SDK reage:
  - `slow`: multiplica `intervaloEnvioMs` por 3 (5s -> 15s), por ate 60s. Apos 3 acks consecutivos `ok`, volta gradualmente ao default.
  - `stop`: para de drenar a fila (continua enfileirando localmente). Retoma apos 1 ack `ok` ou apos 2 min.
- Testa-se com backend sintetico forcando os estados.

### 3.2 Schema version negotiation

**Problema atual**: `schema_version` existe no payload, backend nao valida.

**Solucao no handshake**:

- `POST /auth/sdk-token` retorna, alem do token:
  ```json
  {
    "server_schema_version": "1.1",
    "min_client_schema": "1.0"
  }
  ```
- SDK envia `X-SDK-Schema-Version` no header do `POST /auth/sdk-token` e `schema_version` em cada payload.
- Backend rejeita `POST /auth/sdk-token` se `X-SDK-Schema-Version < min_client_schema` com `code=UNSUPPORTED_SCHEMA`. SDK deve informar o desenvolvedor e parar — nao tentar downgrade silencioso.
- SDK detecta `server_schema_version > schema_version_do_sdk` e ativa modo "forward-compat" (envia payload na sua versao, ignora campos desconhecidos no ack).

## Testes de aceite

A suite de testes deve provar, antes da abertura comercial:

### Auth e isolamento de scope

- `sdk_jwt` com `scope=ingest` usado em `/analytics/query` -> 403 `INVALID_SCOPE`.
- `sdk_jwt` com `aud != "api.dsplayground"` -> 401 `INVALID_AUDIENCE`.
- Socket.IO connect com JWT sem `scope=ingest` -> rejeitado.
- `publishable_key` de `tenant_A` + Origin de `tenant_B` -> 403.
- Revogacao de `publishable_key` -> novo `POST /auth/sdk-token` falha imediatamente; conexoes ativas caem em ≤5 min.

### Entrega (Onda 1)

- Enviar mesmo `id_registro` 3x seguidas -> backend grava 1 Point, retorna 3 acks `success` identicos.
- Derrubar backend apos `emit` e antes de ack, reconectar -> item e reenviado e aceito; nao ha duplicata.
- SDK com fila de 20 itens reconecta apos 10 ja terem sido recebidos; backend informa `last_received_id`; SDK descarta 10, reenvia 10; zero duplicata, zero perda.
- Timeout de ack (10s) -> item volta pra fila, retentativa bem-sucedida.
- Item com `tentativas=5` esgotadas -> entra em `dead_letter`, emite evento interno, nao trava a fila.

### Dados limpos (Onda 2)

- Payload com `timestamp_inicial` 1 ano no futuro -> rejeitado.
- Fila cheia com mousemove descarta primeiro; `page_exit` permanece.
- SDK com relogio 10 min adiantado recebe `server_time` e corrige skew antes da proxima emissao.

### Coordenacao (Onda 3)

- Backend retornando `backpressure_hint=slow` -> SDK aumenta `intervaloEnvioMs` para 15s dentro de 1 tick.
- Backend retornando `backpressure_hint=stop` por 90s -> SDK nao emite, mas a fila nao estoura (itens se acumulam dentro do limite).
- SDK com `schema_version=0.9` contra servidor `min_client_schema=1.0` -> `POST /auth/sdk-token` retorna `UNSUPPORTED_SCHEMA`.

## Ordem de implementacao recomendada

1. **Auth multi-tenant** (`POST /auth/sdk-token`, claims, middleware de scope, Socket.IO guard) — bloqueia tudo o que vem depois.
2. **Onda 1** inteira, em uma unica frente (idempotencia + delivery ack-confirmed + resync + ack novo). Essas quatro pecas sao interdependentes — implementar uma sem as outras deixa regressao.
3. **Onda 2** — timestamp plausibility e fila overflow. Sao isoladas e podem entrar em PRs separados.
4. **Onda 3** — backpressure e schema negotiation. Depende da Onda 1 estar estavel.

Cada onda entra com sua suite de testes (ver secao anterior). Sem os testes, o merge da onda nao sobe para producao.

## Documentos relacionados

- `docs/plano-clientes-ambientes.md` — modelo de auth multi-tenant, tabelas, tipos de token.
- `docs/levantamento-sdk-analytics.md` — contrato atual do SDK (payload, ack 1.0, fila).
- `docs/plano-backend.md` — frentes tecnicas do backend.
- `docs/escalabilidade.md` — auditoria das garantias (estado atual) e projecao de capacidade.
