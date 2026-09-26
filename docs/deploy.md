# Деплой

Как система выкладывается на продовый сервер и как поднять её с нуля на новом сервере. Устройство контура описано в `docs/architecture.md`, раздел 11.

## Как устроено

Сервер — один Linux-хост x86_64 с Docker Engine и плагином Compose. Всё, что относится к системе, лежит в `/srv/church`:

- `compose.prod.yml` и `deploy.sh` — копии `infra/compose.prod.yml` и `infra/deploy.sh`, деплой обновляет их при каждом пуше;
- `.env` — секреты и настройки. Его создаёт человек при установке, в репозитории его нет.

Образы собирает GitHub Actions и публикует в GHCR с тегом, равным коммиту:

- `app` (`infra/php/Dockerfile`, цель `prod`) — PHP с кодом и зависимостями внутри. Один образ для трёх сервисов: `app` (php-fpm), `worker` (Horizon), `scheduler` (планировщик). При старте каждый контейнер собирает кеши конфигурации, маршрутов и событий из своего окружения.
- `web` (`infra/web/Dockerfile`) — nginx со статикой `nuxt generate` и конфигурацией `infra/nginx/prod.conf`. Сборка падает, если собранный service worker не исполняется (`npm run verify-sw`).

Образы собираются под linux/amd64, поэтому сервер нужен x86_64.

Сервисы `compose.prod.yml`: `web` (порты 80 и 443), `app`, `worker`, `scheduler`, `postgres`, `redis`, `certbot`. Данные живут в именованных томах проекта `church` (имя каталога): `church_pgdata`, `church_redisdata`, `church_media`, `church_letsencrypt`, `church_certbot-www`. Команда `docker compose down -v` удаляет эти тома вместе с базой и медиафайлами; на сервере её не выполнять.

### Что делает пуш в `main`

`.github/workflows/deploy.yml`:

1. Собирает и публикует образы `app` и `web`.
2. Копирует `compose.prod.yml` и `deploy.sh` в `/srv/church` по SSH. SSH и scp — из образа раннера, ключ хоста сверяется с секретом `DEPLOY_KNOWN_HOSTS`.
3. Логинит Docker сервера в GHCR токеном этого запуска (`GITHUB_TOKEN`) и разлогинивает после выкладки. Постоянного пароля от GHCR на сервере нет.
4. Запускает `TAG=<коммит> sh /srv/church/deploy.sh`:
   - `docker compose pull`;
   - `php artisan migrate --force` разовым контейнером нового образа, до переключения;
   - `docker compose up -d --remove-orphans` — пересоздаёт контейнеры с новым тегом;
   - записывает `TAG=<коммит>` в `.env`, чтобы ручные команды `docker compose` брали выложенную версию.

Пересоздание контейнеров заменяет и сброс кешей, и `horizon:terminate`. Контейнеры PHP новые и собирают кеши при старте. Старый Horizon Docker останавливает сигналом SIGTERM, тем же, что посылает `horizon:terminate`: Horizon доделывает текущие задачи и выходит, новый стартует на новом образе.

Простой длится, пока пересоздаются контейнеры: при локальной проверке на Docker Desktop — от одной до двенадцати секунд. Дольше всего останавливается `web`: nginx дожидается запросов, которые успели уйти в уже остановленный `app`.

Миграции идут до переключения, поэтому новый код никогда не работает со старой схемой. Старый код несколько секунд работает с новой схемой. Миграция, которая ломает предыдущую версию кода (удаление или переименование столбца, который тот читает), делится на два деплоя: сначала код перестаёт использовать столбец, следующим деплоем столбец удаляется.

## Первая установка

### 1. Сервер

- Linux x86_64, Docker Engine и плагин Compose v2: `docker compose version` отвечает.
- Пользователь для деплоя, например `deploy`, в группе `docker`. Членство в этой группе равно правам root на сервере.
- Открыты порты 22, 80 и 443.
- Запись A домена (и AAAA, если у сервера есть IPv6) указывает на сервер.

### 2. Ключ SSH для деплоя

На своём компьютере создать ключ:

```bash
ssh-keygen -t ed25519 -N '' -C church-deploy -f church-deploy
```

Публичный ключ `church-deploy.pub` добавить в `~deploy/.ssh/authorized_keys` на сервере. Закрытый ключ `church-deploy` понадобится для секрета `DEPLOY_KEY` на шаге 4, после этого его удалить с компьютера.

