# Testes de Analytics sem Browser

## Objetivo

Validar o contrato de analytics sem depender da pagina web, usando payloads sinteticos conhecidos. Esses testes ajudam a conferir se o backend recebe, resume e transforma os dados corretamente antes de investigar problemas visuais ou de coleta no navegador.

## Fixture canonico

O payload base fica em:

```text
backend/fixtures/analytics_payload_sintetico.json
```

Ele contem duas paginas dinamicas:

- `/`
- `/produto/a`

Resumo esperado:

- `total_visualizacoes`: 3
- `total_cliques`: 3
- `tempo_total_segundos`: 20
- `duracao_sessao_segundos`: 7
- `paginas_visitadas`: `{ "/": 1, "/produto/a": 1 }`

Os scripts atualizam os timestamps antes do envio para simular dado temporal recente.

## Teste interno do backend

Roda o handler Socket.IO com `socketio.test_client`, sem abrir porta externa e sem navegador.

No ambiente local com dependencias instaladas:

```bash
cd backend
python -m unittest test_ingestao_analytics_socketio
```

No Docker Compose/WSL:

```bash
wsl -d Ubuntu -u root -- bash -lc "cd /mnt/d/portifolio && docker compose exec -T backend python -m unittest test_ingestao_analytics_socketio"
```

Esse teste valida:

- conexao Socket.IO
- evento `analytics_data`
- resposta `analytics_received`
- resumo retornado pelo backend
- metricas temporais geradas antes de escrever no InfluxDB

## Cliente sintetico contra backend rodando

Envia o mesmo fixture para `http://localhost:5000` sem abrir a pagina web.

```bash
cd frontend
node scripts/enviar-analytics-sintetico.mjs --url http://localhost:5000
```

Saida esperada:

```text
analytics_received:
...
Resumo recebido bate com o payload sintetico esperado.
```

Esse fluxo usa `socket.io-client` do frontend e valida o backend buildado/containerizado por fora do processo Flask.

## Quando usar

Use estes testes quando:

- a aplicacao esta buildada e os dados parecem inconsistentes;
- for preciso validar o backend sem depender da UI;
- houver mudanca no contrato `paginas`;
- houver mudanca na transformacao para metricas temporais;
- for necessario comparar o que foi enviado com o que o backend resumiu.
