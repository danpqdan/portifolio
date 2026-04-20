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
| `tokens_api` | `jti` (uuid) | `site_id`, `tipo` (`access`\|`refresh`), `emitido_em`, `expira_em`, `revogado_em`, `hash_token` |
| `quotas` | `site_id` | `eventos_por_minuto`, `eventos_por_dia`, `retencao_dias` |
| `audit_admin` | `id` | `acao`, `session_id_alvo`, `operador`, `ip`, `timestamp` |

### Autenticacao na API de consulta REST

- Header obrigatorio: `Authorization: Bearer <access_token>`.
- Access token JWT assimetrico (`kid` + RS256) com claims `site_id`, `app_id`, `ambiente`, `scope`, `exp` (curto — 15 min).
- Refresh token opaco (nao-JWT) gravado hash na tabela `tokens_api`. Vida util maior (ex.: 30 dias), rotaciona a cada uso.
- Endpoint dedicado `POST /auth/refresh` recebe o refresh token e emite novo par.
- Revogacao: `revogado_em` preenchido invalida imediatamente; access tokens com `jti` em lista de revogacao sao rejeitados ate expirarem.

### Autenticacao na ingestao via Socket.IO

- O SDK passa `auth = { token }` no handshake do Socket.IO.
- Handler de `connect` valida: assinatura do JWT, `exp`, `site_id` existe, `origin` do handshake pertence a `dominios_permitidos` do site.
- Falha -> rejeitar conexao antes de qualquer `analytics_data`.
- Cada socket e associado a um `site_id` na estrutura `active_sessions`; `handle_analytics_data` confia no `site_id` do servidor, **nao** no `app_id` que vem no payload.

### Refresh token

- SDK armazena refresh em storage seguro (cookie HTTP-only para apps web; keychain-equivalente em outros ambientes).
- Troca transparente quando o access token expira: o `WebSocketService` faz `POST /auth/refresh` e reconecta.
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
- Token expirado ou revogado -> `connect` rejeita imediatamente.
- Refresh token reusado -> cadeia invalidada e todos os tokens derivados rejeitados.

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
