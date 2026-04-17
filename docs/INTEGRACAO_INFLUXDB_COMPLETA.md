# Integração InfluxDB - Sistema de Série Temporal

## 🎯 **Sistema Implementado**

Integração completa entre o sistema de coleta temporal e **InfluxDB** para armazenamento e análise de séries temporais em tempo real.

## ⚙️ **Configuração**

### **Credenciais InfluxDB:**
- **URL**: `localhost:8086`
- **Token**: `<INFLUXDB_TOKEN>`
- **Bucket**: `portifolio`
- **Organization**: `zen`
- **Versão**: `InfluxDB 2.7`

### **Variáveis de Ambiente (.env):**
```bash
INFLUXDB_URL=http://localhost:8086
INFLUXDB_TOKEN=<INFLUXDB_TOKEN>
INFLUXDB_ORG=zen
INFLUXDB_BUCKET=portifolio
INFLUXDB_ENABLED=true
```

## 📊 **Schema de Dados Temporais**

### **Measurement: `page_analytics`**
Métricas de permanência e interação por página:

**Tags (indexados):**
- `session_id`: ID da sessão do usuário
- `page_type`: home | about | projects  
- `user_agent`: Navegador do usuário
- `ip_address`: IP do cliente

**Fields (métricas):**
- `permanencia_segundos`: Tempo de permanência na página
- `visualizacoes`: Número de visualizações
- `cliques`: Número de cliques
- `scrolls`: Número de scrolls
- `mouse_moves`: Número de movimentos do mouse
- `toques`: Número de toques (mobile)

### **Measurement: `realtime_navigation`**
Eventos de navegação entre páginas:

**Tags:**
- `session_id`: ID da sessão
- `from_page`: Página de origem
- `to_page`: Página de destino

**Fields:**
- `navigation_time`: Tempo gasto na navegação

### **Measurement: `session_analytics`**
Resumo de sessões de usuário:

**Tags:**
- `session_id`: ID da sessão
- `device_type`: desktop | mobile | tablet

**Fields:**
- `total_duration`: Duração total da sessão
- `pages_visited`: Número de páginas visitadas
- `total_clicks`: Total de cliques na sessão

## 🔄 **Fluxo de Dados Automático**

### **1. Coleta Temporal (5s)**
```
Frontend (5s) → WebSocket → Backend → InfluxDB (assíncrono)
```

### **2. Processamento Automático**
```python
# A cada recebimento via WebSocket
temporal_metrics = create_temporal_metric_from_heatmap(
    session_id=request.sid,
    heatmap_data=data,
    user_agent=user_agent,
    ip_address=ip_address
)

# Envio assíncrono para InfluxDB
for metric in temporal_metrics:
    influxdb_service.write_temporal_metrics_async(metric)
```

## 🚀 **APIs de Consulta Temporal**

### **1. Métricas em Tempo Real**
```http
GET /analytics/influxdb/realtime?time_range=-5m
```

**Resposta:**
```json
{
  "status": "success",
  "time_range": "-5m",
  "metrics": [
    {
      "time": "2025-10-06T00:50:00Z",
      "page_type": "about",
      "value": 45.2,
      "measurement": "page_analytics"
    }
  ],
  "count": 15,
  "influxdb_healthy": true
}
```

### **2. Resumo por Página**
```http
GET /analytics/influxdb/summary?time_range=-1h
```

**Resposta:**
```json
{
  "status": "success",
  "page_analytics": {
    "home": {
      "permanencia_segundos": 25.4,
      "visualizacoes": 12.8,
      "cliques": 3.2
    },
    "about": {
      "permanencia_segundos": 45.7,
      "visualizacoes": 8.5,
      "cliques": 1.9
    }
  }
}
```

### **3. Saúde da Conexão**
```http
GET /analytics/influxdb/health
```

