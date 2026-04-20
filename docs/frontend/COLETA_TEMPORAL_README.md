# Sistema de Coleta Temporal em Tempo Real via WebSocket

## Visao Geral

Este sistema realiza coleta temporal em tempo real do tempo de permanencia em tela e envia dados via WebSocket em intervalos regulares. A camada reutilizavel de analytics fica em `frontend/src/sdk`.

O SDK nao cria chaves predefinidas para paginas. Cada aplicacao consumidora informa seu proprio `pageId`, e os dados sao agrupados no mapa aberto `paginas`.

## Componentes

### `frontend/src/sdk/HeatmapUtils.tsx`

- `configurarColecaoTempoReal()`: configura callback para coleta em tempo real.
- `iniciarColecaoTempoReal()`: inicia coleta temporal automatica.
- `getTempoPermanciaSegundos()`: retorna tempo de permanencia na pagina.
- Controla visibilidade da pagina para pausa e retomada da contagem.
- Agrupa dados por `pageId` dentro de `paginas`.

### `frontend/src/sdk/WebSocketService.tsx`

- Conecta ao backend via Socket.IO.
- Envia eventos `analytics_data`.
- Mantem fila em memoria para dados pendentes.
- `sendAnalyticsDataImmediate()`: envio prioritario ou imediato.
- `setRealtimeInterval()`: configuracao dinamica do intervalo.

### `frontend/src/sdk/index.ts`

Ponto publico de exportacao do SDK. Futuro build minificado deve partir deste arquivo, sem incluir componentes, paginas ou estilos do portfolio.

### `frontend/src/hooks/useHeatmap.tsx`

Integra a aplicacao React atual com o SDK.

## Estrutura de Dados

```json
{
  "analytics_data": {
    "id_registro": "bf87a70e-ea32-48ea-aea4-26be16ebc589",
    "timestamp_inicial": 1759718338444,
    "timestamp_final": 1759718414417,
    "paginas": {
      "/": [
        {
          "visualizacoes": 1,
          "segundos": 76,
          "timestamp_inicial": 1759718338444,
          "timestamp_final": 1759718414417,
          "cliques": []
        }
      ],
      "/about": [],
      "/projects": []
    }
  }
}
```

## Como Usar

```jsx
const { getTempoPermancia, setRealtimeInterval } = useHeatmap('/', '#conteudo', {
  realtimeCollection: true,
  realtimeInterval: 5000,
  debug: true
});

const tempoSegundos = getTempoPermancia();
setRealtimeInterval(3000);
```

## Regras Para Evolucao

- Codigo reutilizavel de analytics deve ficar em `frontend/src/sdk`.
- A UI do portfolio deve consumir o SDK por `frontend/src/sdk/index.ts`.
- O SDK nao deve importar componentes, paginas, estilos ou classes do portfolio.
- O SDK nao deve inferir paginas fixas.
- O build distribuivel e minificado sera definido depois, usando `frontend/src/sdk/index.ts` como entrada.
