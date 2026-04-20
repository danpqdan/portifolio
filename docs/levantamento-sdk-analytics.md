# Levantamento Atual do SDK de Analytics

## Objetivo

Antes de implementar o SDK publico para terceiros, este documento registra o que existe hoje na camada de analytics do frontend e quais contratos precisam ser estabilizados.

## Componentes atuais

- `frontend/src/sdk/HeatmapUtils.tsx`: coleta dados de paginas, cliques, toques, scroll, movimentos do mouse, hover, exposicao de elementos, visualizacoes e tempo de permanencia.
- `frontend/src/sdk/WebSocketService.tsx`: conecta ao backend via Socket.IO, cria fila em memoria (`pendingData`) e envia eventos `analytics_data`.
- `frontend/src/sdk/index.ts`: ponto de entrada publico do SDK para o frontend consumir e para futuro empacotamento/minificacao.
- `frontend/src/hooks/useHeatmap.tsx`: integra a coleta com componentes React e dispara envios periodicos ou imediatos.
- `frontend/src/classe/ClasseHome.jsx`, `ClasseAbout.jsx`, `ClasseProjects.jsx`: classes especificas por pagina que ainda acoplam coleta ao portfolio atual.

## Contrato de dados atual

O objeto principal segue `HeatmapDados`, com `id_registro`, `timestamp_inicial`, `timestamp_final` e um mapa dinamico `paginas`. Cada entrada de `paginas` representa um `pageId` informado pela aplicacao integradora e usa `PaginaDados` com cliques, toques, scrolls, mouse moves, hover, elementos em exposicao, visualizacoes, segundos e timestamps.

## Contrato tecnico proposto

O contrato publico deve ser definido antes de transformar a coleta em modulo reutilizavel. Esta proposta nao inclui regras de clientes, planos, assinaturas ou autorizacao comercial.

## Organizacao do SDK no frontend

Todo codigo que pertence ao SDK de analytics deve ficar em `frontend/src/sdk/`.

Regras:

- A aplicacao do portfolio deve importar analytics apenas de `frontend/src/sdk`.
- `frontend/src/sdk/index.ts` e o ponto publico para exportacoes do SDK.
- A pasta `frontend/src/sdk` nao deve depender de componentes, paginas, estilos ou classes especificas do portfolio.
- O SDK nao deve conhecer nomes de paginas do portfolio; a aplicacao consumidora informa `pageId`.
- Futuro empacotamento/minificacao deve partir de `frontend/src/sdk/index.ts`, nao de arquivos da UI.

### Inicializacao

Funcao publica implementada em `frontend/src/sdk/iniciarAnalytics.ts`. Deve ser chamada uma unica vez no boot da aplicacao consumidora, antes de instanciar `HeatmapUtils` ou usar `WebSocketService`:

```ts
import { iniciarAnalytics } from './sdk';

iniciarAnalytics({
  websocketUrl: 'http://localhost:5000',
  appId: 'portfolio-local',
  ambiente: 'development',
  debug: true,
  intervaloEnvioMs: 5000,
});
```

Campos:

- `websocketUrl` (obrigatorio): URL do servidor Socket.IO.
- `appId` (obrigatorio): identificador tecnico da aplicacao. Vai no envelope `app_id` de cada emissao. Nao representa cliente comercial.
- `ambiente` (obrigatorio): `'development' | 'test' | 'staging' | 'production'`. Vai no envelope `ambiente` de cada emissao.
- `debug` (opcional, padrao `false`): habilita logs locais de diagnostico.
- `intervaloEnvioMs` (opcional, padrao `5000`): intervalo entre emissoes de delta e drenagem da fila.

A funcao valida os campos obrigatorios e lanca erro se estiverem ausentes. Depois configura o `WebSocketService` singleton e abre a conexao. Chamadas a `WebSocketService.connect()` ou a qualquer `sendAnalyticsData*` antes de `iniciarAnalytics` resultam em no-op (log de aviso quando `debug=true`).

### Semantica do payload: delta por tick

O SDK emite em cada tick (padrao 5s) um *delta* com apenas o que aconteceu desde o ultimo commit. Nao envia o estado acumulado da pagina. Cada emissao representa uma janela fechada `[timestamp_inicial, timestamp_final]` e contem:

- `visualizacoes`: quantidade de novas chamadas a `iniciar()` ocorridas na janela (normalmente 0, ou 1 se a pagina acabou de ser montada);
- `cliques`, `toques`, `scrolls`, `mouseMoves`: apenas os eventos registrados na janela;
- `segundos`: segundos visiveis acumulados na janela (respeita `document.visibilityState`);
- `hover`, `elementosExposicao`: incremento de segundos desde o ultimo commit (chave aparece so com incremento > 0).

Consequencia no backend/InfluxDB: agregacoes `sum()`/`count()` sobre uma janela de tempo retornam contagem correta sem deduplicar, porque cada Point representa um intervalo fechado sem sobreposicao. Dashboards nao precisam usar `last()`/`max()` para somar corretamente.

