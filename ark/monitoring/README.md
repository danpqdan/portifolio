# Monitoring — Prometheus + Grafana

Stack opt-in de observabilidade. Sobe separada do `docker-compose.yml` do app, com rede propria. O backend expoe metricas em `/metrics` (follow-up do plano backend — quando estiver pronto, aparece automaticamente no Prometheus).

## Componentes

- **Prometheus** — coleta metricas a cada 15s do backend e do node-exporter.
- **Grafana** — provisionamento automatico de datasource Prometheus + InfluxDB.
- **node-exporter** — metricas de host (CPU, memoria, disco).

## Subir local

```bash
make monitoring-up

# interfaces:
# http://localhost:9090   Prometheus
# http://localhost:3001   Grafana (admin / admin na primeira vez — trocar)
```

## Provisionamento

`grafana/provisioning/datasources/` e `grafana/provisioning/dashboards/` sao montados read-only. Alterar datasources ou dashboard base exige edicao nos arquivos e `make monitoring-down && make monitoring-up`.

Dashboard base: `dashboards/analytics-overview.json` — inclui painel de sanidade do backend (latencia de ingestao quando `/metrics` vier, contagem de emits e estado do InfluxDB).

## Producao

- Role Ansible `monitoring` (em `ark/ansible/roles/monitoring/`) usa este mesmo compose — mesmo binario, mesma config.
- Senha do Grafana vem do `GF_SECURITY_ADMIN_PASSWORD` no `.env` real.
- Exponha Grafana atras de Nginx com autenticacao adicional (SSO ou basic auth).
- Ajuste `retention` do Prometheus (`--storage.tsdb.retention.time=15d`) conforme necessidade — 15 dias e o default.
