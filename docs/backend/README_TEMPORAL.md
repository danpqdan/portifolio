# Backend - Sistema de Coleta Temporal em Tempo Real

## Visão Geral

O backend foi atualizado para suportar o novo sistema de coleta temporal em tempo real via WebSocket, com diferenciação entre envios temporais (5s) e envios regulares (15s).

## Principais Mudanças

### 1. Cache Temporal em Memória

```python
temporal_stats_cache = {
    "total_sessions": 0,
    "active_sessions": {},  # session_id: dados da sessão
    "realtime_data": defaultdict(list),  # página: [dados temporais]
    "last_cleanup": time.time()
}
```

### 2. Detecção Automática de Tipo de Dados

O sistema detecta automaticamente se os dados recebidos são:
- **Temporais (5s)**: Poucos dados, timestamps recentes
- **Regulares (15s)**: Mais interações, dados consolidados

### 3. Logs Diferenciados

#### Logs Temporais (5s)
```
⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️
📊 DADOS TEMPORAIS RECEBIDOS - 14:32:15.123
⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️
🆔 Sessão: abc123
  ⏱️ HOME: 25s ativos
    🕐 Duração real: 24.8s
```

#### Logs Regulares (15s)
```
================================================================================
📦 DADOS REGULARES RECEBIDOS - 2024-10-06 14:32:15
================================================================================
🆔 ID do Registro: bf87a70e-ea32-48ea-aea4-26be16ebc589
📈 Total de Visualizações: 3
🖱️  Total de Cliques: 15
```

## Novos Endpoints

### 1. Estatísticas Temporais

```http
GET /analytics/stats/temporal
```

**Resposta:**
```json
{
  "status": "success",
  "timestamp": "2024-10-06T14:32:15.123Z",
  "stats": {
    "total_sessions": 150,
    "active_sessions_count": 12,
    "pages_stats": {
      "home": {
        "entries_last_minute": 24,
        "avg_permanencia_segundos": 45.2,
        "total_interacoes": 89
      }
    }
  }
}
```

### 2. Resumo de Analytics

```http
GET /analytics/stats/summary?page=home&time_range=1h
```

**Parâmetros:**
- `page`: `all`, `home`, `about`, `projects`
- `time_range`: `1h`, `24h`, `7d`

**Resposta:**
```json
{
  "status": "success",
  "summary": {
    "time_range": "1h",
    "active_sessions": 8,
    "temporal_data": {
      "home": {
        "total_entries": 145,
        "avg_permanencia": 42.5,
        "total_visualizacoes": 89,
        "unique_sessions": 23
      }
    }
  }
}
```

## Configuração

### Variáveis de Ambiente

```bash
# Intervalos temporais (milissegundos)
TEMPORAL_REALTIME_INTERVAL=5000    # Envio temporal
TEMPORAL_REGULAR_INTERVAL=15000    # Envio regular

# Cache
TEMPORAL_CACHE_SIZE=1000           # Máx entradas no cache
TEMPORAL_CLEANUP_INTERVAL=300      # Limpeza a cada 5min
```

### Configurações por Ambiente

#### Desenvolvimento
- **Temporal**: 3s
- **Regular**: 10s

#### Produção
- **Temporal**: 5s  
- **Regular**: 15s

#### Testes
- **Temporal**: 1s
- **Regular**: 3s

## Resposta do WebSocket Atualizada

```json
{
  "status": "success",
  "message": "Dados de analytics recebidos via WebSocket (temporal)",
  "tipo_envio": "temporal",
  "stats_temporais": {
    "total_sessions": 150,
    "active_sessions_count": 12,
    "pages_stats": {
      "home": {
        "entries_last_minute": 24,
        "avg_permanencia_segundos": 45.2
      }
    }
  }
}
```

## Gerenciamento de Sessões

### Conexão
- Registra nova sessão no cache temporal
- Emite confirmação de conexão

### Desconexão
- Remove sessão do cache
- Limpa dados temporais da sessão

### Limpeza Automática
- Cache limpo a cada 5 minutos
- Mantém últimas 1000 entradas por página

## Execução

```bash
# Desenvolvimento
python app.py

# Produção com gunicorn
gunicorn --worker-class eventlet -w 1 --bind 0.0.0.0:5000 app:app
```

## Logs do Sistema

### Temporal (5s)
```
🔌 Dados recebidos via WebSocket de: abc123
🧩 Tipo de envio: ⏱️ TEMPORAL (5s)
⏱️ HOME: 25s ativos
🧹 Cache temporal limpo em 14:35:00
```

### Regular (15s)
```
🔌 Dados recebidos via WebSocket de: abc123
🧩 Tipo de envio: 📦 REGULAR (15s)
📈 Total de Visualizações: 3
🖱️  Total de Cliques: 15
```

## Benefícios

1. **Monitoramento Real**: Estatísticas em tempo real a cada 5s
2. **Performance**: Cache inteligente com limpeza automática
3. **Flexibilidade**: Configuração via variáveis de ambiente
4. **Observabilidade**: Logs diferenciados por tipo de envio
5. **APIs**: Endpoints para consulta de estatísticas
6. **Escalabilidade**: Gerenciamento eficiente de sessões ativas

## Compatibilidade

O sistema mantém **100% de compatibilidade** com:
- Estrutura de dados existente
- Endpoints HTTP originais
- Formato de resposta WebSocket
- DTO `HeatmapDados`

Apenas adiciona recursos temporais sem quebrar funcionalidades existentes.