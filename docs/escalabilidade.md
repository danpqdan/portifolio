# Escalabilidade — Volumetria, Capacidade e Estratégia de Otimização

## Objetivo

Este documento registra o levantamento atual de capacidade da VPS de producao, o modelo de volumetria do fluxo de ingestao (SDK <-> backend), a projecao de carga comercial suportada pela infraestrutura existente e a ordem recomendada de otimizacao antes de qualquer rewrite ou upgrade de hardware.

A intencao e validar o negocio antes de escalar a infraestrutura: a VPS atual comporta o inicio da operacao comercial, e a decisao de upgrade ou migracao de stack deve ser guiada por dados reais de producao, nao por suposicao.

## Inventario da VPS de producao

Snapshot coletado em 2026-04-21.

| Recurso | Valor | Observacao |
|---|---|---|
| CPU | AMD EPYC 9J45, **1 vCPU** (KVM guest) | Nucleo fisico Zen 5, mas somente 1 vCPU exposta. Sem SMT. BogoMIPS ~5391. |
| RAM | 1.7 GiB total, ~978 MiB disponiveis | Swap 4 GiB com ~393 MiB ja em uso -- sinal de pressao de memoria historica. |
| Disco | 50 GiB (sda2), ~32 GiB livres | Particao unica, sem volume dedicado para InfluxDB. |
| Rede | eth0 publica (/21) | Uma unica interface. |
| OS | Rocky Linux 9.7 (EL9) | Suporte ate 2032-05-31. |
| Load medio | 0.09 / 0.05 / 0.04 | VPS praticamente ociosa no momento da coleta. |

### Consumo atual dos containers

| Container | RAM | CPU | Nota |
|---|---|---|---|
| portifolio-frontend | 133 MiB | 0.54% | Alto para servir estaticos; confirmar se esta em dev server Vite. |
| portifolio-backend | 19.5 MiB | 0% | Baseline ocioso. |
| portifolio-influxdb | 66.7 MiB | 0% | Baseline; cresce com ingestao real. |
| portifolio-grafana | 110 MiB | 0% | Baseline tipica. |
| portifolio-crowdsec | 148.6 MiB | 0% | Custo fixo relevante. |
| portifolio-prometheus | 48.5 MiB | 0% | Baseline. |
| portifolio-node-exporter | 17.4 MiB | 1% | Coleta periodica. |
| **Subtotal containers** | **~544 MiB** | -- | Com nginx host + systemd ≈ 700-750 MiB base. |

Sobra real para picos: **~900 MiB** antes de entrar em swap sustentado.

### Pontos de atencao ja identificados

- **Prometheus e node-exporter expostos em `0.0.0.0`** (portas 9090 e 9100). Todos os outros servicos estao em `127.0.0.1`. Deve ser corrigido para loopback antes de abertura comercial.
- **Frontend container em 133 MiB** e anomalia; se for dev server Vite, a troca para servir estaticos via nginx recupera a memoria inteira.
- **Swap com ~393 MiB ocupado** com carga atual zero indica pico passado. Rodar `dmesg -T | grep -iE "oom|kill"` para investigar.

## Gargalos arquiteturais identificados

1. **CPU e o teto, nao RAM.** Flask + eventlet + Socket.IO sao single-thread em cooperativa. Toda validacao, serializacao e submissao de Point ao InfluxDB disputa o mesmo nucleo.
2. **RAM sem folga para Postgres.** A arquitetura comercial (ver `plano-clientes-ambientes.md`) depende de PostgreSQL para auth/identidade/quota. Postgres 16 baseline ≈ 150-300 MiB. Somado ao crescimento natural do InfluxDB sob carga, a VPS atual nao comporta a arquitetura completa sem upgrade.
3. **1 vCPU = 1 vCPU.** Nenhuma otimizacao de software contorna isso indefinidamente: escalar indefinidamente exige mais CPU, seja via upgrade ou via horizontal scaling.

## Modelo de volumetria — custo de 1 tick

Cada emissao do SDK dispara um round-trip Socket.IO e, no backend, gera 1 a 3 Points no InfluxDB.

Referencias no codigo:
- Cadencia de emissao: `frontend/src/sdk/WebSocketService.tsx:30` (default 5000 ms).
- Lote de drenagem da fila: `WebSocketService.tsx:16` (`LOTE_DRENAGEM = 5`, relevante apos reconexao).
- Fila com storage IndexedDB/localStorage/memoria: `frontend/src/sdk/filaAnalytics.ts:153-169`, max 500 itens.
- Validacao O(n) no backend: `backend/ingestao/validador.py`.
- Escrita em Points: `backend/influxdb_service.py:502-603` (1 Point `page_analytics` por pagina + 1 por `web_vital` + 1 por `custom_event`).

### Tamanho de payload por profile

| Profile | Eventos/tick | JSON bruto | + framing WS | Ack backend | Points InfluxDB |
|---|---|---|---|---|---|
| Idle (5s sem eventos) | 0 | 305 B | ~315 B | ~80 B | 1 |
| Ativo (~10 eventos: click, scroll, mousemove) | 10 | 1.185 B | ~1.2 KB | ~80 B | 2 |
| Burst (~57 eventos, mousemove dominante) | 57 | 4.170 B | ~4.2 KB | ~80 B | 2 |

