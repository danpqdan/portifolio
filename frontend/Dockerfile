FROM node:22-bookworm-slim

ARG ANALYTICS_GID=10001

# Adicionar o `node` user (UID 1000, ja existe na imagem oficial) ao grupo
# `analytics` (GID 10001) para compartilhar permissoes em bind-mounts com
# o host.
RUN groupadd --system --gid ${ANALYTICS_GID} analytics \
    && usermod -aG analytics node

WORKDIR /app

COPY --chown=node:analytics package*.json ./
RUN npm ci

COPY --chown=node:analytics . .
RUN chown -R node:analytics /app

USER node

EXPOSE 3000

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
