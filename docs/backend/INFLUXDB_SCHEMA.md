# Schema InfluxDB — Backend de Analytics

## Conexao

- **URL**: `http://localhost:8086` em dev local. Em producao vem de `INFLUXDB_URL`.
- **Token**: via variavel `INFLUXDB_TOKEN` (nunca versionar). Default local: `dev-local-influxdb-token`.
- **Bucket**: `INFLUXDB_BUCKET` (default local `portifolio_dev`).
- **Org**: `INFLUXDB_ORG` (default local `zen`).

Todas as escritas sao feitas por `backend/influxdb_service.py`. O handler Socket.IO nunca fala com InfluxDB direto — usa o `ServicoIngestao` da camada `backend/ingestao/`.

## Semantica dos dados

Cada emissao do SDK e um **delta** da janela de coleta. Valores numericos representam o que aconteceu entre o ultimo commit e o tick atual. Em consequencia, contagens no backend se somam sem deduplicar: `sum(cliques)` sobre uma janela retorna o total real; `mean(...)` nao faz sentido em contadores e pode subestimar.

## Measurement: `page_analytics`

Um Point por pagina por tick de ingestao. Agregacao por tipo de evento e feita no lado do backend antes de escrever (ver `_contar_por_tipo` em `influxdb_service.py`).

**Tags (indexados)**

| tag | descricao |
|---|---|
| `session_id` | id da sessao (vem do `request.sid` do Socket.IO) |
| `page_type` | page_id dinamico recebido do SDK (ex.: `/`, `/produto/a`) — nao e mais um enum fechado |
| `user_agent` | (alta cardinalidade hoje — previsto mover para field no plano de backend) |
| `ip_address` | IP cliente |

**Fields (contadores e tempo)**

| field | descricao |
|---|---|
| `permanencia_segundos` | segundos visiveis na janela (visibility-aware) |
| `visualizacoes` | numero de `iniciar()` ocorridos na janela |
| `cliques` | contagem de eventos `click` |
| `scrolls` | contagem de eventos `scroll_depth` |
| `mouse_moves` | contagem de eventos `mouse_move` (amostrados) |
| `toques` | contagem de eventos `touch` |
| `hovers` | contagem de eventos `hover` |
| `exposicoes` | contagem de eventos `element_exposure` |
| `custom_events` | contagem de eventos `custom` (apenas total; nome e propriedades nao vao para este measurement) |

**Timestamp**: fim da janela (tick).

## Measurement: `web_vitals`

Um Point por metrica individual (LCP, CLS, INP). Gravado quando a lib `web-vitals` entrega a metrica no navegador.

**Tags**

| tag | descricao |
|---|---|
| `session_id` | id da sessao |
| `page_type` | page_id onde a metrica foi coletada |
| `nome` | `LCP` \| `CLS` \| `INP` |
| `rating` | `good` \| `needs-improvement` \| `poor` \| `unknown` |
| `user_agent`, `ip_address` | contexto |
| `metric_id` | id interno da lib web-vitals (opcional) |

**Fields**

| field | descricao |
|---|---|
| `valor` | valor bruto da metrica |

**Timestamp**: momento em que o SDK encaminhou o evento.

## Queries de exemplo

### Visualizacoes por pagina na ultima hora

```flux
from(bucket: "portifolio_dev")
  |> range(start: -1h)
  |> filter(fn: (r) => r["_measurement"] == "page_analytics")
  |> filter(fn: (r) => r["_field"] == "visualizacoes")
  |> group(columns: ["page_type"])
  |> sum()
```

### Cliques por pagina em janelas de 1 minuto

```flux
from(bucket: "portifolio_dev")
  |> range(start: -1h)
  |> filter(fn: (r) => r["_measurement"] == "page_analytics")
  |> filter(fn: (r) => r["_field"] == "cliques")
  |> aggregateWindow(every: 1m, fn: sum, createEmpty: false)
```

### Tempo total de permanencia na sessao

```flux
from(bucket: "portifolio_dev")
  |> range(start: -24h)
  |> filter(fn: (r) => r["_measurement"] == "page_analytics")
  |> filter(fn: (r) => r["_field"] == "permanencia_segundos")
  |> group(columns: ["session_id"])
  |> sum()
```

### p75 de LCP por pagina

```flux
from(bucket: "portifolio_dev")
  |> range(start: -24h)
  |> filter(fn: (r) => r["_measurement"] == "web_vitals")
  |> filter(fn: (r) => r["nome"] == "LCP")
  |> filter(fn: (r) => r["_field"] == "valor")
  |> group(columns: ["page_type"])
  |> quantile(q: 0.75, method: "estimate_tdigest")
```

## Measurements depreciados

`session_analytics` e `realtime_navigation` existem como metodos no `InfluxDBService` (`write_session_summary`, `write_navigation_event`), mas **nao sao chamados em lugar nenhum** hoje. Estao no roadmap de remocao (`docs/plano-backend.md` — item A.2) ou de reintroducao conectada ao fluxo real.

## Dividas conhecidas

- `user_agent` como tag gera cardinalidade alta. Item C.6 do plano de backend move para field.
- Custom events ficam perdidos como `custom_events: int` — nome e propriedades nao sao persistidos. Item B.4 cria measurement `custom_events` dedicado.
- Retencao do bucket nao esta declarada. Item C.5 cria script de configuracao.
