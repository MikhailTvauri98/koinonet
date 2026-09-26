# Образ PHP (docs/architecture.md, раздел 11): один образ для всех ролей PHP,
# роль задаётся командой запуска.
#
# Цели сборки:
#   base — php-fpm с расширениями и лимитами загрузки, общая часть;
#   prod — продовый образ: код и зависимости без dev-пакетов внутри, opcache
#          без проверки файлов, процессы от www-data. Контекст — корень
#          репозитория (что в него попадает, решает /.dockerignore):
#            docker build -f infra/php/Dockerfile --target prod .
#   dev  — последняя стадия, поэтому собирается по умолчанию: infra/compose.yml
#          собирает её с контекстом infra/php и монтирует код в /app.
# BuildKit собирает только стадии, нужные выбранной цели, так что dev-сборке
# не нужны файлы из корня репозитория, которые копируют prod-стадии.

FROM php:8.4-fpm-alpine AS base

ARG PHPREDIS_VERSION=6.3.0
ARG IMAGICK_VERSION=3.8.1

RUN apk add --no-cache postgresql-dev icu-dev libzip-dev imagemagick imagemagick-dev libheif-dev \
        libpng-dev libjpeg-turbo-dev freetype-dev $PHPIZE_DEPS \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j"$(nproc)" pdo_pgsql pcntl intl bcmath zip exif opcache gd \
    && mkdir -p /usr/src/php/ext/redis /usr/src/php/ext/imagick \
    && wget -q -O - "https://github.com/phpredis/phpredis/archive/refs/tags/${PHPREDIS_VERSION}.tar.gz" \
        | tar -xz --strip-components=1 -C /usr/src/php/ext/redis \
    && wget -q -O - "https://github.com/Imagick/imagick/archive/refs/tags/${IMAGICK_VERSION}.tar.gz" \
        | tar -xz --strip-components=1 -C /usr/src/php/ext/imagick \
    && docker-php-ext-configure redis --disable-redis-lzf \
    && docker-php-ext-install -j"$(nproc)" redis imagick \
    && rm -rf /usr/src/php/ext/redis /usr/src/php/ext/imagick \
    && apk del $PHPIZE_DEPS

RUN printf 'upload_max_filesize = 100M\npost_max_size = 110M\nmemory_limit = 256M\n' \
    > /usr/local/etc/php/conf.d/church.ini

WORKDIR /app

# Зависимости Composer без dev-пакетов. Отдельная стадия, чтобы сам Composer
# не попал в продовый образ. Сначала только composer.json и composer.lock:
# слой с vendor пересобирается, лишь когда меняются зависимости.
FROM base AS prod-vendor

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
COPY apps/api/composer.json apps/api/composer.lock ./
RUN composer install --no-dev --no-scripts --no-autoloader --prefer-dist --no-interaction --no-progress
COPY apps/api ./
# dump-autoload запускает post-autoload-dump (package:discover), которому нужны
# каталоги storage и bootstrap/cache: их нет в контексте сборки.
RUN mkdir -p storage/app/private storage/app/public storage/framework/cache/data \
        storage/framework/sessions storage/framework/views storage/logs bootstrap/cache \
    && composer dump-autoload --no-dev --optimize --no-interaction

FROM base AS prod

# Продовые умолчания PHP (без вывода ошибок), без заголовка X-Powered-By.
# Код в образе не меняется, поэтому opcache не проверяет время изменения файлов.
RUN cp "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini" \
    && printf 'expose_php = Off\nopcache.enable = 1\nopcache.validate_timestamps = 0\nopcache.memory_consumption = 128\nopcache.interned_strings_buffer = 16\nopcache.max_accelerated_files = 20000\n' \
        > "$PHP_INI_DIR/conf.d/prod.ini"

COPY --from=prod-vendor /app /app

# Код принадлежит root и только читается; писать www-data может лишь в storage,
# bootstrap/cache и каталог медиафайлов. /media создаётся пустым и
# принадлежащим www-data (у alpine там лежат cdrom, floppy, usb): Docker
# копирует его владельца в пустой именованный том при первом монтировании,
# поэтому app и worker могут писать в том медиафайлов.
#
# Точка входа собирает кеши конфигурации, маршрутов, событий и представлений
# из окружения каждого контейнера (app, worker, scheduler, разовый
# `docker compose run`): .env живёт только на сервере и приходит переменными
# окружения, поэтому кеш конфигурации нельзя запечь в образ при сборке.
RUN chown -R www-data:www-data storage bootstrap/cache \
    && rm -rf /media && mkdir /media && chown www-data:www-data /media \
    && printf '%s\n' '#!/bin/sh' 'set -e' 'php artisan optimize' 'exec "$@"' > /usr/local/bin/app-entrypoint \
    && chmod 755 /usr/local/bin/app-entrypoint

USER www-data
ENTRYPOINT ["app-entrypoint"]
CMD ["php-fpm"]

# Dev: код монтируется томом (infra/compose.yml), Composer нужен в контейнере.
FROM base AS dev

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

# Том медиафайлов — как в prod: /media пустой и принадлежит www-data, Docker
# копирует его владельца в новый пустой том. Пишут в том процессы www-data:
# рабочие процессы php-fpm (загрузка) и воркер (обработка, compose.yml).
# Том, созданный до этой строки, так не исправится — README, «Dev-окружение».
RUN rm -rf /media && mkdir /media && chown www-data:www-data /media