**Resposta:**
```json
{
  "status": "success",
  "influxdb_enabled": true,
  "influxdb_healthy": true,
  "influxdb_url": "localhost:8086/",
  "influxdb_bucket": "portifolio",
  "influxdb_org": "zen",
  "influxdb_version": "2.7"
}
```

### **4. Registrar Navegação**
```http
POST /analytics/influxdb/navigate
Content-Type: application/json

{
  "session_id": "abc123",
  "from_page": "home",
  "to_page": "about",
  "navigation_time": 1.2
}
```

## 📈 **Consultas Flux de Exemplo**

### **Permanência Média por Página (Última Hora)**
```flux
from(bucket: "portifolio")
  |> range(start: -1h)
  |> filter(fn: (r) => r["_measurement"] == "page_analytics")
  |> filter(fn: (r) => r["_field"] == "permanencia_segundos")
  |> group(columns: ["page_type"])
  |> mean()
```

### **Visualizações em Tempo Real (Últimos 5 minutos)**
```flux
from(bucket: "portifolio")
  |> range(start: -5m)
  |> filter(fn: (r) => r["_measurement"] == "page_analytics")
  |> filter(fn: (r) => r["_field"] == "visualizacoes")
  |> aggregateWindow(every: 30s, fn: sum)
```

### **Fluxo de Navegação**
```flux
from(bucket: "portifolio")
  |> range(start: -24h)
  |> filter(fn: (r) => r["_measurement"] == "realtime_navigation")
  |> group(columns: ["from_page", "to_page"])
  |> count()
```

## 💾 **Arquivos Criados/Modificados**

### **Novos Arquivos:**
1. `backend/influxdb_service.py` - Serviço InfluxDB
2. `backend/INFLUXDB_SCHEMA.md` - Documentação do schema

### **Arquivos Modificados:**
1. `backend/config.py` - Configurações InfluxDB
2. `backend/app.py` - Integração e novos endpoints
3. `backend/requirements.txt` - Cliente InfluxDB
4. `backend/.env.example` - Variáveis de ambiente

## 🔧 **Instalação e Execução**

### **1. Instalar Dependências**
```bash
cd backend
pip install -r requirements.txt
```

### **2. Configurar Variáveis de Ambiente**
```bash
cp .env.example .env
# Editar .env com suas configurações
```

### **3. Executar Backend**
```bash
python app.py
```

## 📊 **Dashboards Sugeridos**

### **1. Real-time Visitor Flow**
- Visualização de usuários ativos por página
- Tempo real (5s de atualização)
- Métricas: permanência, visualizações

### **2. Page Performance Analytics**
- Tempo médio de permanência por página
- Taxa de rejeição por página
- Interações por sessão

### **3. Navigation Patterns**
- Fluxo entre páginas mais comum
- Tempo de navegação entre seções
- Pontos de saída principais

### **4. User Interaction Heatmap**
- Mapa de calor de cliques por página
- Áreas mais visualizadas
- Padrões de scroll

## 🎯 **Benefícios da Integração**

1. **📈 Séries Temporais Precisas**: Dados coletados a cada 5s
2. **🔍 Analytics Avançados**: Consultas Flux poderosas  
3. **⚡ Tempo Real**: Dashboards atualizados instantaneamente
4. **📊 Visualizações Ricas**: Grafana/InfluxDB UI
5. **🔧 APIs Flexíveis**: Consultas customizadas via REST
6. **💾 Escalabilidade**: InfluxDB otimizado para séries temporais
7. **🚀 Performance**: Envio assíncrono não bloqueia frontend

## ✅ **Status da Implementação**

- ✅ **Configuração InfluxDB** - Completa
- ✅ **Schema Temporal** - Definido  
- ✅ **Envio Automático** - Implementado
- ✅ **APIs de Consulta** - Disponíveis
- ✅ **Documentação** - Completa

**O sistema está 100% operacional e enviando dados temporais para InfluxDB a cada 5 segundos!** 🚀