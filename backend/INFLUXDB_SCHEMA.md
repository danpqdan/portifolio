# Configuração InfluxDB para Série Temporal

## Dados da Conexão
- **URL**: dsplayground.com.br/influxdb/
- **Token**: ***REMOVED***
- **Bucket**: portfolio_analytics (ou conforme configurado)
- **Organization**: (a ser definida)

## Schema de Dados Temporal

### Measurement: `page_analytics`

**Tags (indexados para consultas rápidas):**
- `session_id`: ID da sessão do usuário
- `page_type`: home | about | projects
- `user_agent`: Navegador do usuário
- `ip_address`: IP do cliente

**Fields (métricas numéricas):**
- `permanencia_segundos`: Tempo de permanência na página
- `visualizacoes`: Número de visualizações
- `cliques`: Número de cliques
- `scrolls`: Número de scrolls
- `mouse_moves`: Número de movimentos do mouse
- `toques`: Número de toques (mobile)

**Timestamp:** Timestamp preciso da coleta (5s intervals)

### Measurement: `session_analytics`

**Tags:**
- `session_id`: ID da sessão
- `device_type`: desktop | mobile | tablet

**Fields:**
- `total_duration`: Duração total da sessão
- `pages_visited`: Número de páginas visitadas
- `total_clicks`: Total de cliques na sessão
- `bounce_rate`: Taxa de rejeição

### Measurement: `realtime_navigation`

**Tags:**
- `session_id`: ID da sessão
- `from_page`: Página de origem
- `to_page`: Página de destino

**Fields:**
- `navigation_time`: Tempo gasto na navegação
- `timestamp_navigation`: Momento da navegação

## Consultas Temporais de Exemplo

### Permanência por Página (Última Hora)
```flux
from(bucket: "portfolio_analytics")
  |> range(start: -1h)
  |> filter(fn: (r) => r["_measurement"] == "page_analytics")
  |> filter(fn: (r) => r["_field"] == "permanencia_segundos")
  |> group(columns: ["page_type"])
  |> mean()
```

### Visualizações em Tempo Real (Últimos 5 minutos)
```flux
from(bucket: "portfolio_analytics")
  |> range(start: -5m)
  |> filter(fn: (r) => r["_measurement"] == "page_analytics")
  |> filter(fn: (r) => r["_field"] == "visualizacoes")
  |> aggregateWindow(every: 30s, fn: sum)
```

### Fluxo de Navegação
```flux
from(bucket: "portfolio_analytics")
  |> range(start: -24h)
  |> filter(fn: (r) => r["_measurement"] == "realtime_navigation")
  |> group(columns: ["from_page", "to_page"])
  |> count()
```

## Dashboards Sugeridos

1. **Real-time Visitor Flow**
2. **Page Performance Analytics**
3. **Session Duration Trends**
4. **User Interaction Heatmap**
5. **Navigation Patterns**