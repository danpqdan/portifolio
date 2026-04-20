# Plano de Evolucao do Backend de Analytics

## Objetivo

O backend hoje funciona como prova de conceito: recebe payloads do SDK via Socket.IO, valida, agrega por tipo de evento e persiste no InfluxDB 2.7. Para se tornar base de produto (open source primeiro, comercial depois), faltam tres blocos: API de consulta, conformidade LGPD e capricho operacional. Este plano mapeia os gaps, prioriza e define criterios de aceite.

Plano anterior (`docs/plano-atualizacao-analytics.md`) esta todo concluido e cuidou do contrato, normalizacao, fila offline, ingestao e empacotamento do SDK. O foco agora e tudo que vive depois de `persistido_temporal`.

## Estado atual

- Contrato: payload com `id_registro`, `timestamp_*`, `paginas[pageId][0].eventos`. Envelope carrega `app_id` e `ambiente` (ainda nao validados pelo backend).
- Camada de ingestao: `backend/ingestao/validador.py` + `backend/ingestao/servico_ingestao.py`, ack estruturado, logs por estagio.
- Persistencia: `page_analytics` (agregado por evento) + `web_vitals` (um Point por metrica).
- Resiliencia: erro de InfluxDB e engolido sem derrubar a ingestao; reinicio perde `active_sessions` e caches em memoria.
- Consulta: apenas `query_realtime_metrics` internamente (sem endpoint REST exposto). Dashboards ficam com acesso direto ao InfluxDB.
- Saude: `/health/app`, `/health/socketio`, `/health/influxdb` cobrem os tres estados (saudavel, degradado, indisponivel).
- Testes: 37 passando (validador, servico, ingestao socketio, dados dinamicos, sanidade). `test_final.py`, `test_service.py`, `test_influxdb.py` e `test_queries.py` sao do esquema antigo e estao quebrados.

## Gaps identificados

Dividi em quatro frentes. Cada item vira um checkbox com criterio de aceite executavel.

### Frente A — Dividas imediatas (inconsistencias ja no codigo)

- [x] **A.1** Queries agregadas reescritas em `backend/influxdb_service.py` para usar `sum()` em contadores (`query_metricas_agregadas`, `query_custom_events`). Ver `docs/backend/INFLUXDB_SCHEMA.md`.
- [x] **A.2** `write_navigation_event` e `write_session_summary` removidos.
- [x] **A.3** `test_final.py`, `test_service.py`, `test_influxdb.py` e `test_queries.py` removidos (eram scripts diagnosticos do schema antigo).
- [x] **A.4** Decisao: `active_sessions` e `temporal_stats_cache` seguem em memoria. A perda no reinicio e aceitavel enquanto o projeto for single-instance. Persistencia (Redis) entra so no plano multi-cliente.
- [x] **A.5** `SafeRotatingFileHandler` com 10 MB por arquivo e 5 backups aplicado em `backend/app.py`.

### Frente B — API de consulta (valor imediato)

Hoje o backend so escreve. Dashboards precisam ler, mas o unico caminho e acesso direto ao InfluxDB. Expor endpoints REST desacopla o consumidor do schema.

- [x] **B.1** `GET /analytics/metricas` com filtros `app_id`, `ambiente`, `page_type`, `inicio`, `fim`, `limit`. Implementado em `backend/app.py`, teste em `test_api_consulta.py`.
- [x] **B.2** `GET /analytics/web-vitals` com mesmos filtros + `nome`. Cliente pode calcular percentis; query retorna os pontos ja filtrados. Limite configuravel.
- [x] **B.3** `GET /analytics/custom-events` com filtros + `nome`. Retorna soma de ocorrencias por (nome, page_type).
- [x] **B.4** `custom_events` agora sao persistidos em measurement proprio (`create_custom_events_from_heatmap` + `write_custom_event_async`). Nome e propriedades primitivas ficam queryaveis.
- [x] **B.5** `limit` configuravel (default 100, teto 1000) em todos os endpoints. Teste cobre default e teto.
- [x] **B.6** `docs/backend/api-consulta.md` publicado com exemplos curl.

### Frente C — Conformidade LGPD

Prometido no README do SDK. Sem isso, o ciclo "revogar consentimento" nao fecha.

- [x] **C.1** `GET /admin/analytics/sessao/<session_id>` implementado (`consultar_por_session_id` em `InfluxDBService` varre os 3 measurements).
- [x] **C.2** `DELETE /admin/analytics/sessao/<session_id>` implementado via InfluxDB Delete API em `apagar_por_session_id`.
- [x] **C.3** Auth via `Authorization: Bearer $ADMIN_API_TOKEN`. Sem token → 401. Testes cobrem ausencia, token errado e aceite.
- [x] **C.4** Linha `[ADMIN-AUDIT] acao=... session_id=... resultado=... ip=... timestamp=...` gravada em `security.log` a cada chamada admin (sucesso e falha).
- [x] **C.5** `backend/scripts/configurar_retencao.py` aplica retention policy via CLI (`--dias N`).
- [x] **C.6** `user_agent` agora e field em `page_analytics`, `web_vitals` e `custom_events`. Schema atualizado em `docs/backend/INFLUXDB_SCHEMA.md`.

