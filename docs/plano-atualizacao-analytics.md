# Plano de Atualizacao da Camada de Analytics

## Objetivo

Este plano organiza as proximas implementacoes da camada de analytics sem incluir regras de clientes, assinaturas, isolamento comercial, buckets por cliente ou autorizacao por plano.

A direcao e manter o projeto testavel como servico open source local e, ao mesmo tempo, evitar acoplamentos que dificultem uma futura comercializacao. Toda nova funcionalidade deve ser acompanhada por testes antes ou junto da implementacao.

## Estado do ambiente local

- O ambiente containerizado foi validado via WSL com a distro Ubuntu.
- `frontend`, `backend` e `influxdb` sobem com `docker compose`.
- O frontend foi acessado localmente em `http://localhost:3000`.
- O backend foi acessado localmente em `http://localhost:5000`.
- O InfluxDB subiu e respondeu em `http://localhost:8086`, mas as credenciais de acesso ao painel ainda nao estao confirmadas.
- A correcao de `Blueprint` em `backend/app.py` deve permanecer aplicada, importando `Blueprint` no topo do arquivo para funcionar em desenvolvimento e producao.
- A permissao do usuario WSL `daniel` no grupo `docker` ainda nao foi aplicada. Enquanto isso, os comandos Docker no WSL podem exigir `-u root`.

## Progresso atual

- A documentacao operacional foi atualizada em `continue/problemas_decisoes_abertas.md`.
- A correcao de `Blueprint` em `backend/app.py` foi aplicada.
- `WebSocketService` recebeu cobertura inicial com socket mockado para conexao, envio de `analytics_data`, fila pendente e fallback de envio prioritario.
- `docs/levantamento-sdk-analytics.md` foi expandido com contrato tecnico proposto, eventos aceitos, payload base, resposta esperada do backend e testes obrigatorios.
- `HeatmapUtils` recebeu suporte a paginas dinamicas via mapa `paginas`, sem chaves predefinidas.
- O backend passou a converter `paginas` dinamicas em `HeatmapDados`, resposta resumida e metricas temporais para InfluxDB.
- O codigo reutilizavel do analytics foi movido para `frontend/src/sdk`, com `frontend/src/sdk/index.ts` como ponto publico de exportacao.
- Foram adicionados fixture e testes sinteticos de analytics sem browser para validar recebimento Socket.IO e resumo de metricas.

## Checklist de progresso

- [x] Atualizar documentacao operacional.
- [x] Criar testes minimos de sanidade do backend (`backend/test_sanidade.py`, health endpoints `/health/app`, `/health/socketio`, `/health/influxdb`).
- [x] Cobrir `WebSocketService` no frontend.
- [x] Formalizar o contrato tecnico de analytics.
- [x] Desacoplar analytics das paginas fixas do portfolio.
  - [x] Aceitar paginas dinamicas no frontend via mapa `paginas`.
  - [x] Remover aliases e chaves predefinidas do contrato de analytics.
  - [x] Criar testes de transformacao e coleta para paginas dinamicas.
  - [x] Garantir processamento de paginas dinamicas no backend.