### Custo por sessao ativa (1 minuto)

Mix realista assumido: 70% idle, 25% ativo, 5% burst. Payload medio ~670 B/tick.

| Metrica | Valor/min | Valor/hora |
|---|---|---|
| Ticks emitidos | 12 | 720 |
| Upload (cliente -> servidor) | ~8 KB | ~480 KB |
| Download (acks) | ~1 KB | ~60 KB |
| Points gerados no InfluxDB | ~17 | ~1.020 |
| Storage apos compressao TSM (~25 B/point) | ~425 B | ~25 KB |

## Projecao de capacidade na VPS atual

### CPU (gargalo dominante)

Custo estimado de CPU por tick (validacao + criacao de Points + submissao ao thread pool):
- Tick idle: ~1.5 ms
- Tick ativo: ~3 ms
- Tick burst: ~8 ms
- **Media ponderada: ~2.5 ms/tick.**

Em 1 vCPU (1000 ms/s disponiveis):

| Sessoes ativas concorrentes | Ticks/s | CPU consumido | % do vCPU | Estado |
|---|---|---|---|---|
| 100 | 20 | 50 ms/s | **5%** | folgado |
| 500 | 100 | 250 ms/s | **25%** | confortavel |
| 1.000 | 200 | 500 ms/s | **50%** | ok, monitorar latencia |
| 2.000 | 400 | 1.000 ms/s | **100%** | saturacao teorica |
| 3.000 | 600 | 1.500 ms/s | >100% | colapso |

**Teto pratico seguro: ~1.200 sessoes concorrentes ativas.** Antes dos 100% teoricos, o eventlet single-thread comeca a degradar latencia de ack.

### RAM

Cada conexao Socket.IO + eventlet + estado em `active_sessions`: ~20-40 KB.

| Concorrentes | RAM conexoes | Total backend (base ~80 MB) |
|---|---|---|
| 100 | ~3 MB | ~85 MB |
| 500 | ~15 MB | ~100 MB |
| 1.000 | ~30 MB | ~115 MB |
| 2.000 | ~60 MB | ~145 MB |

RAM nao e gargalo do backend de ingestao. A restricao de RAM virara problema quando o Postgres entrar na arquitetura.

### Bandwidth

500 sessoes × ~135 B/s (up + down) = **~68 KB/s ≈ 540 kbps**. Irrelevante frente a banda tipica de VPS (1 Gbps).

### Storage InfluxDB (retencao 30 dias, sessao media 20 min)

| Sessoes ativas medias/dia | Session-hours/dia | Points/dia | Storage 30d compactado |
|---|---|---|---|
| 100 | 33 | ~34 mil | ~26 MB |
| 500 | 167 | ~170 mil | ~130 MB |
| 1.000 | 333 | ~340 mil | ~260 MB |
| 5.000 | 1.667 | ~1.7 M | ~1.3 GB |

Disco de 50 GB nao e obstaculo a curto/medio prazo.

## Traducao para capacidade comercial

Limite pratico seguro na VPS atual: **~1.000 sessoes concorrentes ativas**.

Cenarios de tenants (lembrando que sessoes concorrentes ≈ 2-5% do DAU de cada site):

- 10 tenants × 100 sessoes simultaneas medias -> cabe folgado.
- 20 tenants × 50 sessoes simultaneas -> cabe.
- 50 tenants × 20 sessoes simultaneas -> cabe, com atencao a picos.

A VPS atual **suporta o inicio da operacao comercial** em escala de dezenas de tenants pequenos/medios sem upgrade.

## Parametros que ainda precisam ser definidos

Para fechar o modelo e dimensionar precos/planos:

1. **Tamanho do tenant-alvo** (pageviews/dia ou MAU). Converte-se em concorrencia real via taxa de pico (2-5% do DAU).
2. **Retencao contratual do InfluxDB** por plano (7d, 30d, 90d, 1 ano). Impacta storage e retention policy do bucket.
3. **Politica de throttling de mousemove** no SDK. Hoje estimado em ~5/s; subir para 20/s muda a categoria "burst" significativamente.
4. **Compressao WebSocket (`permessage-deflate`)**. Se ligada no nginx + Flask-SocketIO, o bandwidth cai ~70%. Verificar estado atual.

## Estrategia de otimizacao — ordem recomendada

Antes de qualquer rewrite de linguagem ou upgrade de hardware, esgotar as opcoes abaixo, em ordem de custo/beneficio:

### 1. Correcoes imediatas (baixo custo)

- Prender Prometheus e node-exporter em `127.0.0.1`.
- Confirmar que o frontend container serve build estatico via nginx, nao dev server Vite.
- Habilitar `permessage-deflate` no Socket.IO/nginx se ainda nao estiver ativo.

### 2. Otimizacoes Python (ganho tipico 3-5x sem trocar stack)

