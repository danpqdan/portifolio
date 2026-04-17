# Documentacao

Esta pasta centraliza a documentacao tecnica do projeto. Novos arquivos `.md` devem ser adicionados aqui, exceto `README.md` e `AGENTS.md` na raiz.

## Indice

- `levantamento-sdk-analytics.md`: estado atual da camada de analytics do frontend e requisitos antes do SDK publico.
- `plano-clientes-ambientes.md`: plano futuro de clientes, separacao de ambientes, buckets e consulta.
- `INTEGRACAO_INFLUXDB_COMPLETA.md`: visao da integracao com InfluxDB.
- `MIGRAÇÃO_INFLUXDB_2.7.md`: notas de migracao para InfluxDB 2.7.
- `CORRECAO_COLETA_TEMPORAL.md`: historico de ajustes na coleta temporal.
- `CORRECAO_DUPLICACAO_TEMPORAL.md`: historico de correcao de duplicacao temporal.
- `CORRECAO_FINAL_DUPLICACAO.md`: consolidacao da correcao de duplicacao.
- `backend/DEPLOY-GUIDE.md`: deploy do backend.
- `backend/INFLUXDB_SCHEMA.md`: schema temporal no InfluxDB.
- `backend/README_TEMPORAL.md`: detalhes da coleta temporal no backend.
- `frontend/COLETA_TEMPORAL_README.md`: detalhes da coleta temporal no frontend.
- `frontend/README.md`: README original do template frontend.

## Manutencao

Ao alterar arquitetura, variaveis de ambiente, schema de dados ou fluxo de deploy, atualize o documento especifico e reflita o fluxo principal no `README.md` da raiz.
