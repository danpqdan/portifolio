-- Schema Postgres do banco de autenticacao de usuarios humanos que
-- acessam o dashboard de metricas do cliente (Grafana embedded em
-- /cliente/metricas).
--
-- Separado de schema_postgres.sql porque sao fluxos distintos:
--   - schema_postgres.sql  : auth do SDK de ingest (token publico, write-only)
--   - schema_dashboard_*   : auth humana do dashboard (cookie privado, read-only)
--
-- Referencia: ark/docs/dashboard-cliente.md (desenho e rationale).

CREATE TABLE IF NOT EXISTS clientes_users (
    id              UUID PRIMARY KEY,
    site_id         UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    email           TEXT NOT NULL,          -- app normaliza em lowercase antes de persistir
    senha_hash      TEXT,                   -- NULL quando magic-link only
    papel           TEXT NOT NULL DEFAULT 'viewer' CHECK (papel IN ('admin','viewer')),
    ativo           BOOLEAN NOT NULL DEFAULT true,
    ultimo_login    TIMESTAMPTZ,
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_clientes_users_email ON clientes_users(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_clientes_users_site ON clientes_users(site_id);

CREATE TABLE IF NOT EXISTS clientes_users_sessoes (
    id              UUID PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES clientes_users(id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL UNIQUE,   -- sha256 do cookie, plaintext nunca persiste
    ip              TEXT,
    user_agent      TEXT,
    expira_em       TIMESTAMPTZ NOT NULL,
    revogada_em     TIMESTAMPTZ,
    criada_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clientes_sessoes_user ON clientes_users_sessoes(user_id);
CREATE INDEX IF NOT EXISTS idx_clientes_sessoes_ativas
    ON clientes_users_sessoes(token_hash) WHERE revogada_em IS NULL;

CREATE TABLE IF NOT EXISTS clientes_magic_links (
    id              UUID PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES clientes_users(id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL UNIQUE,   -- sha256 do token enviado por email
    expira_em       TIMESTAMPTZ NOT NULL,   -- 15min apos criacao
    consumido_em    TIMESTAMPTZ,
    ip_solicitacao  TEXT,
    criada_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clientes_magic_user ON clientes_magic_links(user_id);
