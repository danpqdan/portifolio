# API de Consulta e LGPD

Endpoints REST para consumir dados agregados do InfluxDB e para cumprir os direitos LGPD do titular. Todos respondem JSON, aceitam `GET` (e `DELETE` na area admin) e estao atras do mesmo blueprint `/api/` em producao (sem prefixo em dev).

## Consulta publica

Atras de `security_middleware` (rejeita IPs em blocklist). Nao exige token hoje — proteger por rate limit de IP e por regras de proxy reverso em producao.

### `GET /analytics/metricas`

Soma contadores de `page_analytics` por pagina e periodo.

Query params (todos opcionais, alem de limites sensatos):

| parametro | default | descricao |
|---|---|---|
| `app_id` | — | filtra por aplicacao emissora |
| `ambiente` | — | `development` \| `test` \| `staging` \| `production` |
| `page_type` | — | page_id dinamico (ex.: `/`, `/produto/a`) |
| `inicio` | `-24h` | qualquer expressao aceita pelo Flux (`-1h`, `-7d`, `2026-04-01T00:00:00Z`) |
| `fim` | `now()` | idem |
| `limit` | `100` | teto 1000 |

Resposta:

```json
{
  "status": "success",
  "filtros": { "app_id": "portfolio-local", "page_type": "/", "limit": 100, ... },
  "pontos": [
    { "page_type": "/", "totais": { "cliques": 14, "visualizacoes": 3, "permanencia_segundos": 240 } }
  ]
}
```

### `GET /analytics/web-vitals`

Lista pontos de `web_vitals`. Alem dos parametros comuns, aceita `nome` (`LCP` \| `CLS` \| `INP`).

Resposta:

```json
{
  "status": "success",
  "filtros": { "nome": "LCP", ... },
  "pontos": [
    { "time": "2026-04-18T02:11:00Z", "nome": "LCP", "page_type": "/", "rating": "good", "valor": 1820 }
  ]
}
```

### `GET /analytics/custom-events`

Soma ocorrencias de eventos customizados por `nome` e pagina.

```json
{
  "status": "success",
  "filtros": { "nome": "checkout_iniciado", ... },
  "pontos": [
    { "nome": "checkout_iniciado", "page_type": "/", "ocorrencias": 4 }
  ]
}
```

### Codigos de resposta

- `200` — sucesso
- `503 unavailable` — InfluxDB nao inicializado
- `429` — rate limit (via Flask-Limiter, 30 req/min por IP nesses endpoints)
- `403` — IP em blocklist (`security_middleware`)

## Admin LGPD

Exigem header `Authorization: Bearer <token>` com o valor da variavel de ambiente `ADMIN_API_TOKEN`. Sem token ou token errado → `401 UNAUTHORIZED`. Cada chamada bem-sucedida gera entrada `[ADMIN-AUDIT] acao=... session_id=... resultado=... ip=... timestamp=...` em `security.log`.

### `GET /admin/analytics/sessao/<session_id>`

Retorna todos os pontos associados a uma sessao nos tres measurements (`page_analytics`, `web_vitals`, `custom_events`).

```json
{
  "status": "success",
  "session_id": "abc-123",
  "dados": {
    "page_analytics": [ { "time": "...", "field": "cliques", "value": 5, "tags": { ... } } ],
    "web_vitals": [ ],
    "custom_events": [ ]
  }
}
```

Suporta janela implicita (`-30d`) — ajustar se a politica de retencao for diferente.

### `DELETE /admin/analytics/sessao/<session_id>`

Apaga todos os pontos da sessao nos tres measurements via InfluxDB Delete API. Retorna `status=success` quando bem-sucedido em todos, `status=partial` se algum measurement falhou.

```json
{ "status": "success", "session_id": "abc-123", "apagado": true }
```

## Configuracao

- `ADMIN_API_TOKEN`: obrigatorio para os endpoints `/admin/*` funcionarem. Sem ele, qualquer chamada retorna `401`. Gerar com `python -c "import secrets; print(secrets.token_urlsafe(32))"` e distribuir apenas para quem opera o backend.
- Recomenda-se colocar `/admin/*` atras de autenticacao adicional (mTLS, VPN, IP allowlist) em producao.

## Exemplos com `curl`

```bash
# soma de cliques por pagina nas ultimas 24h
curl 'http://localhost:5000/analytics/metricas?app_id=portfolio-local'

# distribuicao de LCP por pagina no ultimo dia
curl 'http://localhost:5000/analytics/web-vitals?nome=LCP'

# contagem de um evento de negocio
curl 'http://localhost:5000/analytics/custom-events?nome=checkout_iniciado'

# LGPD — acesso
curl -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  http://localhost:5000/admin/analytics/sessao/abc-123

# LGPD — exclusao
curl -X DELETE -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  http://localhost:5000/admin/analytics/sessao/abc-123
```
