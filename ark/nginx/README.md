# Nginx

Proxy reverso do backend Flask+Socket.IO. Responsavel por TLS, cabecalhos de upgrade do WebSocket, encaminhar IP real e aplicar rate limit de borda.

## Arquivos

- `portifolio.conf` — servidor virtual com TLS + upstream do backend.
- `ssl.conf` — hardening de TLS (TLS 1.2+, ciphers modernos, OCSP stapling).

## Deploy

Os arquivos sao instalados em `/etc/nginx/sites-available/` pela role Ansible `nginx` (`ark/ansible/roles/nginx`). Em producao, apontar os certificados Let's Encrypt gerados pelo `certbot`.

## Pontos chave

- **WebSocket**: `proxy_set_header Upgrade` + `Connection "upgrade"` sao obrigatorios para Socket.IO.
- **IP real**: `X-Forwarded-For` e `X-Real-IP` sao passados ao backend. O Flask hoje le `REMOTE_ADDR` direto — com Nginx na frente, considerar configurar `ProxyFix` (anotado como follow-up em `docs/plano-backend.md`).
- **Rate limit de borda**: `limit_req_zone` aplicado antes mesmo do backend, complementando o Flask-Limiter.
- **Admin**: o bloco `/admin/` deveria ficar atras de `allow` de IPs ou VPN, alem do token. Exemplo comentado no conf.
