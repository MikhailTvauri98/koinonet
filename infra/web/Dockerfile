# Образ web (docs/architecture.md, раздел 11): статика Nuxt за nginx с
# продовой конфигурацией. Контекст — корень репозитория (что в него попадает,
# решает /.dockerignore):
#   docker build -f infra/web/Dockerfile .

FROM node:22-alpine AS build

WORKDIR /web

# Сначала только манифесты зависимостей: слой с node_modules пересобирается,
# лишь когда меняются зависимости. postinstall (`nuxt prepare`) без исходников
# не нужен — `nuxt generate` ниже готовит .nuxt сам.
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci --ignore-scripts

COPY apps/web ./

# Прод — статика `nuxt generate` (раздел 10), не серверная сборка `nuxt build`:
# у той в public/ нет HTML-оболочки, и service worker из неё падает
# (задача 31). verify-sw исполняет собранный sw.js, так что сломанный service
# worker не попадёт в образ.
RUN npm run generate && npm run verify-sw

FROM nginx:alpine

# Шаблон конфигурации получает из окружения только APP_DOMAIN.
ENV NGINX_ENVSUBST_FILTER=^APP_DOMAIN$

# certbot продлевает сертификат в общем томе, а nginx читает сертификат только
# при старте и перезагрузке конфигурации. Скрипт из /docker-entrypoint.d
# образ nginx запускает перед стартом; он оставляет фоновый цикл, который раз
# в 12 часов перечитывает конфигурацию. Процессы certbot и nginx в разных
# контейнерах, поэтому сигнал из хука продления certbot сюда не дошёл бы.
RUN rm /etc/nginx/conf.d/default.conf /usr/share/nginx/html/* \
    && printf '%s\n' '#!/bin/sh' '(while sleep 43200; do nginx -s reload; done) &' \
        > /docker-entrypoint.d/40-reload-certificates.sh \
    && chmod 755 /docker-entrypoint.d/40-reload-certificates.sh

COPY infra/nginx/prod.conf /etc/nginx/templates/church.conf.template
COPY --from=build /web/.output/public /usr/share/nginx/html