Ключ хоста сервера для секрета `DEPLOY_KNOWN_HOSTS`:

```bash
ssh-keyscan -t ed25519 <адрес сервера> > known_hosts
ssh-keygen -lf known_hosts
```

Отпечаток из вывода сверить с отпечатком на самом сервере — `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` через консоль хостинга. Если не совпадает, между вами и сервером кто-то есть: дальше не идти.

### 3. Каталог и `.env`

На сервере под пользователем `deploy`:

```bash
sudo mkdir -p /srv/church
sudo chown deploy: /srv/church
cd /srv/church
touch .env
chmod 600 .env
```

Сгенерировать ключ приложения и пароль базы:

```bash
echo "base64:$(openssl rand -base64 32)"
openssl rand -hex 32
```

Записать в `.env`, заменив домен, владельца и репозиторий на свои и вписав сгенерированные значения в `APP_KEY` и `DB_PASSWORD`:

```dotenv
# Подстановки в compose.prod.yml.
# IMAGE_PREFIX — ghcr.io/<владелец>/<репозиторий> строчными буквами.
IMAGE_PREFIX=ghcr.io/owner/repository
APP_DOMAIN=church.example.org
# TAG записывает деплой.
TAG=

APP_ENV=production
APP_DEBUG=false
APP_KEY=
APP_URL=https://church.example.org
FRONTEND_URL=https://church.example.org
LOG_CHANNEL=stderr

DB_CONNECTION=pgsql
DB_HOST=postgres
DB_PORT=5432
DB_DATABASE=church
DB_USERNAME=church
DB_PASSWORD=

SESSION_DRIVER=database
SESSION_LIFETIME=525600
SESSION_SECURE_COOKIE=true
SANCTUM_STATEFUL_DOMAINS=church.example.org

FILESYSTEM_DISK=media
QUEUE_CONNECTION=redis
CACHE_STORE=redis
REDIS_CLIENT=phpredis
REDIS_HOST=redis
REDIS_PORT=6379

BROADCAST_CONNECTION=log
MAIL_MAILER=log
```

`.env` служит двум целям: Compose берёт из него подстановки (`IMAGE_PREFIX`, `TAG`, `APP_DOMAIN`, `DB_*` для `postgres`), а контейнеры PHP получают его целиком как переменные окружения. `web` получает только `APP_DOMAIN`, `postgres` — только имя базы, пользователя и пароль. Часовой пояс и остальные настройки церкви живут в таблице `settings` и задаются при установке (шаг 7), не здесь.

### 4. Секреты GitHub

В репозитории: Settings → Secrets and variables → Actions → New repository secret.

| Секрет | Значение |
|---|---|
| `DEPLOY_HOST` | адрес сервера |
| `DEPLOY_USER` | пользователь деплоя, например `deploy` |
| `DEPLOY_KEY` | закрытый ключ `church-deploy` из шага 2 целиком |
| `DEPLOY_KNOWN_HOSTS` | содержимое файла `known_hosts` из шага 2 |

Токен для GHCR заводить не нужно: workflow публикует и скачивает образы токеном `GITHUB_TOKEN` с правом `packages: write`.

Workflow `deploy` не ждёт `ci`: он выкатывает всё, что попало в `main`. Поэтому в Settings → Branches для `main` включается правило «слияние только через pull request с пройденными проверками `ci`» (раздел 12 архитектуры: CI блокирует слияние).

### 5. Первый деплой

Пуш или слияние в `main`. Workflow `deploy` проходит зелёным. После него на сервере работают все сервисы, кроме `web`: сертификата ещё нет, nginx не стартует и перезапускается. Так и должно быть до шага 6.

```bash
cd /srv/church
docker compose -f compose.prod.yml ps
docker compose -f compose.prod.yml logs --tail 5 web
```

В журнале `web` — ошибка загрузки сертификата из `/etc/letsencrypt/live/<домен>/`.

### 6. Сертификат Let's Encrypt

nginx с настройкой TLS не стартует без сертификата, а выпуск через webroot требует работающего nginx на порту 80. Поэтому первый сертификат выпускает certbot в режиме standalone: он сам слушает порт 80, пока `web` остановлен.

```bash
cd /srv/church
docker compose -f compose.prod.yml stop web
docker compose -f compose.prod.yml run --rm -p 80:80 --entrypoint certbot certbot \
  certonly --standalone -d <домен> --email <почта администратора> --agree-tos --no-eff-email
docker compose -f compose.prod.yml up -d web
```

