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

1. Прогоняет CI — `ci.yml` как вызываемый workflow, задания `api`, `web`, `e2e` (в запуске они видны как `ci / api` и так далее). Дальше запуск идёт, только если все три прошли. Выкладывается тот же коммит, который проверен. Отдельно `ci.yml` на пуши в `main` не запускается.
2. Собирает и публикует образы `app` и `web`. Слои кешируются в кеше GitHub Actions, поэтому неизменившиеся слои сохраняют дайджест и сервер их не скачивает заново.
3. Копирует `compose.prod.yml` и `deploy.sh` в `/srv/church` по SSH. SSH и scp — из образа раннера, ключ хоста сверяется с секретом `DEPLOY_KNOWN_HOSTS`.
4. Логинит Docker сервера в GHCR токеном этого запуска (`GITHUB_TOKEN`) и разлогинивает после выкладки. Постоянного пароля от GHCR на сервере нет.
5. Запускает `TAG=<коммит> sh /srv/church/deploy.sh`:
   - `docker compose pull`;
   - `php artisan migrate --force` разовым контейнером нового образа, до переключения;
   - `docker compose stop worker` — Horizon доделывает текущие задачи, пока старый `app` ещё отвечает;
   - `docker compose up -d --remove-orphans --wait` — пересоздаёт контейнеры с новым тегом и ждёт до трёх минут, пока `web` и `app` станут здоровы, а остальные — запущены. Если не дождался, печатает состояние и журналы контейнеров и завершается с ошибкой: workflow красный, в `.env` остаётся тег работавшей версии;
   - записывает `TAG=<коммит>` в `.env`, чтобы ручные команды `docker compose` брали выложенную версию;
   - удаляет с сервера образы `app` и `web`, кроме выложенного и предыдущего.

Запуски идут по одному в порядке пушей. Ожидающий запуск заменяется более новым, так что старый коммит не выкатывается поверх нового.

Здоровье `web` — ответ `/api/v1/health` через nginx: это вся цепочка web → app → Postgres и Redis. Здоровье `app` — php-fpm принимает соединения.

Пересоздание контейнеров заменяет и сброс кешей, и `horizon:terminate`: контейнеры PHP новые и собирают кеши при старте. Horizon останавливается сигналом SIGTERM, тем же, что посылает `horizon:terminate`. Задача Horizon длится не дольше 60 секунд (таймаут по умолчанию), и `worker` получает 90 секунд на остановку, после чего Docker убивает процесс. Worker останавливается до переключения, поэтому это ожидание не удлиняет простой. Задачи, поставленные в эти секунды, копятся в Redis и достаются новому воркеру.

Простой длится, пока пересоздаются `app` и `web`: при локальной проверке на Docker Desktop — от одной до двенадцати секунд. Дольше всего останавливается `web`: nginx дожидается запросов, которые успели уйти в уже остановленный `app`.

Миграции идут до переключения, поэтому новый код никогда не работает со старой схемой. Старый код несколько секунд работает с новой схемой. Миграция, которая ломает предыдущую версию кода (удаление или переименование столбца, который тот читает), делится на два деплоя: сначала код перестаёт использовать столбец, следующим деплоем столбец удаляется. Это же правило делает безопасным откат на предыдущий образ.

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

Публичный ключ `church-deploy.pub` добавить в `~deploy/.ssh/authorized_keys` на сервере. Закрытый ключ `church-deploy` понадобится для секрета `DEPLOY_KEY` на шаге 6, после этого его удалить с компьютера.

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

`.env` служит двум целям: Compose берёт из него подстановки (`IMAGE_PREFIX`, `TAG`, `APP_DOMAIN`, `DB_*` для `postgres`), а контейнеры PHP получают его целиком как переменные окружения. `web` получает только `APP_DOMAIN`, `postgres` — только имя базы, пользователя и пароль. Часовой пояс и остальные настройки церкви живут в таблице `settings` и задаются при установке (шаг 8), не здесь.

### 4. `compose.prod.yml` на сервер

Для выпуска сертификата на шаге 5 файлу Compose нужно быть на сервере раньше первого деплоя. Со своего компьютера, из клона репозитория:

```bash
scp infra/compose.prod.yml deploy@<адрес сервера>:/srv/church/
```

Дальше его обновляет каждый деплой.

### 5. Сертификат Let's Encrypt

nginx с настройкой TLS не стартует без сертификата, а выпуск через webroot требует работающего nginx на порту 80. Поэтому первый сертификат выпускает certbot в режиме standalone, до первого деплоя: он сам слушает порт 80, пока `web` ещё не запущен.

```bash
cd /srv/church
TAG=none docker compose -f compose.prod.yml run --rm -p 80:80 --entrypoint certbot certbot \
  certonly --standalone -d <домен> --email <почта администратора> --agree-tos --no-eff-email
```

