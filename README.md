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

`make up` поднимает `infra/compose.yml`: `postgres`, `redis`, `app` (php-fpm), `worker` (Horizon), `reverb` (WebSocket) и `web` (nginx на порту 8080). Код API смонтирован в контейнеры томом, команды контроля качества выполняются в `app`: `docker compose -f infra/compose.yml exec -T -e DB_DATABASE=church_test -e CACHE_STORE=array app ./vendor/bin/pest`. Клиент запускается на хосте из `apps/web` (`npm run dev`); его dev-сервер проксирует `/api`, `/sanctum`, `/broadcasting` и WebSocket `/app` на `NUXT_API_PROXY_TARGET` (по умолчанию `http://localhost:8080`). Сквозные сценарии — `npm run e2e` из `apps/web`, окружение описано в `apps/web/e2e/environment.ts`.

Для API-тестов нужна отдельная существующая база `church_test`: `RefreshDatabase` очищает выбранную базу. Параметры `DB_DATABASE` и `CACHE_STORE` задаются явно, потому что окружение Compose имеет приоритет над `phpunit.xml`; кеш `array` не переносит настройки между тестами. Прямой запуск Pest также избегает стандартного ограничения Composer в 300 секунд для полного набора.

Обвязка e2e сама поднимает API, настоящий воркер Redis и Reverb (`E2E_API_RUNTIME=docker` локально, `native` в CI). Она проверяет фактическую базу `church_e2e`, выбранные базы Redis 14/15 и соединения очереди/кеша до очистки; dev-база и Redis 0/1 не используются. Публичный источник — `http://127.0.0.1:3010`: небольшой прокси перед Nuxt preview (внутренний порт 3011) передаёт WebSocket `/app/{key}` в Reverb на 8011, остальные запросы — в preview. API публикует через имя контейнера Reverb или `127.0.0.1` при native. При завершении убираются процессы, соединения и только контейнеры с меткой `curchcowork.e2e=true`. Журналы подготовки, API, воркера, Reverb и preview — `apps/web/test-results/server/`.

По умолчанию Playwright использует Chromium (`npx playwright install chromium`). Если он недоступен, локально можно явно выбрать уже установленный браузер: в PowerShell `$env:E2E_BROWSER_CHANNEL='msedge'; npm run e2e`. Без этой переменной CI продолжает использовать свой Chromium. `npm run test:e2e-runtime` отдельно проверяет HTTP, настоящий upgrade, передачу байтов и закрытие сокетов прокси. Сценарии объявлений ждут подтверждённую личную подписку, наблюдают настоящий WebSocket-кадр и живой бейдж; отдельный участник подтверждает доставку очередью перед проверкой отсутствия объявления у постороннего. Service worker в e2e заблокирован: это проверка живых уведомлений, физический пуш на iOS/Android проверяется отдельно.

Процессы PHP, которые пишут файлы, работают от `www-data`: рабочие процессы php-fpm в `app` и воркер `worker`, как в production. Новый том медиафайлов получает владельца `www-data` из образа `app` сам: `web` монтирует его с `nocopy`, иначе образ nginx скопировал бы в пустой том свои каталоги и отдал его корень `root`. Два случая исправляются вручную, один раз:

- том `infra_media`, который уже получил от образа nginx каталоги `cdrom`, `floppy`, `usb` и владельца `root`:
  ```bash
  docker compose -f infra/compose.yml exec app chown -R www-data:www-data /media
  ```
- каталоги `storage` и `bootstrap/cache` смонтированного кода, если `www-data` не может в них писать (журнал `storage/logs` пишут и php-fpm, и воркер; так бывает на Docker Desktop под Windows и на Linux, где код принадлежит пользователю хоста):
  ```bash
  docker compose -f infra/compose.yml exec app chmod -R a+rwX storage bootstrap/cache
  ```

Фото и обложки не показываются, если API отдаёт встроенный сервер PHP (`php artisan serve`), как в сквозных тестах: загрузка, обработка и привязка работают, но файл по подписанной ссылке отдаёт только nginx по заголовку `X-Accel-Redirect` (сервис `web` в `infra/compose.yml`, в production — образ `web`), а встроенный сервер этот заголовок не исполняет. Раздачу файлов проверяет чек-лист `docs/deploy.md`.

Архитектура описана в `docs/architecture.md`, словарь проекта — в `CONTEXT.md`, планы фаз — в `docs/plans/phase-1.md` … `docs/plans/phase-4.md`, установка сервера и деплой — в `docs/deploy.md`.
