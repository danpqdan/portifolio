FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Group GID 10001 deve bater com o grupo `analytics` do host (criado pela
# role base do Ansible). Bind-mounts ficam compartilhados via grupo.
ARG ANALYTICS_GID=10001
ARG APP_UID=10001

RUN groupadd --system --gid ${ANALYTICS_GID} analytics \
    && useradd  --system --uid ${APP_UID} --gid analytics --create-home \
                --shell /usr/sbin/nologin --comment "portifolio backend" app

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY --chown=app:analytics requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

COPY --chown=app:analytics . .

# security.log e demais writes vao para `/app/`. Garantir que o user app pode
# escrever; em producao, prefira volume nomeado ou stdout via syslog driver.
RUN install -d -o app -g analytics -m 2770 /app

USER app:analytics

EXPOSE 5000

CMD ["python", "app.py"]