### Frente D — Observabilidade e deploy

- [x] **D.1** Logs estruturados `evento=...` aplicados em `connect`, `disconnect`, `security_middleware` (bloqueio por atividade suspeita) + `backpressure` quando fila do executor > 50 itens.
- [ ] **D.2** Endpoint `/metrics` Prometheus no backend Flask — follow-up. A stack de scrape ja esta pronta em `ark/monitoring/` (Prometheus + Grafana com datasource InfluxDB + dashboard inicial); basta adicionar `prometheus-client` ao backend e registrar as metricas.
- [x] **D.3** `fila_pendente()` exposto em `InfluxDBService`; servico de ingestao emite log `evento=backpressure` quando ultrapassa 50 itens na fila. Rejeicao dura fica para quando tivermos metrica de latencia.
- [x] **D.4** `docs/backend/DEPLOY-GUIDE.md` ganhou secoes "Producao com Docker + Gunicorn + Nginx", variaveis obrigatorias, observabilidade em producao e endpoints publicos/admin.
- [x] **D.5** Dockerfile de producao esbocado em `docs/backend/DEPLOY-GUIDE.md`. Provisionamento ponta-a-ponta (Docker + Nginx + Certbot + CrowdSec + monitoring) coberto pelos roles Ansible em `ark/ansible/roles/`.
- [x] **D.6** Secao "Backup e Restore do InfluxDB" com comandos `influx backup`/`influx restore` em `docs/backend/DEPLOY-GUIDE.md`.

### Frente E — Multi-cliente (bloqueada pelo plano separado)

Os itens abaixo dependem do `docs/plano-clientes-ambientes.md` definir o modelo (bucket por cliente vs tags). Documentados aqui apenas para referencia; nao comecar antes daquela decisao.

- [ ] **E.1** Validar `app_id` contra allowlist/config. Rejeitar payload com `app_id` desconhecido.
- [ ] **E.2** Token de cliente no handshake Socket.IO (`auth` handshake) + renovacao.
- [ ] **E.3** Rate limit por `app_id` + por `ambiente`.
- [ ] **E.4** Isolamento de dados por `app_id` (seja por bucket seja por tag obrigatoria em todo query).
- [ ] **E.5** CORS configuravel por cliente.
- [ ] **E.6** Schema versioning (`schema_version` no envelope) + politica de depreciacao.

## Priorizacao sugerida

Duas ordens possiveis. Escolha uma antes de iniciar.

### Ordem "open source completo primeiro"

Entrega ficaria apta para uso real por outros devs antes de pensar em comercial.

1. Frente A (dividas imediatas) — uma semana.
2. Frente B (API de consulta) — uma a duas semanas.
3. Frente C (LGPD) — uma semana.
4. Frente D (deploy/observabilidade) — conforme demanda real.
5. Frente E — somente quando o plano multi-cliente for aprovado.

### Ordem "resiliencia operacional primeiro"

Entrega estabiliza o que existe antes de expandir superficie.

1. Frente A + D.3 + A.5 — robustez e observacao da ingestao atual.
2. Frente D.1/D.2/D.4 — producao pronta mesmo sem API publica.
3. Frente C — conformidade antes de crescer.
4. Frente B — so quando houver consumidores claros.
5. Frente E — idem acima.

## Fora de escopo

- Dashboards prontos (responsabilidade do integrador ou Grafana externo).
- Redis/backing store para sessoes — so entra se A.4 decidir pela persistencia.
- Auth multi-tenant completa — esta em Frente E, bloqueada por decisao de arquitetura.
- Migracoes de schema InfluxDB — considerar quando algum measurement precisar ganhar ou perder tag.

## Documentos relacionados

- `docs/plano-clientes-ambientes.md` — pre-requisito para Frente E.
- `docs/plano-atualizacao-analytics.md` — todos os 12 itens concluidos; contexto de como chegamos aqui.
- `docs/backend/INFLUXDB_SCHEMA.md` — precisa ser atualizado (esta com nomes antigos de measurement/tag).
- `docs/backend/DEPLOY-GUIDE.md` — alvo da Frente D.
- `docs/eventos-analytics-catalogo.md` — contrato de eventos que a API de consulta deve espelhar.
- `frontend/src/sdk/README.md` — secao LGPD descreve o ciclo que a Frente C precisa fechar.