`TAG=none` нужен только затем, чтобы Compose смог прочитать файл: тег в `.env` запишет первый деплой, а сервис `certbot` образов приложения не использует. Домен в `-d` должен в точности совпадать с `APP_DOMAIN`: nginx читает сертификат из `/etc/letsencrypt/live/<APP_DOMAIN>/`.

Продление дальше идёт само:

- сервис `certbot` раз в 12 часов выполняет `certbot renew --webroot -w /var/www/certbot`. Ключ `--webroot` в команде заменяет запомненный при выпуске standalone, файлы проверки лежат в общем томе и отдаются `web` по HTTP;
- `web` раз в 12 часов перечитывает конфигурацию (`nginx -s reload`) и подхватывает продлённый сертификат. certbot продлевает за 30 дней до истечения, так что запаса хватает с избытком.

Проверка продления без выпуска настоящего сертификата (после первого деплоя):

```bash
docker compose -f compose.prod.yml run --rm --entrypoint certbot certbot \
  renew --dry-run --webroot -w /var/www/certbot
```

### 6. Секреты GitHub и защита ветки `main`

В репозитории: Settings → Secrets and variables → Actions → New repository secret.

| Секрет | Значение |
|---|---|
| `DEPLOY_HOST` | адрес сервера |
| `DEPLOY_USER` | пользователь деплоя, например `deploy` |
| `DEPLOY_KEY` | закрытый ключ `church-deploy` из шага 2 целиком |
| `DEPLOY_KNOWN_HOSTS` | содержимое файла `known_hosts` из шага 2 |

Токен для GHCR заводить не нужно: workflow публикует и скачивает образы токеном `GITHUB_TOKEN` с правом `packages: write`.

Правило защиты ветки `main` обеспечивает требование раздела 12 архитектуры: CI блокирует слияние при падении любого шага. Деплой закрывает другую дыру: `deploy.yml` не выкладывает коммит, пока в том же запуске не прошли `api`, `web` и `e2e`. Попасть в `main` без проверок коммиту он не мешает — это делает только правило. В Settings → Branches → Add classic branch protection rule, шаблон `main`:

- **Require a pull request before merging** — в `main` только через pull request;
- **Require status checks to pass before merging** и в нём **Require branches to be up to date before merging**. Обязательные проверки — `api`, `web`, `e2e`: так называются задания в `ci.yml`. Для выбора в поиске они появляются после первого прогона `ci.yml` в pull request;
- **Do not allow bypassing the above settings** — правило действует и на администраторов. По умолчанию они его обходят.

Ограничение GitHub: правила защиты веток и rulesets доступны в публичных репозиториях на GitHub Free, а в приватных — только на GitHub Pro, Team и Enterprise. Документация: «About protected branches» и «About rulesets», блок «Who can use this feature?». На приватном репозитории личного аккаунта GitHub Free правило не создать. Тогда гейт слияния держится на дисциплине: в `main` попадают только pull request с зелёными `api`, `web` и `e2e`, прямых пушей в `main` нет. Нарушение этой договорённости прод не сломает — деплой такой коммит не выложит, — но `main` окажется непроверенным. Техническим гейт становится, если перевести аккаунт на GitHub Pro или сделать репозиторий публичным.

### 7. Первый деплой

Пуш или слияние в `main`. Workflow `deploy` проходит зелёным: шаг `up --wait` дождался здоровых `web` и `app`.

```bash
cd /srv/church
docker compose -f compose.prod.yml ps
```

### 8. Установка системы

```bash
docker compose -f compose.prod.yml exec app php artisan app:install
```

Команда спрашивает название церкви, часовой пояс, регион телефонов, ФИО и логин первого администратора, пароль (`docs/architecture.md`, раздел 7.1). Остальных людей, роли и служения администратор создаёт через интерфейс.

### 9. Чек-лист проверки

Выполняется после первой установки и после каждого изменения в `infra/` или `deploy.yml`. `<домен>` — значение `APP_DOMAIN`.

