# Nginx

Proxy reverso publico. Fronteira entre Cloudflare e os containers do stack. Responsavel por TLS com cert do Cloudflare Origin, encaminhamento por hostname, upgrade de WebSocket (Socket.IO) e rate limit de borda.

## Arquivos

- `portifolio.conf` — **referencia historica**. Arquivo real em prod e renderizado pela role Ansible `nginx` a partir de `ark/ansible/roles/nginx/templates/portifolio.conf.j2`. Manter este `.conf` como espelho do template.
- `portifolio.monitoring.conf` — vhosts de Grafana (`grafana.*`) e InfluxDB (`influx.*`).
- `ssl.conf` — snippet de hardening TLS (TLS 1.2+, ciphers modernos). OCSP stapling fica ignorado porque o CF Origin CA nao e publico (warning benigno).

## Deploy

Layout Rocky/RHEL: configs ficam em **`/etc/nginx/conf.d/*.conf`** (nao `sites-available`). Instalacao via role Ansible `nginx` (`ark/ansible/roles/nginx`). O template renderizado substitui o arquivo vivo, e o handler faz reload com `nginx -t` antes.

Cert: **Cloudflare Origin Certificate** em `/etc/ssl/cloudflare-origin/` (ver `ark/docs/servidor-producao.md` secao "TLS"). A task certbot legada na role e no-op por causa de `creates:` apontando pro cert antigo — limpar quando houver janela.

## Topologia de vhosts

```
dsplayground.com.br        → 127.0.0.1:3000   (frontend Vite)
api.dsplayground.com.br    → 127.0.0.1:5000   (backend Flask + Socket.IO)
grafana.dsplayground.com.br → 127.0.0.1:3001
influx.dsplayground.com.br  → 127.0.0.1:8086
```

Todos os upstreams bindam so em loopback no host — o Nginx e o unico caminho publico.

## Pontos chave

- **WebSocket**: `proxy_set_header Upgrade` + `Connection "upgrade"` em todos os vhosts. Socket.IO sobe em `wss://api.dsplayground.com.br/api/socket.io/` (atencao ao prefixo `/api/` — backend monta blueprint com `url_prefix='/api'`).
- **IP real**: `X-Forwarded-For` e `X-Real-IP` sao passados ao backend. Como o trafego passa primeiro pelo CF, o `X-Forwarded-For` ja vem com o IP verdadeiro do cliente injetado pelo CF; o nginx acrescenta o IP do CF em seguida. Considerar `ProxyFix` no Flask + `real_ip_header CF-Connecting-IP` se precisar de IP cliente puro nos logs do backend.
- **Rate limit de borda**: `limit_req_zone analytics_edge 10m rate=20r/s` aplicado no vhost da `api.*` (onde ingestao entra).
- **Client_max_body_size**: `1m` em ambos os vhosts publicos — payload de analytics e pequeno; limita abuso.
- **Admin**: rotas `/admin/*` do backend deveriam ficar atras de `allow` de IPs ou VPN alem do token. Exemplo comentado no `.conf` de referencia.