- [x] Separar codigo reutilizavel do SDK em `frontend/src/sdk`.
- [x] Criar fixture e cliente sintetico para testar analytics sem abrir a pagina web.
- [x] Implementar funcao publica `iniciarAnalytics(config)` e remover dependencia de `../config.js` dentro do SDK.
- [x] Mudar contrato de envio para delta por tick (semantica aditiva em InfluxDB).
- [x] Criar camada de normalizacao de eventos + lista unica de eventos por pagina + Web Vitals + `enviarEvento` para eventos customizados. Catalogo em `docs/eventos-analytics-catalogo.md`.
- [x] Validar payloads no backend (`backend/ingestao/validador.py` + ack estruturado).
- [x] Separar handler Socket.IO da regra de ingestao (`backend/ingestao/servico_ingestao.py`).
- [x] Implementar fila offline persistente (`frontend/src/sdk/filaAnalytics.ts` com IndexedDB + fallback localStorage, limite FIFO, `limparFilaOffline` para LGPD).
- [x] Criar fixtures e dados de exemplo (`backend/fixtures/analytics_payload_invalido.json` + CLI `backend/scripts/validar_fixture.py`).
- [x] Padronizar observabilidade local (logs estruturados `evento=...` em `backend/ingestao/logs.py` + health separado por camada).
- [x] Atualizar README com fluxo real de teste (Docker/WSL, health checks, testes, CLI de validacao).
- [x] Empacotar SDK para distribuicao minificada (`npm run build:sdk` gera `dist/sdk/` com ESM+CJS+types; smoke test em `scripts/smoke-sdk-bundle.mjs`).

## Ordem de implementacao

### 1. Atualizar documentacao operacional

Atualizar os documentos que descrevem o estado atual do ambiente.

Entregas:

- Marcar o Compose como validado via WSL.
- Registrar que frontend, backend e InfluxDB sobem com `docker compose`.
- Registrar que frontend e backend foram acessados localmente com sucesso.
- Registrar que o InfluxDB subiu, mas as credenciais do painel ainda precisam ser confirmadas.
- Registrar que a correcao de `Blueprint` em `backend/app.py` deve estar aplicada.
- Manter como pendencia a permissao do usuario `daniel` no grupo `docker`.

### 2. Criar testes minimos de sanidade do backend

Garantir que o backend responde corretamente em ambiente local e em container.

Entregas:

- Teste para endpoint raiz ou health da aplicacao Flask.
- Teste para health do InfluxDB quando disponivel.
- Teste com `INFLUXDB_ENABLED=false`.
- Teste com `INFLUXDB_ENABLED=true` usando mock do servico de InfluxDB.
- Teste para garantir que erro de dependencia externa nao derruba o backend.

### 3. Cobrir `WebSocketService` no frontend

Adicionar testes para a camada de envio por Socket.IO, pois ela sera base para a futura abstracao reutilizavel.

Entregas:

- Teste de conexao usando a URL configurada.
- Teste de envio do evento `analytics_data`.
- Teste de retencao de eventos quando o socket estiver desconectado.
- Teste de reenvio de fila pendente apos reconexao.
- Teste para evitar envio de payload invalido.
- Teste para comportamento em erro temporario de rede.

### 4. Formalizar o contrato tecnico de analytics

Expandir `docs/levantamento-sdk-analytics.md` com o contrato tecnico esperado, sem regras comerciais.

Entregas:

- Definir funcao publica prevista, por exemplo `iniciarAnalytics(configuracao)`.
- Documentar eventos aceitos inicialmente.
- Documentar schema do payload enviado.
- Separar campos obrigatorios e opcionais.
- Documentar comportamento offline e estrategia de retry.
- Incluir exemplos de payload valido e invalido.

### 5. Desacoplar analytics de paginas fixas

Remover a dependencia de qualquer pagina fixa na camada de coleta.

Entregas:

- Aceitar paginas dinamicas via `pageId`, `pagePath`, `pageTitle` ou estrutura equivalente.
- Nao aceitar aliases ou chaves predefinidas fora do mapa `paginas`.
- Criar testes de transformacao para paginas dinamicas.
- Garantir que o backend consiga processar paginas dinamicas sem alterar regras comerciais.

### 6. Criar camada de normalizacao de eventos

Separar eventos brutos do navegador do payload final enviado ao backend.

Entregas:

- Funcao para normalizar clique.
- Funcao para normalizar scroll.
- Funcao para normalizar visualizacao de pagina.
- Funcao para montar payload de analytics.
- Testes para cada normalizador.
- Teste para garantir que campos sensiveis nao sejam enviados sem decisao explicita.

### 6.1. Preparar empacotamento futuro do SDK

