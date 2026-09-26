# Внутренняя система церкви

Монорепозиторий внутренней системы одной поместной церкви. API строится на Laravel, клиент — PWA на Nuxt.

## API

Требования: PHP 8.4+, Composer 2, PostgreSQL 17+ и Redis.

```bash
cd apps/api
composer install
cp .env.example .env
php artisan key:generate
```

Команды контроля качества:

```bash
composer lint
composer types
composer test
composer openapi
```

Проверка состояния API доступна по адресу `GET /api/v1/health`.

## Dev-окружение

`make up` поднимает `infra/compose.yml`: `postgres`, `redis`, `app` (php-fpm), `worker` (Horizon) и `web` (nginx на порту 8080). Код API смонтирован в контейнеры томом, команды контроля качества выполняются в `app`: `docker compose -f infra/compose.yml exec -T app composer test`. Клиент запускается на хосте из `apps/web` (`npm run dev`); его dev-сервер проксирует `/api` и `/sanctum` на `NUXT_API_PROXY_TARGET` (по умолчанию `http://localhost:8080`). Сквозные сценарии — `npm run e2e` из `apps/web`, окружение описано в `apps/web/e2e/environment.ts`.

Процессы PHP, которые пишут файлы, работают от `www-data`: рабочие процессы php-fpm в `app` и воркер `worker`, как в production. Новый том медиафайлов получает владельца `www-data` из образа сам. Два случая исправляются вручную, один раз:

- том `infra_media`, созданный до этого правила (в нём лежат каталоги `cdrom`, `floppy`, `usb` от `root`):
  ```bash
  docker compose -f infra/compose.yml exec app chown -R www-data:www-data /media
  ```
- каталоги `storage` и `bootstrap/cache` смонтированного кода, если `www-data` не может в них писать (журнал `storage/logs` пишут и php-fpm, и воркер; так бывает на Docker Desktop под Windows и на Linux, где код принадлежит пользователю хоста):
  ```bash
  docker compose -f infra/compose.yml exec app chmod -R a+rwX storage bootstrap/cache
  ```

Фото и обложки не показываются, если API отдаёт встроенный сервер PHP (`php artisan serve`), как в сквозных тестах: загрузка, обработка и привязка работают, но файл по подписанной ссылке отдаёт только nginx по заголовку `X-Accel-Redirect` (сервис `web` в `infra/compose.yml`, в production — образ `web`), а встроенный сервер этот заголовок не исполняет. Раздачу файлов проверяет чек-лист `docs/deploy.md`.

Архитектура описана в `docs/architecture.md`, словарь проекта — в `CONTEXT.md`, планы фаз — в `docs/plans/phase-1.md` … `docs/plans/phase-4.md`, установка сервера и деплой — в `docs/deploy.md`.