- Trocar `json` stdlib por **`orjson`** no serializer/deserializer.
- Introduzir **`msgspec`** para validacao de payload (substitui o `validar_payload` manual por schema compilado em C).
- Habilitar **batch de writes no InfluxDB** via `WriteOptions(batch_size=..., flush_interval=...)`.
- Instrumentar **`py-spy record`** em carga sintetica para identificar o hot path real antes de supor.

Expectativa: o mesmo hardware passa a suportar ~3.000-4.000 sessoes concorrentes ativas com essas mudancas.

### 3. Evolucao estrutural em Python (medio custo)

- Migrar **Flask + eventlet** para **FastAPI + uvicorn (asyncio) + python-socketio ASGI**. Mesma linguagem, concorrencia estrutural melhor, ganho adicional 2-3x.
- Introduzir **fila assincrona** (Redis + worker) entre o handler Socket.IO e o InfluxDB: o handler apenas enfileira e da ack, o worker escreve. Libera o loop de ingestao sob picos.

### 4. Horizontal scaling (quando um nó so nao basta)

- Segundo vCPU (upgrade de plano) costuma ser mais barato que qualquer rewrite e entrega ganho linear.
- Multiplas instancias do backend atras do mesmo nginx, com sticky session pelo Socket.IO (sid). Requer replicar `active_sessions` em Redis.

### 5. Rewrite em Go — so quando justificado por dados

Goroutines nao resolvem o gargalo de 1 vCPU (goroutine continua disputando o mesmo nucleo que greenlet). Os ganhos reais do Go sao:

| Custo | Python + eventlet | Go | Ganho pratico |
|---|---|---|---|
| Memoria por conexao | ~8 KB | ~2 KB | 4x (mas RAM nao e gargalo) |
| JSON parse | stdlib lenta | `encoding/json` | 3-5x |
| Validacao do payload | O(n) em Python | O(n) em Go | 5-10x |
| GC pressure | alto | baixo | mensuravel em sustained load |
| I/O pro InfluxDB | async | async | ~igual |

Traducao pratica: throughput por core sobe **2-4x**. Levaria o teto de ~1.200 sessoes para ~3.000-5.000 no mesmo hardware -- aproximadamente o mesmo teto que as otimizacoes Python acima entregam, por uma fracao do esforco.

**Custos escondidos do rewrite:**

- `googollee/go-socket.io` tem manutencao fraca e nao acompanha bem Socket.IO protocol v5. A saida honesta e migrar o SDK frontend para WebSocket puro -- dois rewrites, nao um.
- Toda a suite de testes (`backend/test_*.py`) precisa ser reescrita.
- Ferramentas auxiliares em `backend/scripts/` (validacao de fixture, etc.) tambem.
- Integracao com CrowdSec/nginx/Ansible continua, mas a role de deploy do backend muda.

**Criterio para justificar migracao para Go:**

1. Backend sustentado em >60% CPU de pico apos aplicar todas as otimizacoes Python.
2. Upgrade horizontal (mais vCPU, mais instancias) ja foi tentado ou esta inviavel economicamente.
3. Ha evidencia de que o custo operacional da stack Python supera o custo do rewrite.

Enquanto esses tres nao forem verdadeiros simultaneamente, **nao migrar**.

## Read-path para clientes (Grafana/Prometheus)

Eixo separado da ingestao, nao abordado em detalhe aqui. Em resumo:

- **Dashboard no frontend proprio** consultando a REST (`/analytics/metricas`, etc.) filtrada por `site_id` do token -- mais controle, mais codigo.
- **Grafana multi-tenant** com datasource por cliente (uma org Grafana por tenant, apontando para bucket/tag do cliente) -- melhor custo/beneficio para comecar, requer SSO ou proxy-auth.
- **Prometheus nao serve para analytics por sessao.** Manter Prometheus dedicado a metricas operacionais (backend, InfluxDB, nginx).

O desenho do read-path sera tratado em documento proprio quando entrar em roadmap.

## Criterios de upgrade de VPS

Upgrade de hardware deve ser gatilhado por uma destas condicoes, nao por projecao:

1. Backend sustenta >60% CPU em janela de 15 min de pico, apos aplicar otimizacoes de nivel 1 e 2.
2. Swap em uso >500 MiB de forma sustentada (fora de picos pontuais).
3. Ingressar Postgres na arquitetura com as 1.7 GiB atuais -- upgrade deve preceder essa mudanca.
4. Disco acima de 70% com projecao de retencao do plano contratado.

Meta para abertura comercial escalada (10+ tenants medios): **2-4 vCPU e 4-8 GiB RAM.**

## Documentos relacionados

- `docs/plano-clientes-ambientes.md` -- arquitetura multi-tenant, tokens, isolamento.
- `docs/levantamento-sdk-analytics.md` -- contrato do SDK, payload, cadencia.
- `docs/plano-backend.md` -- itens tecnicos do backend.
- `docs/eventos-analytics-catalogo.md` -- tipos de evento e campos.
- `ark/docs/servidor-producao.md` -- arquitetura da VPS.