Preparar o SDK para futura distribuicao minificada sem misturar a UI do portfolio.

Entregas:

- Manter `frontend/src/sdk/index.ts` como unico ponto publico do SDK.
- Criar build de biblioteca separado do build da aplicacao.
- Gerar bundle minificado do SDK sem componentes, paginas ou estilos do portfolio.
- Documentar variaveis publicas necessarias para consumo externo.
- Testar que o bundle do SDK consegue inicializar coleta e enviar dados usando ambiente local.

### 7. Implementar fila offline persistente

Substituir ou complementar a fila em memoria por armazenamento local tolerante a queda temporaria de conexao.

Entregas:

- Criar uma camada `FilaAnalytics` ou equivalente.
- Persistir eventos em `localStorage` ou `IndexedDB`.
- Definir limite maximo de eventos armazenados.
- Descartar eventos antigos de forma previsivel.
- Remover eventos apos confirmacao de envio.
- Testar reload, reconexao, limite da fila e preservacao basica de ordem.

### 8. Validar payloads no backend

O backend deve rejeitar payloads invalidos sem quebrar a conexao ou aceitar dados inconsistentes.

Entregas:

- DTO ou schema claro para payload de analytics.
- Validacao de campos obrigatorios.
- Validacao de tipos.
- Rejeicao controlada de payloads invalidos.
- Ack de sucesso ou erro no Socket.IO.
- Testes para payload valido, invalido, parcial e com campos desconhecidos.

### 9. Separar handler Socket.IO da regra de ingestao

Reduzir o acoplamento entre transporte WebSocket, transformacao e persistencia.

Fluxo desejado:

```text
Socket.IO handler
  -> validar payload
  -> chamar servico de ingestao
  -> transformar em metricas temporais
  -> persistir via InfluxDBService
```

Entregas:

- Criar servico de ingestao testavel.
- Deixar handler Socket.IO fino.
- Testar servico sem precisar abrir socket real.
- Testar handler apenas como camada de entrada e resposta.

### 10. Criar fixtures e dados de exemplo

Facilitar validacao local por qualquer pessoa que rode o projeto como open source.

Entregas:

- Payload valido de exemplo.
- Payload invalido de exemplo.
- Script simples para emitir evento local de analytics.
- Instrucao para verificar dados enviados ao backend.
- Instrucao para conferir gravacao no InfluxDB quando as credenciais estiverem definidas.

### 11. Padronizar observabilidade local

Melhorar diagnostico em desenvolvimento e em container.

Entregas:

- Logs estruturados para evento recebido, validado, persistido e rejeitado.
- Health separado para aplicacao Flask, Socket.IO e InfluxDB.
- Mensagens claras quando o InfluxDB estiver desabilitado ou inacessivel.
- Testes para estados saudavel, degradado e indisponivel.

### 12. Atualizar README com fluxo real de teste

Consolidar no `README.md` o fluxo que ja foi validado.

Entregas:

- Comandos Docker via WSL no Windows.
- URLs esperadas dos servicos.
- Comandos para parar containers.
- Comandos para limpar volumes locais quando for necessario reiniciar o InfluxDB.
- Sequencia de testes backend e frontend.

## Prioridade curta

1. Atualizar `continue/problemas_decisoes_abertas.md`.
2. Adicionar testes para `WebSocketService`.
3. Formalizar o contrato tecnico em `docs/levantamento-sdk-analytics.md`.
4. Desacoplar paginas fixas do contrato de analytics.
5. Implementar fila offline persistente.
6. Validar payload no backend com testes.
7. Separar handler Socket.IO de servico de ingestao.
8. Atualizar `README.md` com execucao real via Docker e WSL.

## Proximo plano

Os 12 itens deste plano estao concluidos. A continuacao — evolucao do backend com API de consulta, LGPD end-to-end, observabilidade e deploy — vive em [`docs/plano-backend.md`](./plano-backend.md).
