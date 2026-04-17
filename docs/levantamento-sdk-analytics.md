# Levantamento Atual do SDK de Analytics

## Objetivo

Antes de implementar o SDK publico para terceiros, este documento registra o que existe hoje na camada de analytics do frontend e quais contratos precisam ser estabilizados.

## Componentes atuais

- `frontend/src/utils/HeatmapUtils.tsx`: coleta dados de paginas, cliques, toques, scroll, movimentos do mouse, hover, exposicao de elementos, visualizacoes e tempo de permanencia.
- `frontend/src/utils/WebSocketService.tsx`: conecta ao backend via Socket.IO, cria fila em memoria (`pendingData`) e envia eventos `analytics_data`.
- `frontend/src/hooks/useHeatmap.tsx`: integra a coleta com componentes React e dispara envios periodicos ou imediatos.
- `frontend/src/classe/ClasseHome.jsx`, `ClasseAbout.jsx`, `ClasseProjects.jsx`: classes especificas por pagina que ainda acoplam coleta ao portfolio atual.

## Contrato de dados atual

O objeto principal segue `HeatmapDados`, com `id_registro`, `timestamp_inicial`, `timestamp_final` e arrays por pagina (`home`, `about`, `projects`). Cada pagina usa `PaginaDados` com cliques, toques, scrolls, mouse moves, hover, elementos em exposicao, visualizacoes, segundos e timestamps.

## Pontos antes da integracao publica

- Definir uma funcao clara de inicializacao, por exemplo `iniciarAnalytics(configuracao)`.
- Definir eventos aceitos e schema publico antes de expor para terceiros.
- Remover acoplamento com paginas fixas `home`, `about` e `projects` ou permitir paginas dinamicas.
- Trocar a fila apenas em memoria por cache local do navegador, porque o envio sera feito por socket e precisa tolerar quedas temporarias.
- Criar testes unitarios para modelos geradores, funcoes de servico, endpoints e contratos de envio.
