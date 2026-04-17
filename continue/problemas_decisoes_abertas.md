# Problemas e Decisões em Aberto

## Resolvido nesta revisão

- `backend/config.py`, `backend/.env`, `backend/.env.example` e `backend/.env.production` foram ajustados para remover tokens reais e operar com variáveis de ambiente locais.
- `frontend/.env.production` foi alinhado ao uso local inicial, sem URL de produção.
- A documentação em `docs/` foi revisada para UTF-8.
- Vitest, React Testing Library, jsdom e setup de testes do frontend foram integrados.
- Comentários antigos com encoding incorreto foram removidos ou substituídos nos arquivos alterados.
- A cobertura inicial do frontend foi ampliada para fluxo de coleta de `HeatmapUtils`.
- `npm audit fix`, `npm update` e atualização de dependências diretas reduziram o audit do frontend para 0 vulnerabilidades.
- `docker-compose.yml` e Dockerfiles locais foram adicionados para execução em containers Linux.

## Problemas ainda abertos

- Docker não está disponível no ambiente Windows atual, então o Compose foi validado por revisão de arquivo e não por `docker compose config`.
- A cobertura do frontend ainda deve avançar para `WebSocketService`, hooks e componentes que integram analytics.

## Decisões registradas

- O projeto opera inicialmente apenas em ambiente local de desenvolvimento.
- O plano multi-cliente será implementado no futuro, mas toda evolução deve preservar separação de ambientes.
- A regra de autenticação, CORS, rate limit e isolamento será definida junto da estratégia de buckets no InfluxDB.
- A API de consulta para terceiros será definida depois; a tendência é usar Grafana com acesso de leitura aos buckets ou views do cliente.
- O SDK público de analytics deve ser precedido por levantamento do estado atual, contrato de inicialização, eventos aceitos e schema público.
- A fila offline do SDK deve usar cache local do navegador, pois o envio principal será por Socket.IO.
- A cobertura mínima deve incluir modelos geradores, funções de serviço e endpoints antes de evoluir novas funcionalidades.

## Documentos relacionados

- `docs/plano-clientes-ambientes.md`
- `docs/levantamento-sdk-analytics.md`
