# syntax=docker/dockerfile:1.7

# ============== Stage 1: build do bundle Vite ==============
FROM node:22-bookworm-slim AS build

ARG VITE_API_URL=http://localhost:5000
ARG VITE_WEBSOCKET_URL=http://localhost:5000
ARG VITE_DEBUG=false

ENV VITE_API_URL=$VITE_API_URL \
    VITE_WEBSOCKET_URL=$VITE_WEBSOCKET_URL \
    VITE_DEBUG=$VITE_DEBUG \
    NODE_ENV=production

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ============== Stage 2: runtime servindo dist/ via nginx ==============
FROM nginx:1.27-alpine AS runtime

RUN rm -rf /usr/share/nginx/html/*
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker-nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
