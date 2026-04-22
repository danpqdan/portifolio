# syntax=docker/dockerfile:1.7

# ============== Stage 1: build do bundle Vite ==============
FROM node:22-bookworm-slim AS build

ARG VITE_API_URL=http://localhost:5000
ARG VITE_WEBSOCKET_URL=http://localhost:5000
ARG VITE_DEBUG=false

WORKDIR /app

COPY package*.json ./
# npm ci com NODE_ENV=production pula devDependencies (incluindo o Vite).
# Instalamos tudo, rodamos o build e so depois setamos o mode de producao.
RUN npm ci --include=dev

COPY . .

ENV VITE_API_URL=$VITE_API_URL \
    VITE_WEBSOCKET_URL=$VITE_WEBSOCKET_URL \
    VITE_DEBUG=$VITE_DEBUG \
    NODE_ENV=production

RUN npm run build

# ============== Stage 2: runtime servindo dist/ via nginx ==============
FROM nginx:1.27-alpine AS runtime

RUN rm -rf /usr/share/nginx/html/*
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker-nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
