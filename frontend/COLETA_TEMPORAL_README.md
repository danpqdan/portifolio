# Sistema de Coleta Temporal em Tempo Real via WebSocket

## Visão Geral

Este sistema foi refatorado para realizar coleta temporal em tempo real do tempo de permanência em tela, enviando dados via WebSocket em intervalos regulares de 5 segundos para cada página (home, about, projects).

## Principais Mudanças

### 1. HeatmapUtils.tsx
- **Novos recursos de coleta temporal**:
  - `configurarColecaoTempoReal()`: Configura callback para coleta em tempo real
  - `iniciarColecaoTempoReal()`: Inicia coleta temporal automática
  - `getTempoPermanciaSegundos()`: Retorna tempo preciso de permanência na página
  - Controle de visibilidade da página para pausa/retomada da contagem
  - Timestamps mais precisos considerando quando a página está oculta/visível

### 2. WebSocketService.tsx
- **Envios em tempo real**:
  - Intervalo padrão reduzido para 5 segundos
  - `sendAnalyticsDataImmediate()`: Envio prioritário bypass da fila
  - `configureRealtimeCollection()`: Configuração de coleta temporal
  - `setRealtimeInterval()`: Configuração dinâmica do intervalo

### 3. useHeatmap.tsx
- **Integração com coleta temporal**:
  - Opção `realtimeCollection: true` por padrão
  - Intervalo padrão: 5 segundos para tempo real
  - `getTempoPermancia()`: Acesso ao tempo de permanência
  - `setRealtimeInterval()`: Controle dinâmico do intervalo

### 4. Classes de Página (Home, About, Projects)
- **Coleta temporal automática**:
  - Configuração automática de coleta a cada 5 segundos
  - Envio prioritário no `parar()`
  - Novos métodos: `getTempoPermancia()` e `setIntervaloColecaoTemporal()`
  - Logs detalhados em modo DEBUG

## Estrutura de Dados

O sistema mantém a estrutura existente, mas com timestamps mais precisos:

```json
{
   "analytics_data": {
      "id_registro": "bf87a70e-ea32-48ea-aea4-26be16ebc589",
      "timestamp_inicial": 1759718338444,
      "timestamp_final": 1759718414417,
      "home": [
         {
            "visualizacoes": 1,
            "segundos": 76, // Tempo mais preciso considerando visibilidade
            "timestamp_inicial": 1759718338444,
            "timestamp_final": 1759718414417,
            "cliques": []
         }
      ],
      "about": [...],
      "projects": [...]
   }
}
```

## Intervalos de Envio

### Tempo Real (Novo)
- **Coleta temporal**: 5 segundos
- **Método**: `sendAnalyticsDataImmediate(dados, false)`
- **Prioridade**: Normal, usa fila

### Envio Adicional
- **Intervalo**: 15 segundos (reduzido de 30s)
- **Método**: `sendAnalyticsData(dados)`
- **Propósito**: Backup e dados não-temporais

### Envio Prioritário
- **Quando**: No `parar()` das classes
- **Método**: `sendAnalyticsDataImmediate(dados, true)`
- **Prioridade**: Alta, bypass da fila

## Como Usar

### 1. Com useHeatmap Hook
```jsx
const { getTempoPermancia, setRealtimeInterval } = useHeatmap('home', '#home_content', {
  realtimeCollection: true,
  realtimeInterval: 5000, // 5 segundos
  debug: true
});

// Obter tempo atual de permanência
const tempoSegundos = getTempoPermancia();

// Alterar intervalo dinamicamente
setRealtimeInterval(3000); // 3 segundos
```

### 2. Com Classes Diretas
```jsx
const classeHome = new ClasseHome(document.body);
classeHome.iniciar();

// Obter tempo de permanência
const tempo = classeHome.getTempoPermancia();

// Configurar intervalo personalizado
classeHome.setIntervaloColecaoTemporal(8000); // 8 segundos
```

## Logs de Debug

Com `DEBUG_ENABLED = true`, o sistema exibe logs detalhados:

```
📊 [ClasseHome] Dados temporais enviados: {
  timestamp: "2024-10-06T...",
  tempoPermanciaSegundos: 15,
  totalVisualizacoes: 1
}

🛑 [ClasseHome] Coleta parada e dados finais enviados
```

## Controle de Visibilidade

O sistema pausa a contagem quando:
- A aba perde o foco
- A janela é minimizada
- O usuário muda para outra aba

E retoma automaticamente quando volta ao foco.

## Benefícios

1. **Tempo Real**: Dados temporais enviados a cada 5 segundos
2. **Precisão**: Considera visibilidade da página
3. **Flexibilidade**: Intervalos configuráveis dinamicamente
4. **Confiabilidade**: Múltiplos níveis de envio (tempo real + backup)
5. **Compatibilidade**: Mantém interface existente das classes

## Próximos Passos

Para testar o sistema:
1. Abrir o navegador com DevTools
2. Ativar `DEBUG_ENABLED = true` em `config.js`
3. Navegar pelas páginas
4. Observar logs no console
5. Verificar envios via WebSocket no Network tab