O encerramento de pagina (`parar()`) dispara uma ultima emissao com o residuo nao coberto pelo tick periodico, de forma que nenhum evento se perde nem se duplica.

### Payload base

Formato alvo para envio pelo evento Socket.IO `analytics_data`:

```json
{
  "schema_version": "1.0",
  "app_id": "portfolio-local",
  "ambiente": "development",
  "id_registro": "uuid-da-sessao-ou-registro",
  "session_id": "uuid-da-sessao",
  "timestamp_inicial": 1760000000000,
  "timestamp_final": 1760000005000,
  "pagina": {
    "page_id": "/",
    "path": "/",
    "title": "Home"
  },
  "eventos": [
    {
      "tipo": "click",
      "timestamp": 1760000001000,
      "x": 120,
      "y": 240,
      "elemento": "botao-contato"
    }
  ],
  "metricas": {
    "visualizacoes": 1,
    "segundos": 5,
    "cliques": 1,
    "scrolls": 0,
    "mouse_moves": 0,
    "toques": 0
  }
}
```

### Campos obrigatorios

- `schema_version`
- `app_id`
- `ambiente`
- `id_registro`
- `session_id`
- `timestamp_inicial`
- `timestamp_final`
- `pagina.page_id`
- `pagina.path`
- `eventos`
- `metricas`

### Campos opcionais

- `pagina.title`
- `evento.elemento`
- `evento.x`
- `evento.y`
- `evento.scrollTop`
- `evento.scrollPercent`
- `evento.duracao_ms`
- `user_agent`, se houver decisao explicita de coleta
- `device_type`, quando derivado localmente sem identificacao sensivel

### Eventos aceitos

O catalogo completo com campos, tipos e justificativa por evento vive em `docs/eventos-analytics-catalogo.md`. Em resumo, os tipos suportados sao:

- Comportamento: `page_view`, `page_exit`, `click`, `touch`, `scroll_depth`, `mouse_move`, `hover`, `element_exposure`.
- Performance: `web_vital` (LCP/CLS/INP via `web-vitals`).
- Negocio: `custom` (via `enviarEvento(nome, propriedades)`).

Cada pagina carrega uma lista unica `eventos: [{ tipo, timestamp, dados }]`, e o contrato nao inclui buckets por tipo no payload.

### Regras de normalizacao

- Eventos brutos do DOM nao devem ser enviados diretamente.
- Cada evento deve passar por normalizador especifico antes de entrar na fila.
- O payload final deve ser montado por funcao de servico, nao por componente React.
- O SDK nao deve aceitar ou inferir paginas predefinidas fora do mapa `paginas`.
- O contrato aceita paginas dinamicas pelo mapa `paginas`; a proxima camada publica deve normalizar isso para `page_id`, `path` e `title`.
- Campos sensiveis ou identificadores pessoais nao devem ser enviados sem decisao explicita e documentada.

### Fila e tolerancia offline

O envio principal continuara via Socket.IO, mas a fila nao deve depender apenas de memoria.

Comportamento esperado:

- Guardar eventos localmente quando o socket estiver desconectado.
- Reenviar eventos pendentes apos reconexao.
- Preservar ordem basica de insercao.
- Definir limite maximo de armazenamento local.
- Descartar eventos antigos de forma previsivel quando o limite for atingido.
- Remover eventos apenas depois de confirmacao de recebimento.

### Resposta esperada do backend

O backend deve responder ao envio por Socket.IO com ack explicito.

Sucesso:

```json
{
  "status": "success",
  "received": true,
  "schema_version": "1.0"
}
```

Erro de validacao:

```json
{
  "status": "error",
  "code": "INVALID_ANALYTICS_PAYLOAD",
  "message": "Payload de analytics invalido",
  "fields": ["session_id", "pagina.page_id"]
}
```

## Testes obrigatorios antes da exposicao publica

- Modelos geradores de dados.
- Normalizadores de eventos.
- Montagem do payload final.
- Fila offline e reenvio apos reconexao.
- `WebSocketService` com socket mockado.
- Handler Socket.IO do backend.
- Validacao de payload valido, invalido e parcial.
- Persistencia no InfluxDB usando mock ou ambiente local controlado.
- Health checks para app, Socket.IO e InfluxDB.

## Pontos antes da integracao publica

- Implementar a funcao clara de inicializacao, por exemplo `iniciarAnalytics(configuracao)`.
- Implementar normalizadores para os eventos aceitos.
- Remover qualquer dependencia de paginas fixas na camada publica de analytics.
- Trocar a fila apenas em memoria por cache local do navegador, porque o envio sera feito por socket e precisa tolerar quedas temporarias.
- Criar testes unitarios para modelos geradores, funcoes de servico, endpoints e contratos de envio.
- Validar o payload no backend antes de gravar no InfluxDB.
