# Plano Futuro de Clientes e Ambientes

## Objetivo

A plataforma devera evoluir de um analytics local do portfolio para um servico multi-cliente. Cada cliente assinante devera conseguir enviar dados de navegacao de suas paginas e consultar apenas os dados do seu proprio ambiente.

## Regra atual

Neste momento o projeto opera somente em ambiente local de desenvolvimento. Mesmo assim, toda nova configuracao deve manter separacao clara por ambiente para evitar misturar dados de desenvolvimento, testes, homologacao e producao futura.

## Separacao de ambientes

- Desenvolvimento local: usar `backend/.env`, `frontend/.env.development` e bucket local como `portifolio_dev`.
- Testes automatizados: usar configuracao propria e dados descartaveis.
- Producao futura: exigir variaveis de ambiente separadas, segredo proprio e credenciais de InfluxDB fora do repositorio.

## Modelo multi-cliente futuro

A definicao final sera feita junto com a estrategia de buckets. As opcoes a avaliar sao:

- bucket por cliente, com retencao e permissao individual;
- bucket por plano, usando tags para `cliente_id` e `ambiente`;
- bucket unico por ambiente com isolamento por tags e tokens restritos.

A autenticacao dos clientes assinantes, assinatura de eventos, CORS permitido e rate limit por plano devem ser definidos junto dessa regra de isolamento.

## Consulta dos dados

A API de consulta para terceiros ainda sera definida. A tendencia atual e usar Grafana para dar acesso de leitura aos buckets ou views de cada cliente, com filtros por pagina, sessao, periodo e evento.