1. `curl -s https://<домен>/api/v1/health` → `{"status":"ok","database":true,"redis":true}`.
2. `curl -sI http://<домен>/people` → `301`, `Location: https://<домен>/people`.
3. `curl -sI https://<домен>/people/01ANYTHING` → `200`, `Content-Type: text/html`, `Cache-Control: no-cache`: глубокая ссылка отдаёт оболочку SPA.
4. `curl -sI https://<домен>/sw.js` и `curl -sI https://<домен>/manifest.webmanifest` → `Cache-Control: no-cache`. Любой файл `/_nuxt/<хеш>.js` из исходника главной страницы → `Cache-Control: max-age=31536000`.
5. `curl -sI https://<домен>/sanctum/csrf-cookie` → `204`, `Set-Cookie: XSRF-TOKEN=…; secure`.
6. `curl -sI https://<домен>/_protected/x` и `curl -sI https://<домен>/index.php` → `404`.
7. `curl -sI https://<домен>/` и `curl -sI https://<домен>/api/v1/health` → в обоих ответах по одному разу `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`, `Referrer-Policy: strict-origin-when-cross-origin`.
8. `docker compose -f compose.prod.yml ps` → `web`, `app`, `worker`, `scheduler`, `postgres`, `redis`, `certbot` запущены; `web`, `app`, `postgres` и `redis` в состоянии `healthy`.
9. `docker compose -f compose.prod.yml exec worker php artisan horizon:status` → `Horizon is running`; `docker compose -f compose.prod.yml exec scheduler php artisan schedule:list` показывает `media:prune`. После деплоя `docker compose -f compose.prod.yml ps worker` показывает, что контейнер запущен секунды назад: Horizon перезапущен на новом образе.
10. Проверка продления сертификата из шага 5 проходит.
11. С телефона: администратор входит, ставит PWA на домашний экран, загружает своё фото в профиле, и фото показывается. Фото отдаёт nginx по `X-Accel-Redirect`, так что это проверка тома медиафайлов и подписанных ссылок, а заодно и `Referrer-Policy` из пункта 7: запрос `<img>` Sanctum узнаёт по `Referer`, без него фото ответило бы `401`.
12. Следующий пуш в `main`: в запуске `deploy` сначала проходят `ci / api`, `ci / web`, `ci / e2e`, затем выкладка. `health` отвечает, `grep ^TAG= /srv/church/.env` показывает новый коммит, `docker image ls "$(sed -n 's/^IMAGE_PREFIX=//p' .env)/app"` — два образа: новый и предыдущий.

## Откат

На сервере лежат образы двух версий: выложенной и предыдущей, остальные деплой удаляет. Откат на предыдущую не требует GHCR и занимает секунды. Все команды — из `/srv/church`.

Узнать теги:

```bash
grep ^TAG= .env                                              # выложенная версия
docker image ls "$(sed -n 's/^IMAGE_PREFIX=//p' .env)/app"   # выложенная и предыдущая, новые сверху
```

**Деплой упал на проверке здоровья** (workflow красный на шаге Deploy). Новые контейнеры не поднялись, а в `.env` остался тег работавшей версии, поэтому достаточно поднять её:

```bash
docker compose -f compose.prod.yml up -d --wait
```

**Новая версия выложена, но работает плохо.** Вернуть в `.env` предыдущий тег и поднять его:

```bash
sed -i 's/^TAG=.*/TAG=<предыдущий тег>/' .env
docker compose -f compose.prod.yml up -d --wait
```

Затем исправление или `git revert` в `main`: следующий деплой выложит новую версию поверх отката.

Миграции назад не откатываются. Предыдущий код работает с новой схемой, пока миграции следуют правилу из раздела «Что делает пуш в `main`». Если откатываемая версия его нарушила, до отката выполнить `docker compose -f compose.prod.yml exec app php artisan migrate:rollback --step=<число миграций>`: в текущем образе ещё есть файлы этих миграций.

Версии старше предыдущей на сервере нет, а скачать её вручную нельзя: входа в GHCR на сервере нет. Такая версия возвращается через `git revert` в `main` и обычный деплой.

## Обновление Postgres и Redis

Образы `postgres` и `redis` в `compose.prod.yml` закреплены на точной версии и дайджесте, поэтому `docker compose pull` на деплое их не меняет. Обновление — осознанная правка:

1. Прочитать примечания к выпуску новой версии: <https://www.postgresql.org/docs/release/>, <https://github.com/redis/redis/releases>.
2. Узнать дайджест нужного тега: `docker buildx imagetools inspect postgres:17.12-alpine3.24`, строка `Digest`.
3. Заменить в `infra/compose.prod.yml` тег и дайджест (`image: postgres:<тег>@sha256:<дайджест>`), слить в `main`. Деплой скачает образ и пересоздаст контейнер. База недоступна несколько секунд, данные остаются в томе.

Так меняются версии внутри мажорной: Postgres 17.x, Redis 7.x. Смена мажорной версии Postgres (17 → 18) сменой тега не делается: у новой версии другой формат каталога данных, и со старым томом она не стартует. Это отдельная процедура переноса данных, в этот документ она не входит.

## Повседневные действия

Все команды — из `/srv/church`.

- Журналы: `docker compose -f compose.prod.yml logs -f app worker`. Приложение пишет в stderr, Docker ротирует журналы (10 МБ, пять файлов на сервис).
- Команды artisan: `docker compose -f compose.prod.yml exec app php artisan <команда>`, например `people:erase`.
- Изменение `.env`: `docker compose -f compose.prod.yml up -d --wait` пересоздаёт контейнеры с новым окружением.
