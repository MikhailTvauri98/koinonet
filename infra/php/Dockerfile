FROM php:8.4-fpm-alpine

ARG PHPREDIS_VERSION=6.3.0
ARG IMAGICK_VERSION=3.8.1

RUN apk add --no-cache postgresql-dev icu-dev libzip-dev imagemagick imagemagick-dev libheif-dev $PHPIZE_DEPS \
    && docker-php-ext-install -j"$(nproc)" pdo_pgsql pcntl intl bcmath zip exif opcache \
    && mkdir -p /usr/src/php/ext/redis /usr/src/php/ext/imagick \
    && wget -q -O - "https://github.com/phpredis/phpredis/archive/refs/tags/${PHPREDIS_VERSION}.tar.gz" \
        | tar -xz --strip-components=1 -C /usr/src/php/ext/redis \
    && wget -q -O - "https://github.com/Imagick/imagick/archive/refs/tags/${IMAGICK_VERSION}.tar.gz" \
        | tar -xz --strip-components=1 -C /usr/src/php/ext/imagick \
    && docker-php-ext-configure redis --disable-redis-lzf \
    && docker-php-ext-install -j"$(nproc)" redis imagick \
    && rm -rf /usr/src/php/ext/redis /usr/src/php/ext/imagick \
    && apk del $PHPIZE_DEPS

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

RUN printf 'upload_max_filesize = 100M\npost_max_size = 110M\nmemory_limit = 256M\n' \
    > /usr/local/etc/php/conf.d/church.ini

WORKDIR /app