Домен в `-d` должен в точности совпадать с `APP_DOMAIN`: nginx читает сертификат из `/etc/letsencrypt/live/<APP_DOMAIN>/`.

Продление дальше идёт само:

- сервис `certbot` раз в 12 часов выполняет `certbot renew --webroot -w /var/www/certbot`. Ключ `--webroot` в команде заменяет запомненный при выпуске standalone, файлы проверки лежат в общем томе и отдаются `web` по HTTP;
- `web` раз в 12 часов перечитывает конфигурацию (`nginx -s reload`) и подхватывает продлённый сертификат. certbot продлевает за 30 дней до истечения, так что запаса хватает с избытком.

Проверка продления без выпуска настоящего сертификата:

```bash
docker compose -f compose.prod.yml run --rm --entrypoint certbot certbot \
  renew --dry-run --webroot -w /var/www/certbot
```

### 7. Установка системы

```bash
docker compose -f compose.prod.yml exec app php artisan app:install
```

Команда спрашивает название церкви, часовой пояс, регион телефонов, ФИО и логин первого администратора, пароль (`docs/architecture.md`, раздел 7.1). Остальных людей, роли и служения администратор создаёт через интерфейс.

### 8. Чек-лист проверки

Выполняется после первой установки и после каждого изменения в `infra/` или `deploy.yml`. `<домен>` — значение `APP_DOMAIN`.

1. `curl -s https://<домен>/api/v1/health` → `{"status":"ok","database":true,"redis":true}`.
2. `curl -sI http://<домен>/people` → `301`, `Location: https://<домен>/people`.
3. `curl -sI https://<домен>/people/01ANYTHING` → `200`, `Content-Type: text/html`, `Cache-Control: no-cache`: глубокая ссылка отдаёт оболочку SPA.
4. `curl -sI https://<домен>/sw.js` и `curl -sI https://<домен>/manifest.webmanifest` → `Cache-Control: no-cache`. Любой файл `/_nuxt/<хеш>.js` из исходника главной страницы → `Cache-Control: max-age=31536000`.
5. `curl -sI https://<домен>/sanctum/csrf-cookie` → `204`, `Set-Cookie: XSRF-TOKEN=…; secure`.
6. `curl -sI https://<домен>/_protected/x` и `curl -sI https://<домен>/index.php` → `404`.
7. `docker compose -f compose.prod.yml ps` → `web`, `app`, `worker`, `scheduler`, `postgres`, `redis`, `certbot` запущены, `postgres` и `redis` в состоянии `healthy`.
8. `docker compose -f compose.prod.yml exec worker php artisan horizon:status` → `Horizon is running`; `docker compose -f compose.prod.yml exec scheduler php artisan schedule:list` показывает `media:prune`. После деплоя `docker compose -f compose.prod.yml ps worker` показывает, что контейнер запущен секунды назад: Horizon перезапущен на новом образе.
9. Проверка продления сертификата из шага 6 проходит.
10. С телефона: администратор входит, ставит PWA на домашний экран, загружает своё фото в профиле, и фото показывается. Фото отдаёт nginx по `X-Accel-Redirect`, так что это проверка тома медиафайлов и подписанных ссылок.
11. Следующий пуш в `main`: workflow зелёный, `health` отвечает, `grep ^TAG= /srv/church/.env` показывает новый коммит.

## Повседневные действия

Все команды — из `/srv/church`.

- Журналы: `docker compose -f compose.prod.yml logs -f app worker`. Приложение пишет в stderr, Docker ротирует журналы (10 МБ, пять файлов на сервис).
- Команды artisan: `docker compose -f compose.prod.yml exec app php artisan <команда>`, например `people:erase`.
- Изменение `.env`: `docker compose -f compose.prod.yml up -d` пересоздаёт контейнеры с новым окружением.
- Откат кода: `git revert` в `main`, пуш выкатывает прежнюю версию. Миграции назад сами не откатываются. Если откатываемый коммит менял схему, до пуша выполнить на сервере `docker compose -f compose.prod.yml exec app php artisan migrate:rollback --step=<число миграций>`: в текущем образе ещё есть файлы этих миграций.
- Ручной `docker compose pull` не сработает: на сервере нет входа в GHCR. Новые образы приносит только деплой.
