# План фазы 1: каркас, доступ, справочник, служения, медиафайлы, оболочка

> **Для агентов-исполнителей:** ОБЯЗАТЕЛЬНЫЙ СУБ-SKILL: используйте `superpowers:subagent-driven-development` (рекомендуется) или `superpowers:executing-plans`, чтобы выполнять план задача за задачей. Шаги размечены чекбоксами (`- [ ]`).

**Цель:** довести систему до состояния, в котором администратор ставит её одной командой, создаёт роли, людей и служения, приглашает людей ссылкой, а они входят с телефонов и видят справочник, свои служения и свой профиль.

**Архитектура:** модульный монолит Laravel (`App\Modules\<Name>`) с одной Postgres и клиентом-PWA на Nuxt в режиме SPA. Права зашиты в код каталогом ключей, роли собираются из ключей и хранятся в данных. Все доменные связи ведут к человеку (`Person`), аккаунт (`User`) — необязательное дополнение. Межмодульные реакции идут доменными событиями Laravel и слушателями в очереди.

**Стек:** PHP 8.4+, Laravel актуального релиза, Sanctum (cookie-сессии), PostgreSQL 17+, Redis, Horizon, Pest, PHPStan (Larastan) 6+, Pint, `dedoc/scramble`; Nuxt актуальной версии (`ssr: false`), Pinia, Vitest, ESLint, `vue-tsc`, `openapi-typescript`, Playwright; Docker Compose, nginx, GitHub Actions.

**Спецификация:** [docs/architecture.md](../architecture.md) — разделы 1–8 и 10–13; словарь [CONTEXT.md](../../CONTEXT.md); решения [docs/adr](../adr/) 0001, 0002, 0003, 0004, 0007.

---

## Глобальные ограничения

Действуют во всех задачах, повторно в тексте задач не дублируются.

- PHP 8.4+, `declare(strict_types=1)` во всех файлах `apps/api`.
- PostgreSQL 17+. Первичные ключи — ULID, `char(26)`, трейт `HasUlids`. Публичные идентификаторы в URL — ULID, последовательных чисел нет.
- Время — `timestamptz`, хранится в UTC. Часовой пояс церкви — одна настройка `church.timezone`, все отображения и правила считаются в нём.
- Внешние ключи с `ON DELETE RESTRICT`. Каскадов базы нет, снятие связей делает Action.
- Значения enum хранятся как `varchar` с check-ограничением (решение фазы, см. «Решения планирования», пункт 7). Postgres-типы `enum` не создаются.
- Архивируемые сущности имеют `archived_at timestamptz null`. Физического удаления нет, кроме медиафайлов-сирот и команды `people:erase`.
- Уникальность «среди неархивных» — частичные индексы `WHERE archived_at IS NULL`.
- API под `/api/v1`, ответы через Laravel API Resources, даты ISO 8601 в UTC.
- Ошибки: `422` с `message` и `errors` для валидации; нарушения доменных правил — тоже `422`, но с полем `code` (например `role.last_role_cannot_be_removed`); `403` без раскрытия деталей права.
- Проверки по имени роли в коде запрещены. Только ключи прав через `PermissionResolver`.
- В таблицы модуля пишет только он сам, через классы `Actions`. Чужие модели можно читать.
- PHPStan (Larastan) уровня 6 и выше, Pint без замечаний, Pest зелёный. CI блокирует слияние при падении любого шага.
- Язык интерфейса — русский. Идентификаторы кода, таблиц и прав — английские.
- Лимиты медиафайлов: image до 10 МБ, file до 50 МБ, video до 100 МБ. `client_max_body_size 100m`, `upload_max_filesize = 100M`, `post_max_size = 110M`.
- Срок действия приглашения — 7 суток, ссылки сброса пароля — 24 часа, подписанной ссылки на медиафайл — 60 минут, «запомнить меня» — 365 дней.

---

## Решения планирования

Принято при составлении плана, чтобы фаза 1 была самодостаточной. Каждый пункт — отступление от буквального чтения архитектуры или выбор из оставленной ею развилки.

1. **`ministries.chat_id` в фазе 1 не создаётся.** Модуль Chat — фаза 4, там же колонка и досоздание чатов для уже существующих служений (архитектура, раздел 13, фаза 4). В фазе 1 создание служения чат не создаёт.
2. **`POST /auth/password/forgot` и `POST /auth/password/reset` по почте не реализуются.** SMTP отнесён в кандидаты после v1 (раздел 13). В фазе 1 работает только ручной путь: носитель `people.invite` создаёт ссылку сброса и передаёт её человеку.
3. **Таблицы `people` и `users` создаются в блоке Access, а не в блоке Directory.** Access и Directory взаимно зависимы и считаются одним ядром (раздел 4). Резолвер прав, `person_roles` и журнал без них не тестируются. HTTP-эндпоинты Directory остаются в своём блоке.
4. **Вход (задача 5) идёт раньше эндпоинтов ролей.** Без сессии ни один защищённый эндпоинт не проверяется тестом, а тесты — часть каждой задачи.
5. **Каталог прав растёт по фазам.** Фаза 1 объявляет только те ключи, которые в ней же и проверяются: `people.view`, `people.view_contacts`, `people.view_notes`, `people.manage`, `people.invite`, `ministries.create`, `ministries.view_all`, `ministries.manage_all`, `roles.manage_global`, `settings.manage`, `audit.view`, `members.manage`, `members.view_contacts`, `roles.manage`, `ministry.edit`. Ключи календаря, объявлений и чатов добавляются в своих фазах. Иначе тест покрытия политик (раздел 12) требовал бы тестов для ключей, за которыми нет кода.
6. **Право `roles.manage` в служении в фазе 1 не может быть заблокировано слотами.** Инвариант 6.3.6 («роль нельзя удалить, пока на неё ссылаются слоты») реализуется точкой расширения `RoleUsageCollector`: в фазе 1 она возвращает только носителей, в фазе 3 Calendar регистрирует в ней слоты и шаблоны.
7. **Enum-значения — `varchar` с check-ограничением.** Архитектура оставляла выбор за первой миграцией (раздел 5). Причина: добавление значения — правка check-ограничения в миграции, без блокирующего переписывания типа; ADR-0007 прямо рассчитывает на такое добавление.
8. **Модуль Settings включён в фазу 1**, хотя в запрошенном порядке блоков не назван: команда установки и нормализация телефонов зависят от `church.timezone` и `church.phone_region` (раздел 5.9, 7.1).

---

## Структура файлов

Монорепозиторий (раздел 11). Ниже — что создаётся в фазе 1 и за что отвечает.

```text
/
├── CONTEXT.md                          словарь, уже есть
├── docs/architecture.md, docs/adr/     уже есть
├── docs/plans/phase-1.md               этот план
├── apps/
│   ├── api/                            Laravel
│   │   ├── app/Modules/Access/         каталог прав, роли, резолвер, журнал
│   │   ├── app/Modules/Directory/      люди, аккаунты, приглашения, сессии, профиль
│   │   ├── app/Modules/Ministries/     служения, участие, роли участников
│   │   ├── app/Modules/Media/          загрузка, обработка, раздача, вложения
│   │   ├── app/Modules/Settings/       настройки церкви
│   │   ├── app/Support/                DomainRuleException, базовый Action, ULID-трейты
│   │   ├── routes/api.php              подключает routes каждого модуля
│   │   ├── openapi.json                схема, коммитится, дрейф ловит CI
│   │   └── tests/                      Pest: Feature по модулям, Unit для резолвера
│   └── web/                            Nuxt SPA
│       ├── app/pages|components|composables|stores|layouts
│       ├── types/api.d.ts              генерируется из openapi.json
│       └── sw.ts                       service worker (заготовка, наполняется в фазе 2)
├── infra/
│   ├── php/Dockerfile
│   ├── web/Dockerfile
│   ├── nginx/dev.conf, nginx/prod.conf
│   └── compose.yml, compose.prod.yml
└── .github/workflows/ci.yml, deploy.yml
```

Правило раскладки внутри модуля: `Models`, `Policies`, `Actions`, `Events`, `Listeners`, `Jobs`, `Http/{Controllers,Requests,Resources}`, `Database/Migrations`, `routes.php`. Файлы, которые меняются вместе, лежат вместе: политика рядом с моделью своего модуля, а не в общей папке `Policies`.

---

## Блок 1. Каркас репозитория и CI

### Задача 1: Монорепозиторий, скелет Laravel, качество, health, CI

**Файлы:**
- Создать: `apps/api/` (скелет `laravel/laravel`), `apps/api/app/Support/DomainRuleException.php`, `apps/api/bootstrap/app.php` (правка), `apps/api/routes/api.php`, `apps/api/config/scramble.php`, `apps/api/pint.json`, `apps/api/phpstan.neon`, `.github/workflows/ci.yml`, `.gitignore`, `README.md`
- Тест: `apps/api/tests/Feature/HealthTest.php`, `apps/api/tests/Feature/DomainRuleExceptionTest.php`

**Интерфейсы:**
- Отдаёт наружу: `App\Support\DomainRuleException::because(string $code, string $message)` — исключение доменного правила, рендерится как `422 {"message": ..., "code": ...}`. Все последующие задачи бросают его при нарушении инвариантов.
- Отдаёт наружу: `GET /api/v1/health` → `200 {"status":"ok","database":true,"redis":true}`.

- [x] **Шаг 1: Создать репозиторий и скелет**

```bash
git init && composer create-project laravel/laravel apps/api
```

```bash
cd apps/api && composer require --dev larastan/larastan pestphp/pest:^4.7 pestphp/pest-plugin-laravel:^4.0 && composer require dedoc/scramble
```

В `apps/api/composer.json` добавить скрипты `lint` (`pint --test`), `types` (`phpstan analyse --memory-limit=1G`), `test` (`pest`), `openapi` (`php artisan scramble:export --path=openapi.json`).

`apps/api/phpstan.neon`:

```neon
includes:
    - vendor/larastan/larastan/extension.neon
parameters:
    level: 6
    paths:
        - app
        - routes
        - database
```

- [x] **Шаг 2: Написать падающий тест health**

`apps/api/tests/Feature/HealthTest.php`:

```php
<?php

declare(strict_types=1);

it('reports database and redis availability', function () {
    $this->getJson('/api/v1/health')
        ->assertOk()
        ->assertJson(['status' => 'ok', 'database' => true, 'redis' => true]);
});
```

- [x] **Шаг 3: Запустить тест, убедиться что падает**

Выполнить: `./vendor/bin/pest tests/Feature/HealthTest.php`
Ожидается: FAIL, 404 вместо 200.

- [x] **Шаг 4: Реализовать health и обработчик доменных исключений**

`apps/api/app/Support/DomainRuleException.php`:

```php
<?php

declare(strict_types=1);

namespace App\Support;

use RuntimeException;

final class DomainRuleException extends RuntimeException
{
    private function __construct(public readonly string $ruleCode, string $message)
    {
        parent::__construct($message);
    }

    public static function because(string $code, string $message): self
    {
        return new self($code, $message);
    }
}
```

В `apps/api/bootstrap/app.php`, блок `withExceptions`:

```php
$exceptions->render(function (\App\Support\DomainRuleException $e) {
    return response()->json(['message' => $e->getMessage(), 'code' => $e->ruleCode], 422);
});
```

`apps/api/routes/api.php`:

```php
<?php

declare(strict_types=1);

use Dedoc\Scramble\Attributes\Response;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    Route::get('health', #[Response(
        status: 200,
        type: "array{status: 'ok', database: true, redis: true}",
    )] #[Response(
        status: 503,
        type: "array{status: 'degraded', database: bool, redis: bool}",
    )] function (): JsonResponse {
        $database = rescue(fn () => DB::select('select 1') !== [], false, false);
        $redis = rescue(fn () => Redis::connection()->ping() !== false, false, false);
        $ok = $database && $redis;

        return response()->json([
            'status' => $ok ? 'ok' : 'degraded',
            'database' => $database,
            'redis' => $redis,
        ], $ok ? 200 : 503);
    });
});
```

- [x] **Шаг 5: Написать тест доменного исключения**

`apps/api/tests/Feature/DomainRuleExceptionTest.php`:

```php
<?php

declare(strict_types=1);

use App\Support\DomainRuleException;
use Illuminate\Support\Facades\Route;

it('renders a domain rule violation as 422 with a code', function () {
    Route::get('/__test/domain', fn () => throw DomainRuleException::because('role.in_use', 'Роль используется.'));

    $this->getJson('/__test/domain')
        ->assertStatus(422)
        ->assertJson(['message' => 'Роль используется.', 'code' => 'role.in_use']);
});
```

- [x] **Шаг 6: Запустить оба теста, убедиться что проходят**

Выполнить: `./vendor/bin/pest`
Ожидается: PASS, 5 тестов.

- [x] **Шаг 7: Зафиксировать схему OpenAPI**

Настроить Scramble на префикс `api/v1`, выполнить `composer openapi`, закоммитить `apps/api/openapi.json`.

- [x] **Шаг 8: CI**

`.github/workflows/ci.yml`:

```yaml
name: ci
on: [push, pull_request]
jobs:
  api:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17-alpine
        env:
          POSTGRES_PASSWORD: secret
          POSTGRES_DB: church_test
          POSTGRES_USER: church
        options: --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5
        ports: ['5432:5432']
      redis:
        image: redis:7-alpine
        options: --health-cmd "redis-cli ping" --health-interval 10s --health-timeout 5s --health-retries 5
        ports: ['6379:6379']
    defaults:
      run:
        working-directory: apps/api
    steps:
      - uses: actions/checkout@v4
      - uses: shivammathur/setup-php@v2
        with:
          php-version: '8.4'
          extensions: pdo_pgsql, redis, intl, imagick, bcmath, zip, exif
      - run: composer install --no-interaction --prefer-dist
      - run: cp .env.example .env && php artisan key:generate
      - run: composer lint
      - run: composer types
      - run: composer test
      - name: OpenAPI schema is up to date
        run: composer openapi && git diff --exit-code openapi.json
```

- [x] **Шаг 9: Коммит**

```bash
git add . && git commit -m "chore: monorepo skeleton, Laravel api, quality tooling, health endpoint, CI"
```

**Критерии готовности:**
- `composer lint`, `composer types`, `composer test` проходят локально и в CI.
- `GET /api/v1/health` отдаёт `200` при живых Postgres и Redis, `503` — если один недоступен.
- Нарушение доменного правила отдаётся как `422` с полем `code`.
- `apps/api/openapi.json` в репозитории, CI падает при расхождении схемы с кодом.

---

### Задача 2: Docker Compose для разработки

**Файлы:**
- Создать: `infra/php/Dockerfile`, `infra/nginx/dev.conf`, `infra/compose.yml`, `apps/api/.env.example`, `Makefile`
- Тест: прогон `tests/Feature/HealthTest.php` внутри контейнера

**Интерфейсы:**
- Отдаёт наружу: `make up` поднимает `postgres`, `redis`, `app`, `worker`, `web`; `make test` выполняет Pest внутри `app`; API на `http://localhost:8080/api/v1`.

- [x] **Шаг 1: Dockerfile для PHP**

`infra/php/Dockerfile`:

```dockerfile
FROM php:8.4-fpm-alpine

RUN apk add --no-cache postgresql-dev icu-dev libzip-dev imagemagick imagemagick-dev libheif-dev $PHPIZE_DEPS \
    && docker-php-ext-install pdo_pgsql pcntl intl bcmath zip exif opcache \
    && pecl install redis imagick \
    && docker-php-ext-enable redis imagick \
    && apk del $PHPIZE_DEPS

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

RUN printf 'upload_max_filesize = 100M\npost_max_size = 110M\nmemory_limit = 256M\n' \
    > /usr/local/etc/php/conf.d/church.ini

WORKDIR /app
```

- [x] **Шаг 2: Конфиг nginx для разработки**

`infra/nginx/dev.conf`:

```nginx
server {
    listen 80;
    client_max_body_size 100m;
    root /app/public;
    index index.php;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        fastcgi_pass app:9000;
        fastcgi_param SCRIPT_FILENAME /app/public$fastcgi_script_name;
        include fastcgi_params;
    }

    location /_protected/ {
        internal;
        alias /media/;
    }
}
```

- [x] **Шаг 3: Compose**

`infra/compose.yml`:

```yaml
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: church
      POSTGRES_USER: church
      POSTGRES_PASSWORD: secret
    volumes: ['pgdata:/var/lib/postgresql/data']
    ports: ['5432:5432']
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes: ['redisdata:/data']
  app:
    build: { context: ./php }
    volumes: ['../apps/api:/app', 'media:/media']
    depends_on: [postgres, redis]
  worker:
    build: { context: ./php }
    command: php artisan horizon
    volumes: ['../apps/api:/app', 'media:/media']
    depends_on: [app]
  web:
    image: nginx:alpine
    volumes:
      - '../apps/api:/app:ro'
      - './nginx/dev.conf:/etc/nginx/conf.d/default.conf:ro'
      - 'media:/media:ro'
    ports: ['8080:80']
    depends_on: [app]
volumes: { pgdata: {}, redisdata: {}, media: {} }
```

- [x] **Шаг 4: `.env.example` и Makefile**

Отличия `apps/api/.env.example` от стандартного:

```dotenv
DB_CONNECTION=pgsql
DB_HOST=postgres
DB_DATABASE=church
DB_USERNAME=church
DB_PASSWORD=secret
REDIS_HOST=redis
CACHE_STORE=redis
QUEUE_CONNECTION=redis
SESSION_DRIVER=database
SESSION_LIFETIME=525600
FILESYSTEM_DISK=media
SANCTUM_STATEFUL_DOMAINS=localhost:3000,localhost:8080
```

`Makefile` с целями `up` (`docker compose -f infra/compose.yml up -d --build`), `down`, `test` (`docker compose -f infra/compose.yml exec app ./vendor/bin/pest`), `shell`.

- [x] **Шаг 5: Проверить**

Выполнить: `make up`, затем `curl -s localhost:8080/api/v1/health`
Ожидается: `{"status":"ok","database":true,"redis":true}`.

Выполнить: `make test`
Ожидается: PASS.

- [x] **Шаг 6: Коммит**

```bash
git add infra Makefile apps/api/.env.example && git commit -m "chore: docker compose for development"
```

**Критерии готовности:**
- `make up` поднимает стек, health отдаёт `ok` через nginx, а не только через `artisan serve`.
- `make test` прогоняет Pest внутри контейнера против контейнерной Postgres.
- Том `media` смонтирован в `app`, `worker` и `web`, в `web` — только для чтения.
- В `dev.conf` есть `internal`-локация `/_protected/` — задача 22 опирается на неё и не трогает конфиг.

---

### Задача 3: Настройки церкви

**Файлы:**
- Создать: `apps/api/app/Modules/Settings/Database/Migrations/2026_09_12_000100_create_settings_table.php`, `apps/api/app/Modules/Settings/Models/Setting.php`, `apps/api/app/Modules/Settings/Actions/PutChurchSettings.php`, `apps/api/app/Modules/Settings/ChurchSettings.php`
- Изменить: `apps/api/app/Providers/AppServiceProvider.php` (регистрация путей миграций модулей)
- Тест: `apps/api/tests/Feature/Settings/ChurchSettingsTest.php`

**Интерфейсы:**
- Отдаёт наружу: `ChurchSettings::name(): string`, `timezone(): string`, `phoneRegion(): string`, `all(): array<string, mixed>`, `put(array<string, mixed> $values): void`. Значения по умолчанию: `church.name = 'Церковь'`, `church.timezone = 'UTC'`, `church.phone_region = 'RU'`, `calendar.horizon_weeks = 8`, `calendar.reminder_offsets = ['h24','h2']`. Кеш Redis под ключом `settings`, `put` сбрасывает его.

- [x] **Шаг 1: Написать падающий тест**

`apps/api/tests/Feature/Settings/ChurchSettingsTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Settings\ChurchSettings;
use App\Modules\Settings\Models\Setting;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('falls back to defaults when nothing is stored', function () {
    expect(app(ChurchSettings::class)->timezone())->toBe('UTC')
        ->and(app(ChurchSettings::class)->phoneRegion())->toBe('RU');
});

it('stores and reads values back', function () {
    $settings = app(ChurchSettings::class);
    $settings->put(['church.timezone' => 'Europe/Moscow', 'church.name' => 'Дом хлеба']);

    expect($settings->timezone())->toBe('Europe/Moscow')
        ->and($settings->name())->toBe('Дом хлеба');
});

it('rejects an unknown key', function () {
    expect(fn () => app(ChurchSettings::class)->put(['church.colour' => 'blue']))
        ->toThrow(InvalidArgumentException::class);
});

it('does not store known values when another key is unknown', function () {
    $settings = app(ChurchSettings::class);

    expect(fn () => $settings->put([
        'church.name' => 'Дом хлеба',
        'church.colour' => 'blue',
    ]))->toThrow(InvalidArgumentException::class);

    expect(Setting::query()->count())->toBe(0);
});
```

- [x] **Шаг 2: Запустить тест, убедиться что падает**

Выполнить: `./vendor/bin/pest tests/Feature/Settings`
Ожидается: FAIL, класс `ChurchSettings` не найден.

- [x] **Шаг 3: Миграция и регистрация путей модулей**

Миграция:

```php
Schema::create('settings', function (Blueprint $table) {
    $table->string('key')->primary();
    $table->jsonb('value');
    $table->timestampTz('updated_at');
});
```

В `AppServiceProvider::boot()`:

```php
$this->loadMigrationsFrom(glob(app_path('Modules/*/Database/Migrations')) ?: []);
```

- [x] **Шаг 4: Реализовать `ChurchSettings` и Action записи**

```php
<?php

declare(strict_types=1);

namespace App\Modules\Settings;

use App\Modules\Settings\Actions\PutChurchSettings;
use App\Modules\Settings\Models\Setting;
use Illuminate\Support\Facades\Cache;

final class ChurchSettings
{
    /** @var array<string, mixed> */
    public const DEFAULTS = [
        'church.name' => 'Церковь',
        'church.timezone' => 'UTC',
        'church.phone_region' => 'RU',
        'calendar.horizon_weeks' => 8,
        'calendar.reminder_offsets' => ['h24', 'h2'],
    ];

    public function __construct(private readonly PutChurchSettings $putSettings) {}

    public function name(): string
    {
        return (string) $this->all()['church.name'];
    }

    public function timezone(): string
    {
        return (string) $this->all()['church.timezone'];
    }

    public function phoneRegion(): string
    {
        return (string) $this->all()['church.phone_region'];
    }

    /** @return array<string, mixed> */
    public function all(): array
    {
        $stored = Cache::rememberForever(
            'settings',
            fn () => Setting::query()->pluck('value', 'key')->all()
        );

        return [...self::DEFAULTS, ...$stored];
    }

    /** @param array<string, mixed> $values */
    public function put(array $values): void
    {
        $this->putSettings->execute($values);
    }
}
```

`PutChurchSettings` до записи проверяет все ключи по `ChurchSettings::DEFAULTS`, затем обновляет строки через `Setting::updateOrCreate` и сбрасывает кеш `settings`. Так неизвестный ключ не оставляет частично применённые настройки, а запись в таблицу остаётся внутри `Actions` модуля.

- [x] **Шаг 5: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Feature/Settings`
Ожидается: PASS, 4 теста.

- [x] **Шаг 6: Коммит**

```bash
git add apps/api && git commit -m "feat(settings): church settings table and typed accessor"
```

**Критерии готовности:**
- Отсутствующая настройка отдаёт значение по умолчанию, а не `null`.
- `put` с неизвестным ключом бросает `InvalidArgumentException`: опечатка не создаёт мусорную строку.
- Повторный `all()` не ходит в базу, `put` кеш сбрасывает.
- Миграции модулей подхватываются автоматически: новый модуль не требует правки провайдера.

---

## Блок 2. Access: права, роли, журнал

Блок открывается таблицами ядра (решение планирования 3) и входом (решение 4): без них ни резолвер, ни эндпоинты ролей не проверяются тестом.

### Задача 4: Таблицы ядра, модели, фабрики, нормализация телефона

**Файлы:**
- Создать: `apps/api/app/Modules/Directory/Database/Migrations/2026_09_12_000200_create_people_table.php`, `..._000210_create_users_table.php`; `apps/api/app/Modules/Access/Database/Migrations/2026_09_12_000220_create_roles_tables.php`, `..._000230_create_audit_entries_table.php`
- Создать: `app/Modules/Directory/Models/Person.php`, `User.php`; `app/Modules/Access/Models/Role.php`, `PersonRole.php`, `AuditEntry.php`; `app/Modules/Directory/PersonStatus.php`; `app/Modules/Access/RoleScope.php`; `app/Support/Phone.php`
- Создать: `database/factories/PersonFactory.php`, `UserFactory.php`, `RoleFactory.php`
- Тест: `tests/Feature/Access/CoreSchemaTest.php`, `tests/Unit/PhoneTest.php`

**Интерфейсы:**
- Отдаёт наружу: `Person` (`people`), `User` (`users`, `Authenticatable`), `Role` (`roles`), `PersonRole` (`person_roles`), `AuditEntry` (`audit_entries`).
- Отдаёт наружу: `enum PersonStatus: string { Member = 'member'; Attendee = 'attendee'; Guest = 'guest'; }`, `enum RoleScope: string { Global = 'global'; Ministry = 'ministry'; }`.
- Отдаёт наружу: `App\Support\Phone::normalize(?string $raw): ?string` — E.164 или `null`; при неразборчивом номере бросает `DomainRuleException` с кодом `phone.invalid`.
- Отдаёт наружу: фабрики `Person::factory()` (состояние `archived()`), `User::factory()->for($person)`, `Role::factory()->global()`, `Role::factory()->system()`, `Role::factory()->ministry(string $ministryId)`, `Role::factory()->withPermissions(list<Permission> $permissions)` — последнее состояние создаёт строки `role_permissions` вместе с ролью и используется во всех тестах прав.
- Потребляет: `ChurchSettings::phoneRegion()` из задачи 3.

- [x] **Шаг 1: Написать падающие тесты схемы**

`tests/Feature/Access/CoreSchemaTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Access\Models\Role;
use App\Modules\Access\RoleScope;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use Illuminate\Database\QueryException;

it('requires a user to have a phone or an email', function () {
    $person = Person::factory()->create();

    expect(fn () => User::factory()->for($person)->create(['phone' => null, 'email' => null]))
        ->toThrow(QueryException::class);
});

it('allows only one user per person', function () {
    $person = Person::factory()->create();
    User::factory()->for($person)->create();

    expect(fn () => User::factory()->for($person)->create())->toThrow(QueryException::class);
});

it('forbids a ministry id on a global role', function () {
    expect(fn () => Role::factory()->create([
        'scope' => RoleScope::Global,
        'ministry_id' => (string) \Illuminate\Support\Str::ulid(),
    ]))->toThrow(QueryException::class);
});

it('requires a ministry id on a ministry role', function () {
    expect(fn () => Role::factory()->create([
        'scope' => RoleScope::Ministry,
        'ministry_id' => null,
    ]))->toThrow(QueryException::class);
});

it('keeps global role names unique', function () {
    Role::factory()->global()->create(['name' => 'Пастор']);

    expect(fn () => Role::factory()->global()->create(['name' => 'Пастор']))
        ->toThrow(QueryException::class);
});

it('uses 26-character ulids as primary keys', function () {
    expect(strlen(Person::factory()->create()->id))->toBe(26);
});
```

`tests/Unit/PhoneTest.php`:

```php
<?php

declare(strict_types=1);

use App\Support\Phone;
use App\Support\DomainRuleException;

it('normalises a local number using the church region', function () {
    app(\App\Modules\Settings\ChurchSettings::class)->put(['church.phone_region' => 'RU']);

    expect(Phone::normalize('8 (912) 345-67-89'))->toBe('+79123456789');
});

it('passes through null', function () {
    expect(Phone::normalize(null))->toBeNull();
});

it('rejects gibberish', function () {
    expect(fn () => Phone::normalize('позвони мне'))
        ->toThrow(DomainRuleException::class);
});
```

- [x] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Feature/Access/CoreSchemaTest.php tests/Unit/PhoneTest.php`
Ожидается: FAIL, таблиц и классов нет.

- [x] **Шаг 3: Миграции**

`people`:

```php
DB::statement('CREATE EXTENSION IF NOT EXISTS pg_trgm');

Schema::create('people', function (Blueprint $table) {
    $table->char('id', 26)->primary();
    $table->string('last_name', 100);
    $table->string('first_name', 100);
    $table->string('patronymic', 100)->nullable();
    $table->string('phone', 20)->nullable();
    $table->string('email', 254)->nullable();
    $table->date('birth_date')->nullable();
    $table->string('status', 16);
    $table->text('note')->nullable();
    $table->boolean('contacts_public')->default(false);
    $table->timestampTz('archived_at')->nullable();
    $table->timestampsTz();
});

DB::statement("ALTER TABLE people ADD CONSTRAINT people_status_check
    CHECK (status IN ('member', 'attendee', 'guest'))");
DB::statement("CREATE INDEX people_name_trgm_idx ON people
    USING gin (lower(last_name || ' ' || first_name) gin_trgm_ops)");
DB::statement('CREATE INDEX people_active_idx ON people (last_name, first_name) WHERE archived_at IS NULL');
```

`users`:

```php
Schema::create('users', function (Blueprint $table) {
    $table->char('id', 26)->primary();
    $table->char('person_id', 26)->unique();
    $table->string('phone', 20)->nullable()->unique();
    $table->string('email', 254)->nullable()->unique();
    $table->string('password');
    $table->rememberToken();
    $table->string('ical_token', 64)->unique();
    $table->timestampTz('last_login_at')->nullable();
    $table->timestampTz('disabled_at')->nullable();
    $table->timestampsTz();

    $table->foreign('person_id')->references('id')->on('people')->restrictOnDelete();
});

DB::statement('ALTER TABLE users ADD CONSTRAINT users_login_present_check
    CHECK (phone IS NOT NULL OR email IS NOT NULL)');
```

`roles`, `role_permissions`, `person_roles`:

```php
Schema::create('roles', function (Blueprint $table) {
    $table->char('id', 26)->primary();
    $table->string('scope', 16);
    $table->char('ministry_id', 26)->nullable();   // FK добавит задача 16
    $table->string('name', 100);
    $table->text('description')->nullable();
    $table->boolean('is_system')->default(false);
    $table->timestampsTz();
    $table->unique(['id', 'ministry_id']);          // для составного FK из ministry_member_roles
});

DB::statement("ALTER TABLE roles ADD CONSTRAINT roles_scope_check
    CHECK ((scope = 'global' AND ministry_id IS NULL)
        OR (scope = 'ministry' AND ministry_id IS NOT NULL))");
DB::statement("CREATE UNIQUE INDEX roles_global_name_idx ON roles (name) WHERE scope = 'global'");
DB::statement("CREATE UNIQUE INDEX roles_ministry_name_idx ON roles (ministry_id, name) WHERE scope = 'ministry'");
DB::statement("CREATE UNIQUE INDEX roles_single_system_idx ON roles ((true)) WHERE is_system");

Schema::create('role_permissions', function (Blueprint $table) {
    $table->char('role_id', 26);
    $table->string('permission', 64);
    $table->primary(['role_id', 'permission']);
    $table->foreign('role_id')->references('id')->on('roles')->restrictOnDelete();
});

Schema::create('person_roles', function (Blueprint $table) {
    $table->char('person_id', 26);
    $table->char('role_id', 26);
    $table->char('assigned_by_user_id', 26)->nullable();
    $table->timestampTz('created_at');
    $table->primary(['person_id', 'role_id']);
    $table->foreign('person_id')->references('id')->on('people')->restrictOnDelete();
    $table->foreign('role_id')->references('id')->on('roles')->restrictOnDelete();
});
```

`audit_entries` (`actor_user_id` намеренно без внешнего ключа: журнал переживает стирание аккаунта, раздел 7.9):

```php
Schema::create('audit_entries', function (Blueprint $table) {
    $table->char('id', 26)->primary();
    $table->char('actor_user_id', 26)->nullable();
    $table->string('action', 64);
    $table->string('subject_type', 64)->nullable();
    $table->char('subject_id', 26)->nullable();
    $table->jsonb('payload')->nullable();
    $table->string('ip', 45)->nullable();
    $table->timestampTz('created_at');

    $table->index(['created_at', 'id']);
    $table->index('actor_user_id');
    $table->index('action');
    $table->index(['subject_type', 'subject_id']);
});
```

- [x] **Шаг 4: Модели, перечисления, фабрики**

`Person`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Directory\Models;

use App\Modules\Access\Models\Role;
use App\Modules\Directory\PersonStatus;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

final class Person extends Model
{
    use HasFactory;
    use HasUlids;

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'status' => PersonStatus::class,
            'birth_date' => 'date',
            'contacts_public' => 'boolean',
            'archived_at' => 'datetime',
        ];
    }

    public function user(): HasOne
    {
        return $this->hasOne(User::class);
    }

    public function globalRoles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'person_roles');
    }

    public function fullName(): string
    {
        return trim("{$this->last_name} {$this->first_name} {$this->patronymic}");
    }
}
```

`User` — `Illuminate\Foundation\Auth\User` с `HasUlids`, `HasApiTokens`, `Notifiable`, `hidden = ['password', 'remember_token']`, связью `person()` и методом `isDisabled(): bool`. `ical_token` заполняется в `creating` через `Str::random(64)`.

`App\Support\Phone`:

```php
<?php

declare(strict_types=1);

namespace App\Support;

use App\Modules\Settings\ChurchSettings;
use libphonenumber\PhoneNumberFormat;
use libphonenumber\PhoneNumberUtil;

final class Phone
{
    public static function normalize(?string $raw): ?string
    {
        if ($raw === null || trim($raw) === '') {
            return null;
        }

        $util = PhoneNumberUtil::getInstance();
        $region = app(ChurchSettings::class)->phoneRegion();

        try {
            $parsed = $util->parse($raw, $region);
        } catch (\libphonenumber\NumberParseException) {
            throw DomainRuleException::because('phone.invalid', 'Не удалось разобрать номер телефона.');
        }

        if (! $util->isValidNumber($parsed)) {
            throw DomainRuleException::because('phone.invalid', 'Номер телефона выглядит неверным.');
        }

        return $util->format($parsed, PhoneNumberFormat::E164);
    }
}
```

Установить зависимость: `composer require giggsey/libphonenumber-for-php`.

- [x] **Шаг 5: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Feature/Access/CoreSchemaTest.php tests/Unit/PhoneTest.php`
Ожидается: PASS, 9 тестов.

- [x] **Шаг 6: Коммит**

```bash
git add apps/api && git commit -m "feat(access): core tables for people, users, roles, audit"
```

**Критерии готовности:**
- База отвергает аккаунт без телефона и почты, второй аккаунт на человека, глобальную роль со служением и роль служения без служения.
- Две глобальные роли с одинаковым именем не создаются; частичный индекс `roles_single_system_idx` не даёт завести вторую системную роль.
- `pg_trgm` установлен, GIN-индекс по имени создан (используется задачей 12).
- `Phone::normalize` приводит `8 (912) 345-67-89` к `+79123456789` и падает понятным кодом на мусоре.
- `php artisan migrate:fresh` проходит на чистой базе.

---

### Задача 5: Вход, выход, текущий аккаунт

**Файлы:**
- Создать: `app/Modules/Directory/Http/Controllers/AuthController.php`, `Http/Requests/LoginRequest.php`, `Http/Resources/MeResource.php`, `app/Modules/Directory/routes.php`
- Изменить: `bootstrap/app.php` (`statefulApi()`), `config/auth.php` (провайдер на `App\Modules\Directory\Models\User`), `routes/api.php` (подключение `routes.php` модулей)
- Создать: миграцию `sessions` (стандартная Laravel), `tests/Pest.php` (хелпер `actingAsUser`)
- Тест: `tests/Feature/Directory/LoginTest.php`

**Интерфейсы:**
- Отдаёт наружу: `POST /api/v1/auth/login` (`login`, `password`, `remember`), `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`.
- Отдаёт наружу: тест-хелпер `actingAsUser(?Person $person = null, array $attributes = []): User` в `tests/Pest.php` — используется всеми последующими задачами.
- `GET /auth/me` отдаёт `{ user: {id, phone, email}, person: {id, last_name, first_name, patronymic, status}, permissions: {administrator, global: [], ministries: {}} }`. Поле `permissions` в этой задаче — заглушка с пустыми списками, наполняет его задача 6.

- [x] **Шаг 1: Написать падающие тесты**

`tests/Feature/Directory/LoginTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;

it('logs in by phone', function () {
    $person = Person::factory()->create(['first_name' => 'Иван']);
    User::factory()->for($person)->create(['phone' => '+79123456789', 'password' => bcrypt('secret123')]);

    $this->postJson('/api/v1/auth/login', ['login' => '8 912 345 67 89', 'password' => 'secret123'])
        ->assertOk()
        ->assertJsonPath('person.first_name', 'Иван');

    $this->assertAuthenticated();
});

it('logs in by email case-insensitively', function () {
    $user = User::factory()->create(['email' => 'ivan@example.com', 'password' => bcrypt('secret123')]);

    $this->postJson('/api/v1/auth/login', ['login' => 'IVAN@example.com', 'password' => 'secret123'])
        ->assertOk();
});

it('rejects a wrong password without revealing which field is wrong', function () {
    User::factory()->create(['email' => 'ivan@example.com', 'password' => bcrypt('secret123')]);

    $this->postJson('/api/v1/auth/login', ['login' => 'ivan@example.com', 'password' => 'nope'])
        ->assertStatus(422)
        ->assertJsonValidationErrors('login');

    $this->assertGuest();
});

it('refuses a disabled account', function () {
    User::factory()->create([
        'email' => 'ivan@example.com',
        'password' => bcrypt('secret123'),
        'disabled_at' => now(),
    ]);

    $this->postJson('/api/v1/auth/login', ['login' => 'ivan@example.com', 'password' => 'secret123'])
        ->assertStatus(422)
        ->assertJsonPath('code', 'auth.account_disabled');
});

it('records the login moment', function () {
    $user = User::factory()->create(['email' => 'ivan@example.com', 'password' => bcrypt('secret123')]);

    $this->postJson('/api/v1/auth/login', ['login' => 'ivan@example.com', 'password' => 'secret123']);

    expect($user->fresh()->last_login_at)->not->toBeNull();
});

it('requires a session for me', function () {
    $this->getJson('/api/v1/auth/me')->assertStatus(401);
});

it('returns the current account and person', function () {
    $user = actingAsUser();

    $this->getJson('/api/v1/auth/me')
        ->assertOk()
        ->assertJsonPath('user.id', $user->id)
        ->assertJsonPath('person.id', $user->person_id)
        ->assertJsonStructure(['permissions' => ['administrator', 'global', 'ministries']]);
});

it('logs out', function () {
    actingAsUser();

    $this->postJson('/api/v1/auth/logout')->assertNoContent();
    $this->assertGuest();
});
```

- [x] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Feature/Directory/LoginTest.php`
Ожидается: FAIL, маршруты не определены.

- [x] **Шаг 3: Реализовать вход**

Хелпер в `tests/Pest.php`:

```php
function actingAsUser(?Person $person = null, array $attributes = []): User
{
    $user = User::factory()->for($person ?? Person::factory()->create())->create($attributes);
    test()->actingAs($user);

    return $user;
}
```

`LoginRequest`: `login` — `required|string`, `password` — `required|string`, `remember` — `boolean`.

`AuthController::login`:

```php
public function login(LoginRequest $request): MeResource
{
    $login = trim($request->string('login')->toString());
    $candidate = filter_var($login, FILTER_VALIDATE_EMAIL)
        ? ['email' => mb_strtolower($login)]
        : ['phone' => Phone::normalize($login)];

    $user = User::query()->where($candidate)->first();

    if ($user === null || ! Hash::check($request->string('password')->toString(), $user->password)) {
        throw ValidationException::withMessages(['login' => 'Неверный логин или пароль.']);
    }

    if ($user->isDisabled()) {
        throw DomainRuleException::because('auth.account_disabled', 'Аккаунт отключён.');
    }

    Auth::login($user, $request->boolean('remember'));
    $request->session()->regenerate();
    $user->forceFill(['last_login_at' => now()])->save();

    return new MeResource($user->load('person'));
}
```

`routes/api.php` подключает `routes.php` каждого модуля:

```php
foreach (glob(app_path('Modules/*/routes.php')) ?: [] as $file) {
    Route::prefix('v1')->group($file);
}
```

`app/Modules/Directory/routes.php`:

```php
Route::post('auth/login', [AuthController::class, 'login'])->middleware('throttle:10,1');

Route::middleware('auth:sanctum')->group(function () {
    Route::post('auth/logout', [AuthController::class, 'logout']);
    Route::get('auth/me', [AuthController::class, 'me']);
});
```

`SESSION_DRIVER=database`, `SESSION_LIFETIME=525600` (365 дней) уже в `.env.example`.

- [x] **Шаг 4: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Feature/Directory/LoginTest.php`
Ожидается: PASS, 8 тестов.

- [x] **Шаг 5: Обновить схему и закоммитить**

```bash
composer openapi && git add . && git commit -m "feat(directory): cookie session login, logout, current account"
```

**Критерии готовности:**
- Вход работает и по телефону в любом местном формате, и по почте в любом регистре.
- Неверный пароль и несуществующий логин дают одинаковый `422` по полю `login`, отключённый аккаунт — `422` с `code = auth.account_disabled`.
- `GET /auth/me` без сессии отдаёт `401`, с сессией — аккаунт, человека и структуру `permissions`.
- Ограничение частоты на `login` — 10 попыток в минуту.
- `actingAsUser()` доступен всем следующим тестам.

---

### Задача 6: Каталог прав и резолвер

**Файлы:**
- Создать: `app/Modules/Access/Permission.php`, `PermissionScope.php`, `UserPermissions.php`, `PermissionResolver.php`, `PermissionCache.php`, `Contracts/MinistryPermissionSource.php`, `EmptyMinistryPermissionSource.php`, `Http/Controllers/PermissionCatalogController.php`, `app/Modules/Access/routes.php`
- Изменить: `Http/Resources/MeResource.php` (наполнение `permissions`), `AppServiceProvider` (привязка `MinistryPermissionSource`)
- Тест: `tests/Unit/Access/PermissionCatalogTest.php`, `tests/Feature/Access/PermissionResolverTest.php`, `tests/Feature/Access/PermissionCatalogEndpointTest.php`

**Интерфейсы:**
- Отдаёт наружу: `enum Permission: string` с методами `scope(): PermissionScope`, `label(): string`, `description(): string`; статический `Permission::ofScope(PermissionScope $scope): array`.
- Отдаёт наружу: `final class UserPermissions { bool $administrator; /** @var list<string> */ array $global; /** @var array<string, list<string>> */ array $ministries; }`.
- Отдаёт наружу: `PermissionResolver::for(User $user): UserPermissions`, `can(User $user, Permission $p): bool`, `canInMinistry(User $user, Permission $p, string $ministryId): bool`, `isMember(User $user, string $ministryId): bool`.
- Отдаёт наружу: `PermissionCache::bump(string ...$userIds): void` — вызывается всеми, кто меняет роли, права ролей, выдачу ролей или участие.
- Отдаёт наружу: `interface MinistryPermissionSource { /** @return array<string, list<string>> */ public function forPerson(string $personId): array; }`. В этой задаче связан с `EmptyMinistryPermissionSource`; задача 19 подменяет реализацию.
- Отдаёт наружу: `GET /api/v1/permissions`.

- [x] **Шаг 1: Написать падающие тесты**

`tests/Unit/Access/PermissionCatalogTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use App\Modules\Access\PermissionScope;

it('gives every permission a scope, a label and a description', function (Permission $permission) {
    expect($permission->label())->not->toBe('')
        ->and($permission->description())->not->toBe('')
        ->and($permission->scope())->toBeInstanceOf(PermissionScope::class);
})->with(Permission::cases());

it('keeps permission keys under 64 characters', function (Permission $permission) {
    expect(strlen($permission->value))->toBeLessThanOrEqual(64);
})->with(Permission::cases());

it('exposes both scopes', function () {
    expect(Permission::ofScope(PermissionScope::Global))->not->toBeEmpty()
        ->and(Permission::ofScope(PermissionScope::Ministry))->not->toBeEmpty();
});
```

`tests/Feature/Access/PermissionResolverTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Access\PermissionCache;
use App\Modules\Access\PermissionResolver;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;

it('gives an administrator every global permission', function () {
    $person = Person::factory()->create();
    $person->globalRoles()->attach(Role::factory()->system()->create());
    $user = User::factory()->for($person)->create();

    $resolved = app(PermissionResolver::class)->for($user);

    expect($resolved->administrator)->toBeTrue()
        ->and($resolved->global)->toContain(Permission::SettingsManage->value);
});

it('unions the permissions of all global roles', function () {
    $person = Person::factory()->create();
    $person->globalRoles()->attach([
        Role::factory()->global()->withPermissions([Permission::PeopleView])->create()->id,
        Role::factory()->global()->withPermissions([Permission::AuditView])->create()->id,
    ]);
    $user = User::factory()->for($person)->create();

    expect(app(PermissionResolver::class)->for($user)->global)
        ->toEqualCanonicalizing([Permission::PeopleView->value, Permission::AuditView->value]);
});

it('gives a disabled account no permissions at all', function () {
    $person = Person::factory()->create();
    $person->globalRoles()->attach(Role::factory()->system()->create());
    $user = User::factory()->for($person)->create(['disabled_at' => now()]);

    $resolved = app(PermissionResolver::class)->for($user);

    expect($resolved->administrator)->toBeFalse()->and($resolved->global)->toBeEmpty();
});

it('caches the resolution until the version is bumped', function () {
    $person = Person::factory()->create();
    $role = Role::factory()->global()->withPermissions([Permission::PeopleView])->create();
    $person->globalRoles()->attach($role);
    $user = User::factory()->for($person)->create();

    expect(app(PermissionResolver::class)->can($user, Permission::PeopleView))->toBeTrue();

    $person->globalRoles()->detach($role);
    expect(app(PermissionResolver::class)->can($user, Permission::PeopleView))->toBeTrue();

    app(PermissionCache::class)->bump($user->id);
    expect(app(PermissionResolver::class)->can($user, Permission::PeopleView))->toBeFalse();
});

it('lets ministries.manage_all stand in for any ministry permission', function () {
    $person = Person::factory()->create();
    $person->globalRoles()->attach(
        Role::factory()->global()->withPermissions([Permission::MinistriesManageAll])->create()
    );
    $user = User::factory()->for($person)->create();

    expect(app(PermissionResolver::class)->canInMinistry($user, Permission::MembersManage, (string) Str::ulid()))
        ->toBeTrue();
});
```

`tests/Feature/Access/PermissionCatalogEndpointTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Access\Permission;

it('requires a session', function () {
    $this->getJson('/api/v1/permissions')->assertStatus(401);
});

it('returns the catalogue grouped by scope', function () {
    actingAsUser();

    $this->getJson('/api/v1/permissions')
        ->assertOk()
        ->assertJsonCount(count(Permission::cases()), 'data')
        ->assertJsonStructure(['data' => [['key', 'scope', 'label', 'description']]]);
});
```

- [x] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Unit/Access tests/Feature/Access`
Ожидается: FAIL, классов нет.

- [x] **Шаг 3: Каталог прав**

Объявляются только ключи, проверяемые в фазе 1 (решение планирования 5).

```php
<?php

declare(strict_types=1);

namespace App\Modules\Access;

enum PermissionScope: string
{
    case Global = 'global';
    case Ministry = 'ministry';
}

enum Permission: string
{
    case PeopleView = 'people.view';
    case PeopleViewContacts = 'people.view_contacts';
    case PeopleViewNotes = 'people.view_notes';
    case PeopleManage = 'people.manage';
    case PeopleInvite = 'people.invite';
    case MinistriesCreate = 'ministries.create';
    case MinistriesViewAll = 'ministries.view_all';
    case MinistriesManageAll = 'ministries.manage_all';
    case RolesManageGlobal = 'roles.manage_global';
    case SettingsManage = 'settings.manage';
    case AuditView = 'audit.view';

    case MembersManage = 'members.manage';
    case MembersViewContacts = 'members.view_contacts';
    case RolesManage = 'roles.manage';
    case MinistryEdit = 'ministry.edit';

    public function scope(): PermissionScope
    {
        return match ($this) {
            self::MembersManage, self::MembersViewContacts,
            self::RolesManage, self::MinistryEdit => PermissionScope::Ministry,
            default => PermissionScope::Global,
        };
    }

    public function label(): string
    {
        return match ($this) {
            self::PeopleView => 'Видеть справочник',
            self::PeopleViewContacts => 'Видеть контакты',
            self::PeopleViewNotes => 'Видеть заметки',
            self::PeopleManage => 'Управлять людьми',
            self::PeopleInvite => 'Приглашать',
            self::MinistriesCreate => 'Создавать служения',
            self::MinistriesViewAll => 'Видеть все служения',
            self::MinistriesManageAll => 'Управлять всеми служениями',
            self::RolesManageGlobal => 'Управлять глобальными ролями',
            self::SettingsManage => 'Настройки церкви',
            self::AuditView => 'Журнал действий',
            self::MembersManage => 'Управлять составом',
            self::MembersViewContacts => 'Контакты участников',
            self::RolesManage => 'Управлять ролями служения',
            self::MinistryEdit => 'Редактировать служение',
        };
    }

    public function description(): string
    {
        return match ($this) {
            self::PeopleView => 'Список людей и карточка: ФИО, фото, статус, служения.',
            self::PeopleViewContacts => 'Телефон, почта и дата рождения любого человека.',
            self::PeopleViewNotes => 'Заметки руководства о людях.',
            self::PeopleManage => 'Создавать, редактировать и архивировать людей, менять ФИО и статус, стирать данные.',
            self::PeopleInvite => 'Создавать приглашения и ссылки сброса пароля, отключать и включать аккаунты.',
            self::MinistriesCreate => 'Создание и архивация служений.',
            self::MinistriesViewAll => 'Состав, события и объявления любого служения без участия в нём.',
            self::MinistriesManageAll => 'Все внутренние права в каждом служении.',
            self::RolesManageGlobal => 'Редактор глобальных ролей и выдача их людям.',
            self::SettingsManage => 'Название церкви, часовой пояс, регион телефонов.',
            self::AuditView => 'Хронология административных действий.',
            self::MembersManage => 'Добавлять и исключать участников, выдавать и снимать роли служения.',
            self::MembersViewContacts => 'Телефон, почта и дата рождения участников этого служения.',
            self::RolesManage => 'Создавать, редактировать и удалять роли служения, выбирать роль по умолчанию.',
            self::MinistryEdit => 'Название, описание и обложка служения.',
        };
    }

    /** @return list<self> */
    public static function ofScope(PermissionScope $scope): array
    {
        return array_values(array_filter(self::cases(), fn (self $p) => $p->scope() === $scope));
    }
}
```

- [x] **Шаг 4: Резолвер и кеш**

```php
<?php

declare(strict_types=1);

namespace App\Modules\Access;

use Illuminate\Support\Facades\Cache;

final class PermissionCache
{
    public function version(string $userId): int
    {
        return (int) Cache::get("perm-version:{$userId}", 1);
    }

    public function bump(string ...$userIds): void
    {
        foreach (array_unique($userIds) as $userId) {
            Cache::add("perm-version:{$userId}", 1);
            Cache::increment("perm-version:{$userId}");
        }
    }

    public function key(string $userId): string
    {
        return "perm:{$userId}:v{$this->version($userId)}";
    }
}
```

```php
final class PermissionResolver
{
    public function __construct(
        private readonly PermissionCache $cache,
        private readonly MinistryPermissionSource $ministries,
    ) {}

    public function for(User $user): UserPermissions
    {
        if ($user->isDisabled()) {
            return new UserPermissions(false, [], []);
        }

        return Cache::remember($this->cache->key($user->id), 3600, function () use ($user) {
            $roles = Role::query()
                ->whereIn('id', PersonRole::query()->where('person_id', $user->person_id)->select('role_id'))
                ->with('permissions')
                ->get();

            if ($roles->contains('is_system', true)) {
                return new UserPermissions(
                    true,
                    array_map(fn (Permission $p) => $p->value, Permission::ofScope(PermissionScope::Global)),
                    $this->ministries->forPerson($user->person_id),
                );
            }

            $global = $roles->flatMap(fn (Role $role) => $role->permissions->pluck('permission'))
                ->unique()->values()->all();

            return new UserPermissions(false, $global, $this->ministries->forPerson($user->person_id));
        });
    }

    public function can(User $user, Permission $permission): bool
    {
        $resolved = $this->for($user);

        return $resolved->administrator || in_array($permission->value, $resolved->global, true);
    }

    public function canInMinistry(User $user, Permission $permission, string $ministryId): bool
    {
        $resolved = $this->for($user);

        if ($resolved->administrator || in_array(Permission::MinistriesManageAll->value, $resolved->global, true)) {
            return true;
        }

        return in_array($permission->value, $resolved->ministries[$ministryId] ?? [], true);
    }

    public function isMember(User $user, string $ministryId): bool
    {
        return array_key_exists($ministryId, $this->for($user)->ministries);
    }
}
```

`EmptyMinistryPermissionSource::forPerson()` возвращает `[]`. Привязка в `AppServiceProvider`.

- [x] **Шаг 5: Эндпоинт каталога и права в `/auth/me`**

`GET /permissions` отдаёт `data: [{key, scope, label, description}]`. `MeResource` подставляет `PermissionResolver::for($user)`.

- [x] **Шаг 6: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Unit/Access tests/Feature/Access`
Ожидается: PASS.

- [x] **Шаг 7: Коммит**

```bash
composer openapi && git add . && git commit -m "feat(access): permission catalogue, resolver and cache"
```

**Критерии готовности:**
- У каждого ключа есть область, русское название и описание — проверяется тестом по всем `Permission::cases()`.
- Системная роль даёт все глобальные права и маркер администратора, не перечисляя их в `role_permissions`.
- Отключённый аккаунт получает пустое множество прав, даже если он администратор.
- Резолвер кешируется и обновляется ровно после `PermissionCache::bump`.
- `ministries.manage_all` даёт любое право в любом служении.
- `GET /permissions` требует сессии и отдаёт весь каталог.

---

### Задача 7: Журнал действий

**Файлы:**
- Создать: `app/Modules/Access/AuditLogger.php`, `Http/Controllers/AuditController.php`, `Http/Resources/AuditEntryResource.php`, `Policies/AuditPolicy.php`
- Изменить: `app/Modules/Access/routes.php`
- Тест: `tests/Feature/Access/AuditTest.php`

**Интерфейсы:**
- Отдаёт наружу: `AuditLogger::record(string $action, ?Model $subject = null, array $payload = []): void` — берёт актора из `auth()->user()` (null для консоли) и IP из запроса. Все последующие задачи пишут журнал только через него.
- Отдаёт наружу: `GET /api/v1/audit?cursor&actor&action&subject_type&subject_id&from&to` — курсорная пагинация, право `audit.view`.

- [x] **Шаг 1: Написать падающие тесты**

```php
<?php

declare(strict_types=1);

use App\Modules\Access\AuditLogger;
use App\Modules\Access\Models\AuditEntry;
use App\Modules\Access\Permission;

it('records the actor, the subject and the payload', function () {
    $user = actingAsUser();
    $subject = \App\Modules\Directory\Models\Person::factory()->create();

    app(AuditLogger::class)->record('person.archived', $subject, ['before' => null, 'after' => 'archived']);

    $entry = AuditEntry::query()->sole();
    expect($entry->actor_user_id)->toBe($user->id)
        ->and($entry->action)->toBe('person.archived')
        ->and($entry->subject_id)->toBe($subject->id)
        ->and($entry->subject_type)->toBe('person')
        ->and($entry->payload['after'])->toBe('archived');
});

it('records a console action without an actor', function () {
    app(AuditLogger::class)->record('settings.changed');

    expect(AuditEntry::query()->sole()->actor_user_id)->toBeNull();
});

it('denies the journal without audit.view', function () {
    actingAsUser();

    $this->getJson('/api/v1/audit')->assertForbidden();
});

it('shows the journal with audit.view', function () {
    actingAsUserWith([Permission::AuditView]);
    AuditEntry::factory()->count(3)->create();

    $this->getJson('/api/v1/audit')
        ->assertOk()
        ->assertJsonCount(3, 'data')
        ->assertJsonStructure(['data' => [['id', 'action', 'actor', 'subject_type', 'subject_id', 'created_at']], 'next_cursor']);
});

it('filters by action', function () {
    actingAsUserWith([Permission::AuditView]);
    AuditEntry::factory()->create(['action' => 'role.created']);
    AuditEntry::factory()->create(['action' => 'person.archived']);

    $this->getJson('/api/v1/audit?action=role.created')
        ->assertOk()
        ->assertJsonCount(1, 'data');
});
```

- [x] **Шаг 2: Добавить хелпер `actingAsUserWith`**

В `tests/Pest.php` — используется дальше во всех задачах:

```php
/** @param list<Permission> $permissions */
function actingAsUserWith(array $permissions, ?Person $person = null): User
{
    $person ??= Person::factory()->create();
    $person->globalRoles()->attach(Role::factory()->global()->withPermissions($permissions)->create());

    $user = User::factory()->for($person)->create();
    test()->actingAs($user);

    return $user;
}

function actingAsAdministrator(): User
{
    $person = Person::factory()->create();
    $person->globalRoles()->attach(Role::factory()->system()->create());
    $user = User::factory()->for($person)->create();
    test()->actingAs($user);

    return $user;
}
```

- [x] **Шаг 3: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Feature/Access/AuditTest.php`
Ожидается: FAIL.

- [x] **Шаг 4: Реализовать**

```php
final class AuditLogger
{
    /** @param array<string, mixed> $payload */
    public function record(string $action, ?Model $subject = null, array $payload = []): void
    {
        AuditEntry::query()->create([
            'actor_user_id' => auth()->id(),
            'action' => $action,
            'subject_type' => $subject === null ? null : Str::of(class_basename($subject))->snake()->toString(),
            'subject_id' => $subject?->getKey(),
            'payload' => $payload === [] ? null : $payload,
            'ip' => request()->ip(),
            'created_at' => now(),
        ]);
    }
}
```

Контроллер: `AuditEntry::query()->latest('created_at')->latest('id')` с фильтрами и `cursorPaginate(50)`. Политика: `Gate::allows` через `PermissionResolver::can($user, Permission::AuditView)`.

- [x] **Шаг 5: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Feature/Access/AuditTest.php`
Ожидается: PASS, 5 тестов.

- [x] **Шаг 6: Коммит**

```bash
composer openapi && git add . && git commit -m "feat(access): audit log writer and journal endpoint"
```

**Критерии готовности:**
- Запись из HTTP содержит актора и IP, запись из консоли — `actor_user_id = null`.
- `GET /audit` без `audit.view` даёт `403`, с правом — курсорную страницу.
- Фильтры по актору, действию, объекту и периоду работают.
- В журнал нельзя внести правку: модель без `update` и `delete` (тест на это не нужен, достаточно отсутствия эндпоинтов).

---

### Задача 8: Редактор глобальных ролей

**Файлы:**
- Создать: `app/Modules/Access/Actions/CreateRole.php`, `UpdateRole.php`, `DeleteRole.php`, `SetRolePermissions.php`; `RoleUsageCollector.php`; `Http/Controllers/RoleController.php`, `Http/Requests/RoleRequest.php`, `Http/Resources/RoleResource.php`, `Policies/RolePolicy.php`; `Events/RoleDeleted.php`
- Изменить: `app/Modules/Access/routes.php`
- Тест: `tests/Feature/Access/GlobalRoleTest.php`

**Интерфейсы:**
- Отдаёт наружу: `CreateRole::handle(RoleScope $scope, ?string $ministryId, string $name, ?string $description, list<Permission> $permissions): Role`
- Отдаёт наружу: `UpdateRole::handle(Role $role, ?string $name, ?string $description, ?array $permissions): Role`
- Отдаёт наружу: `DeleteRole::handle(Role $role): void` — снимает роль с носителей, публикует `RoleDeleted`, пишет журнал.
- Отдаёт наружу: `RoleUsageCollector::for(Role $role): array{carriers: int, blockers: list<array{type: string, id: string, title: string}>}` — точка расширения; фаза 3 регистрирует в ней слоты и шаблоны (решение планирования 6).
- Отдаёт наружу: `GET /roles?scope=global`, `POST /roles`, `PATCH /roles/{id}`, `DELETE /roles/{id}`, `GET /roles/{id}/usage`.
- Коды доменных ошибок: `role.system_immutable`, `role.permission_scope_mismatch`, `role.name_taken`, `role.in_use`.

- [x] **Шаг 1: Написать падающие тесты**

```php
<?php

declare(strict_types=1);

use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Directory\Models\Person;

it('denies the role editor without roles.manage_global', function () {
    actingAsUser();

    $this->postJson('/api/v1/roles', ['scope' => 'global', 'name' => 'Пастор', 'permissions' => []])
        ->assertForbidden();
});

it('creates a global role with permissions', function () {
    actingAsUserWith([Permission::RolesManageGlobal]);

    $this->postJson('/api/v1/roles', [
        'scope' => 'global',
        'name' => 'Пастор',
        'permissions' => ['people.view', 'people.view_contacts'],
    ])->assertCreated()->assertJsonPath('data.name', 'Пастор');

    expect(Role::query()->where('name', 'Пастор')->sole()->permissions)->toHaveCount(2);
});

it('creates a role with no permissions at all', function () {
    actingAsUserWith([Permission::RolesManageGlobal]);

    $this->postJson('/api/v1/roles', ['scope' => 'global', 'name' => 'Вокалист', 'permissions' => []])
        ->assertCreated();
});

it('refuses a ministry permission on a global role', function () {
    actingAsUserWith([Permission::RolesManageGlobal]);

    $this->postJson('/api/v1/roles', [
        'scope' => 'global',
        'name' => 'Пастор',
        'permissions' => ['members.manage'],
    ])->assertStatus(422)->assertJsonPath('code', 'role.permission_scope_mismatch');
});

it('refuses a duplicate global name', function () {
    actingAsUserWith([Permission::RolesManageGlobal]);
    Role::factory()->global()->create(['name' => 'Пастор']);

    $this->postJson('/api/v1/roles', ['scope' => 'global', 'name' => 'Пастор', 'permissions' => []])
        ->assertStatus(422)->assertJsonPath('code', 'role.name_taken');
});

it('refuses to rename or re-permission the system role', function () {
    actingAsUserWith([Permission::RolesManageGlobal]);
    $system = Role::factory()->system()->create();

    $this->patchJson("/api/v1/roles/{$system->id}", ['name' => 'Главный'])
        ->assertStatus(422)->assertJsonPath('code', 'role.system_immutable');
});

it('refuses to delete the system role', function () {
    actingAsUserWith([Permission::RolesManageGlobal]);
    $system = Role::factory()->system()->create();

    $this->deleteJson("/api/v1/roles/{$system->id}")
        ->assertStatus(422)->assertJsonPath('code', 'role.system_immutable');
});

it('detaches a deleted role from its carriers', function () {
    actingAsUserWith([Permission::RolesManageGlobal]);
    $role = Role::factory()->global()->create();
    $person = Person::factory()->create();
    $person->globalRoles()->attach($role);

    $this->deleteJson("/api/v1/roles/{$role->id}")->assertNoContent();

    expect($person->fresh()->globalRoles)->toBeEmpty()
        ->and(Role::query()->find($role->id))->toBeNull();
});

it('reports how many people carry a role', function () {
    actingAsUserWith([Permission::RolesManageGlobal]);
    $role = Role::factory()->global()->create();
    Person::factory()->count(2)->create()->each(fn ($p) => $p->globalRoles()->attach($role));

    $this->getJson("/api/v1/roles/{$role->id}/usage")
        ->assertOk()
        ->assertJsonPath('data.carriers', 2)
        ->assertJsonPath('data.blockers', []);
});

it('writes role changes to the journal', function () {
    actingAsUserWith([Permission::RolesManageGlobal]);

    $this->postJson('/api/v1/roles', ['scope' => 'global', 'name' => 'Пастор', 'permissions' => []]);

    expect(\App\Modules\Access\Models\AuditEntry::query()->where('action', 'role.created')->exists())->toBeTrue();
});
```

- [x] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Feature/Access/GlobalRoleTest.php`
Ожидается: FAIL.

- [x] **Шаг 3: Реализовать Actions**

`SetRolePermissions` — единственное место, где проверяется совпадение областей:

```php
final class SetRolePermissions
{
    /** @param list<Permission> $permissions */
    public function handle(Role $role, array $permissions): void
    {
        $expected = $role->scope === RoleScope::Global ? PermissionScope::Global : PermissionScope::Ministry;

        foreach ($permissions as $permission) {
            if ($permission->scope() !== $expected) {
                throw DomainRuleException::because(
                    'role.permission_scope_mismatch',
                    "Право «{$permission->label()}» нельзя выдать роли этого уровня."
                );
            }
        }

        $role->permissions()->delete();
        $role->permissions()->createMany(
            array_map(fn (Permission $p) => ['permission' => $p->value], $permissions)
        );

        app(PermissionCache::class)->bump(...$role->carrierUserIds());
    }
}
```

`DeleteRole`:

```php
final class DeleteRole
{
    public function handle(Role $role): void
    {
        if ($role->is_system) {
            throw DomainRuleException::because('role.system_immutable', 'Роль «Администратор» удалить нельзя.');
        }

        $usage = app(RoleUsageCollector::class)->for($role);

        if ($usage['blockers'] !== []) {
            throw DomainRuleException::because('role.in_use', 'Роль используется и не может быть удалена.');
        }

        $carriers = $role->carrierUserIds();

        DB::transaction(function () use ($role) {
            PersonRole::query()->where('role_id', $role->id)->delete();
            $role->permissions()->delete();
            $role->delete();
        });

        app(AuditLogger::class)->record('role.deleted', null, ['role_id' => $role->id, 'name' => $role->name]);
        RoleDeleted::dispatch($role->id, $carriers);
        app(PermissionCache::class)->bump(...$carriers);
    }
}
```

`Role::carrierUserIds(): list<string>` — идентификаторы аккаунтов людей-носителей роли (для глобальной роли через `person_roles`, для роли служения — через `ministry_member_roles`, задача 17 дополнит метод).

- [x] **Шаг 4: Контроллер, запросы, политика, маршруты**

`RolePolicy` для глобальных ролей опирается на `Permission::RolesManageGlobal`, для ролей служения — на `Permission::RolesManage` в области роли (задача 18 подключит эту ветку). `RoleRequest` проверяет, что каждое значение `permissions` есть в `Permission::cases()`.

- [x] **Шаг 5: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Feature/Access/GlobalRoleTest.php`
Ожидается: PASS, 10 тестов.

- [x] **Шаг 6: Коммит**

```bash
composer openapi && git add . && git commit -m "feat(access): global role editor with invariants"
```

**Критерии готовности:**
- Инварианты 6.3.1, 6.3.2 и 6.3.7 закрыты тестами: системная роль неизменяема и неудаляема, удаление снимает роль с носителей, область права совпадает с областью роли.
- Роль без прав создаётся — это законное состояние (ADR-0004).
- `GET /roles/{id}/usage` отдаёт число носителей и пустой список блокировок; в фазе 3 тот же ответ наполнится слотами.
- Любое изменение роли сбрасывает кеш прав её носителей.
- Создание, изменение и удаление роли попадают в журнал.

---

### Задача 9: Выдача глобальных ролей человеку

**Файлы:**
- Создать: `app/Modules/Access/Actions/SetPersonRoles.php`, `Events/PersonRolesChanged.php`, `Listeners/BumpPermissionCache.php`, `Http/Controllers/PersonRoleController.php`
- Изменить: `app/Modules/Access/routes.php`, `AppServiceProvider` (подписка слушателя)
- Тест: `tests/Feature/Access/PersonRolesTest.php`

**Интерфейсы:**
- Отдаёт наружу: `SetPersonRoles::handle(Person $person, list<string> $roleIds): void` — заменяет набор глобальных ролей человека целиком.
- Отдаёт наружу: `PersonRolesChanged(string $personId, ?string $userId)` — слушают Access (сброс кеша) и, начиная с фазы 4, Chat.
- Отдаёт наружу: `PUT /api/v1/people/{id}/roles` с телом `{ "role_ids": ["..."] }`.
- Коды ошибок: `role.scope_not_global`, `role.last_administrator`.

- [x] **Шаг 1: Написать падающие тесты**

```php
<?php

declare(strict_types=1);

use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Access\PermissionResolver;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;

it('denies role assignment without roles.manage_global', function () {
    actingAsUser();
    $person = Person::factory()->create();

    $this->putJson("/api/v1/people/{$person->id}/roles", ['role_ids' => []])->assertForbidden();
});

it('replaces the whole set of global roles', function () {
    actingAsUserWith([Permission::RolesManageGlobal]);
    $person = Person::factory()->create();
    $old = Role::factory()->global()->create();
    $new = Role::factory()->global()->create();
    $person->globalRoles()->attach($old);

    $this->putJson("/api/v1/people/{$person->id}/roles", ['role_ids' => [$new->id]])->assertOk();

    expect($person->fresh()->globalRoles->pluck('id')->all())->toBe([$new->id]);
});

it('refuses a ministry role as a global one', function () {
    actingAsUserWith([Permission::RolesManageGlobal]);
    $person = Person::factory()->create();
    $ministryRole = Role::factory()->ministry((string) Str::ulid())->create();

    $this->putJson("/api/v1/people/{$person->id}/roles", ['role_ids' => [$ministryRole->id]])
        ->assertStatus(422)->assertJsonPath('code', 'role.scope_not_global');
});

it('refuses to remove the administrator role from the last carrier', function () {
    $admin = actingAsAdministrator();

    $this->putJson("/api/v1/people/{$admin->person_id}/roles", ['role_ids' => []])
        ->assertStatus(422)->assertJsonPath('code', 'role.last_administrator');
});

it('allows removing administrator while another carrier remains', function () {
    $admin = actingAsAdministrator();
    $system = Role::query()->where('is_system', true)->sole();
    $other = Person::factory()->create();
    $other->globalRoles()->attach($system);

    $this->putJson("/api/v1/people/{$admin->person_id}/roles", ['role_ids' => []])->assertOk();
});

it('invalidates the permission cache of the affected account', function () {
    actingAsUserWith([Permission::RolesManageGlobal]);
    $person = Person::factory()->create();
    $user = User::factory()->for($person)->create();
    $role = Role::factory()->global()->withPermissions([Permission::PeopleView])->create();

    expect(app(PermissionResolver::class)->can($user, Permission::PeopleView))->toBeFalse();

    $this->putJson("/api/v1/people/{$person->id}/roles", ['role_ids' => [$role->id]])->assertOk();

    expect(app(PermissionResolver::class)->can($user->fresh(), Permission::PeopleView))->toBeTrue();
});
```

- [x] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Feature/Access/PersonRolesTest.php`
Ожидается: FAIL.

- [x] **Шаг 3: Реализовать `SetPersonRoles`**

```php
final class SetPersonRoles
{
    /** @param list<string> $roleIds */
    public function handle(Person $person, array $roleIds): void
    {
        $roles = Role::query()->findMany($roleIds);

        foreach ($roles as $role) {
            if ($role->scope !== RoleScope::Global) {
                throw DomainRuleException::because('role.scope_not_global', 'Это роль служения, её нельзя выдать глобально.');
            }
        }

        $before = $person->globalRoles()->pluck('roles.id')->all();
        $system = Role::query()->where('is_system', true)->first();

        $losesAdministrator = $system !== null
            && in_array($system->id, $before, true)
            && ! in_array($system->id, $roleIds, true);

        if ($losesAdministrator && PersonRole::query()->where('role_id', $system->id)->count() === 1) {
            throw DomainRuleException::because(
                'role.last_administrator',
                'Нельзя снять роль «Администратор» с последнего носителя.'
            );
        }

        DB::transaction(function () use ($person, $roleIds) {
            PersonRole::query()->where('person_id', $person->id)->delete();

            foreach ($roleIds as $roleId) {
                PersonRole::query()->create([
                    'person_id' => $person->id,
                    'role_id' => $roleId,
                    'assigned_by_user_id' => auth()->id(),
                    'created_at' => now(),
                ]);
            }
        });

        app(AuditLogger::class)->record('person.roles_changed', $person, ['before' => $before, 'after' => $roleIds]);
        PersonRolesChanged::dispatch($person->id, $person->user?->id);
    }
}
```

`BumpPermissionCache` слушает `PersonRolesChanged` и `RoleDeleted`, вызывает `PermissionCache::bump`. Слушатель ставится в очередь (`ShouldQueue`), в тестах очередь синхронная.

- [x] **Шаг 4: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Feature/Access/PersonRolesTest.php`
Ожидается: PASS, 6 тестов.

- [x] **Шаг 5: Коммит**

```bash
composer openapi && git add . && git commit -m "feat(access): global role assignment with last-administrator guard"
```

**Критерии готовности:**
- Инвариант 6.3.1 в части «нельзя снять роль с последнего администратора» закрыт тестом, причём снятие разрешается, как только появился второй носитель.
- Роль служения нельзя выдать как глобальную.
- Смена ролей немедленно отражается в правах аккаунта — тест на инвалидацию кеша обязателен (риск 5 из раздела 15).
- Изменение попадает в журнал с составом до и после.

---

### Задача 10: Настройки церкви через API

**Файлы:**
- Создать: `app/Modules/Settings/Http/Controllers/SettingsController.php`, `Http/Requests/UpdateSettingsRequest.php`, `Policies/SettingsPolicy.php`, `app/Modules/Settings/routes.php`
- Тест: `tests/Feature/Settings/SettingsEndpointTest.php`

**Интерфейсы:**
- Отдаёт наружу: `GET /api/v1/settings` — публичная часть (`church.name`, `church.timezone`), доступна любому активному аккаунту; `PUT /api/v1/settings` — право `settings.manage`, пишет журнал.

- [ ] **Шаг 1: Написать падающие тесты**

```php
<?php

declare(strict_types=1);

use App\Modules\Access\Permission;

it('shows the public settings to any account', function () {
    actingAsUser();

    $this->getJson('/api/v1/settings')
        ->assertOk()
        ->assertJsonStructure(['data' => ['church_name', 'timezone']])
        ->assertJsonMissingPath('data.church.phone_region');
});

it('denies changing settings without settings.manage', function () {
    actingAsUser();

    $this->putJson('/api/v1/settings', ['timezone' => 'Europe/Moscow'])->assertForbidden();
});

it('changes the timezone and the phone region', function () {
    actingAsUserWith([Permission::SettingsManage]);

    $this->putJson('/api/v1/settings', [
        'church_name' => 'Дом хлеба',
        'timezone' => 'Europe/Moscow',
        'phone_region' => 'RU',
    ])->assertOk()->assertJsonPath('data.timezone', 'Europe/Moscow');
});

it('rejects an unknown timezone', function () {
    actingAsUserWith([Permission::SettingsManage]);

    $this->putJson('/api/v1/settings', ['timezone' => 'Mars/Olympus'])
        ->assertStatus(422)->assertJsonValidationErrors('timezone');
});

it('records the change in the journal', function () {
    actingAsUserWith([Permission::SettingsManage]);

    $this->putJson('/api/v1/settings', ['timezone' => 'Europe/Moscow']);

    expect(\App\Modules\Access\Models\AuditEntry::query()->where('action', 'settings.changed')->exists())->toBeTrue();
});
```

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Feature/Settings/SettingsEndpointTest.php`
Ожидается: FAIL.

- [ ] **Шаг 3: Реализовать**

`UpdateSettingsRequest`: `timezone` — `timezone:all`, `phone_region` — `size:2|alpha`, `church_name` — `string|max:100`. Контроллер складывает поля в ключи `church.*` и вызывает `ChurchSettings::put`, затем `AuditLogger::record('settings.changed', null, ['before' => ..., 'after' => ...])`.

- [ ] **Шаг 4: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Feature/Settings`
Ожидается: PASS.

- [ ] **Шаг 5: Коммит**

```bash
composer openapi && git add . && git commit -m "feat(settings): settings endpoints with audit"
```

**Критерии готовности:**
- `GET /settings` отдаёт только название и часовой пояс; регион телефонов наружу не уходит.
- Смена часового пояса требует `settings.manage` и пишется в журнал.
- Неизвестный часовой пояс отвергается валидацией, а не превращается в мусор в базе.

---

## Блок 3. Directory: люди, приглашения, профиль

### Задача 11: Карточка человека — создание, правка, архивация

**Файлы:**
- Создать: `app/Modules/Directory/Actions/CreatePerson.php`, `UpdatePerson.php`, `ArchivePerson.php`, `RestorePerson.php`; `Http/Controllers/PersonController.php`, `Http/Requests/StorePersonRequest.php`, `UpdatePersonRequest.php`, `Http/Resources/PersonResource.php`, `Policies/PersonPolicy.php`; `Events/PersonCreated.php`, `PersonArchived.php`
- Изменить: `app/Modules/Directory/routes.php`
- Тест: `tests/Feature/Directory/PersonCrudTest.php`

**Интерфейсы:**
- Отдаёт наружу: `POST /people`, `GET /people/{id}`, `PATCH /people/{id}`, `POST /people/{id}/archive`, `POST /people/{id}/restore`.
- Отдаёт наружу: `PersonResource` — поля `id`, `last_name`, `first_name`, `patronymic`, `full_name`, `status`, `archived`, `has_account`, `has_global_roles`, и условно `contacts: {phone, email, birth_date, contacts_public}` и `note`. Условные поля наполняет задача 12.
- Отдаёт наружу: `PersonCreated(string $personId)`, `PersonArchived(string $personId)`.
- Коды ошибок: `person.archived` (правка архивного человека).

- [ ] **Шаг 1: Написать падающие тесты**

```php
<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use App\Modules\Directory\Models\Person;

it('denies creating a person without people.manage', function () {
    actingAsUserWith([Permission::PeopleView]);

    $this->postJson('/api/v1/people', ['last_name' => 'Иванов', 'first_name' => 'Иван', 'status' => 'member'])
        ->assertForbidden();
});

it('creates a person with normalised contacts', function () {
    actingAsUserWith([Permission::PeopleManage]);

    $this->postJson('/api/v1/people', [
        'last_name' => 'Иванов',
        'first_name' => 'Иван',
        'patronymic' => 'Петрович',
        'status' => 'member',
        'phone' => '8 912 345 67 89',
        'email' => 'IVAN@Example.COM',
    ])->assertCreated()->assertJsonPath('data.full_name', 'Иванов Иван Петрович');

    $person = Person::query()->sole();
    expect($person->phone)->toBe('+79123456789')->and($person->email)->toBe('ivan@example.com');
});

it('warns about a duplicate phone without blocking', function () {
    actingAsUserWith([Permission::PeopleManage]);
    Person::factory()->create(['phone' => '+79123456789', 'last_name' => 'Петров', 'first_name' => 'Пётр']);

    $this->postJson('/api/v1/people', [
        'last_name' => 'Иванов', 'first_name' => 'Иван', 'status' => 'guest', 'phone' => '+79123456789',
    ])->assertCreated()->assertJsonPath('warnings.0.code', 'person.duplicate_phone');

    expect(Person::query()->count())->toBe(2);
});

it('requires a known status', function () {
    actingAsUserWith([Permission::PeopleManage]);

    $this->postJson('/api/v1/people', ['last_name' => 'Иванов', 'first_name' => 'Иван', 'status' => 'angel'])
        ->assertStatus(422)->assertJsonValidationErrors('status');
});

it('archives a person and keeps the record', function () {
    actingAsUserWith([Permission::PeopleManage, Permission::PeopleView]);
    $person = Person::factory()->create();

    $this->postJson("/api/v1/people/{$person->id}/archive")->assertOk();

    expect($person->fresh()->archived_at)->not->toBeNull();
    $this->getJson("/api/v1/people/{$person->id}")->assertOk()->assertJsonPath('data.archived', true);
});

it('restores an archived person', function () {
    actingAsUserWith([Permission::PeopleManage]);
    $person = Person::factory()->archived()->create();

    $this->postJson("/api/v1/people/{$person->id}/restore")->assertOk();

    expect($person->fresh()->archived_at)->toBeNull();
});

it('refuses to edit an archived person', function () {
    actingAsUserWith([Permission::PeopleManage]);
    $person = Person::factory()->archived()->create();

    $this->patchJson("/api/v1/people/{$person->id}", ['first_name' => 'Пётр'])
        ->assertStatus(422)->assertJsonPath('code', 'person.archived');
});

it('writes archiving to the journal', function () {
    actingAsUserWith([Permission::PeopleManage]);
    $person = Person::factory()->create();

    $this->postJson("/api/v1/people/{$person->id}/archive");

    expect(\App\Modules\Access\Models\AuditEntry::query()->where('action', 'person.archived')->exists())->toBeTrue();
});
```

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Feature/Directory/PersonCrudTest.php`
Ожидается: FAIL.

- [ ] **Шаг 3: Реализовать Actions и предупреждения о дубликатах**

```php
final class CreatePerson
{
    /**
     * @param array<string, mixed> $attributes
     * @return array{person: Person, warnings: list<array{code: string, message: string}>}
     */
    public function handle(array $attributes): array
    {
        $attributes['phone'] = Phone::normalize($attributes['phone'] ?? null);
        $attributes['email'] = isset($attributes['email']) ? mb_strtolower(trim($attributes['email'])) : null;

        $warnings = [];

        if ($attributes['phone'] !== null
            && Person::query()->where('phone', $attributes['phone'])->exists()) {
            $warnings[] = ['code' => 'person.duplicate_phone', 'message' => 'Человек с таким телефоном уже есть.'];
        }

        if ($attributes['email'] !== null
            && Person::query()->where('email', $attributes['email'])->exists()) {
            $warnings[] = ['code' => 'person.duplicate_email', 'message' => 'Человек с такой почтой уже есть.'];
        }

        $person = Person::query()->create($attributes);
        app(AuditLogger::class)->record('person.created', $person);
        PersonCreated::dispatch($person->id);

        return ['person' => $person, 'warnings' => $warnings];
    }
}
```

`PersonResource` кладёт `warnings` в корень ответа через `additional(['warnings' => $warnings])`.

`ArchivePerson` ставит `archived_at`, пишет журнал, публикует `PersonArchived`. `UpdatePerson` бросает `person.archived`, если `archived_at` задан.

- [ ] **Шаг 4: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Feature/Directory/PersonCrudTest.php`
Ожидается: PASS, 8 тестов.

- [ ] **Шаг 5: Коммит**

```bash
composer openapi && git add . && git commit -m "feat(directory): person card create, update, archive, restore"
```

**Критерии готовности:**
- Телефон приводится к E.164, почта к нижнему регистру на входе, а не при отображении.
- Дубликат телефона или почты даёт `warnings` в успешном ответе и не блокирует создание (раздел 5.2, риск 8).
- Архивный человек остаётся доступен по прямой ссылке и помечен `archived: true`; правка его запрещена.
- Архивация и восстановление попадают в журнал.

---

### Задача 12: Список, поиск и видимость контактов

**Файлы:**
- Создать: `app/Modules/Directory/PersonVisibility.php`, `Contracts/SharedMinistryFinder.php`, `NoSharedMinistryFinder.php`, `Http/Queries/PersonIndexQuery.php`
- Изменить: `PersonController` (метод `index`), `PersonResource` (условные поля), `AppServiceProvider`
- Тест: `tests/Feature/Directory/PersonIndexTest.php`, `tests/Feature/Directory/PersonVisibilityTest.php`

**Интерфейсы:**
- Отдаёт наружу: `GET /people?search&status&archived&without_roles&page&per_page` — постраничная пагинация, по умолчанию архивные скрыты.
- Отдаёт наружу: `PersonVisibility::canSeeContacts(User $viewer, Person $person): bool`, `canSeeNotes(User $viewer, Person $person): bool`. Заметку видит носитель `people.view_notes`, но не о самом себе: «сам человек свою заметку не видит» (CONTEXT.md, «Заметка»).
- Отдаёт наружу: `interface SharedMinistryFinder { /** @return list<string> */ public function sharedMinistryIds(string $viewerPersonId, string $subjectPersonId): array; }`. Здесь связан с `NoSharedMinistryFinder` (пустой список); задача 19 подменяет реализацию, фильтр `?ministry=` добавляет задача 17.

- [ ] **Шаг 1: Написать падающие тесты**

`tests/Feature/Directory/PersonIndexTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Directory\Models\Person;

it('denies the directory without people.view', function () {
    actingAsUser();

    $this->getJson('/api/v1/people')->assertForbidden();
});

it('hides archived people by default', function () {
    actingAsUserWith([Permission::PeopleView]);
    $active = Person::factory()->create();
    $archived = Person::factory()->archived()->create();

    $ids = collect($this->getJson('/api/v1/people')->assertOk()->json('data'))->pluck('id');

    expect($ids)->toContain($active->id)->not->toContain($archived->id);
});

it('finds a person by a misspelled surname', function () {
    actingAsUserWith([Permission::PeopleView]);
    Person::factory()->create(['last_name' => 'Прокопенко', 'first_name' => 'Мария']);

    $this->getJson('/api/v1/people?search=прокопенк')
        ->assertOk()
        ->assertJsonPath('data.0.last_name', 'Прокопенко');
});

it('filters by status', function () {
    actingAsUserWith([Permission::PeopleView]);
    Person::factory()->create(['status' => 'guest']);

    $this->getJson('/api/v1/people?status=guest')->assertOk()->assertJsonCount(1, 'data');
});

it('shows archived people on demand', function () {
    actingAsUserWith([Permission::PeopleView]);
    Person::factory()->archived()->create();

    $this->getJson('/api/v1/people?archived=1')->assertOk()->assertJsonCount(1, 'data');
});

it('filters people without global roles', function () {
    actingAsUserWith([Permission::PeopleView]);
    $withRole = Person::factory()->create();
    $withRole->globalRoles()->attach(Role::factory()->global()->create());
    Person::factory()->create();

    $response = $this->getJson('/api/v1/people?without_roles=1')->assertOk();

    expect(collect($response->json('data'))->pluck('id'))->not->toContain($withRole->id);
});

it('paginates', function () {
    actingAsUserWith([Permission::PeopleView]);
    Person::factory()->count(30)->create();

    $this->getJson('/api/v1/people?per_page=10')
        ->assertOk()
        ->assertJsonCount(10, 'data')
        ->assertJsonStructure(['meta' => ['current_page', 'last_page', 'total']]);
});
```

`tests/Feature/Directory/PersonVisibilityTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use App\Modules\Directory\Models\Person;

it('hides contacts from a viewer with only people.view', function () {
    actingAsUserWith([Permission::PeopleView]);
    $person = Person::factory()->create(['phone' => '+79123456789', 'contacts_public' => false]);

    $this->getJson("/api/v1/people/{$person->id}")
        ->assertOk()
        ->assertJsonMissingPath('data.contacts');
});

it('shows contacts with people.view_contacts', function () {
    actingAsUserWith([Permission::PeopleView, Permission::PeopleViewContacts]);
    $person = Person::factory()->create(['phone' => '+79123456789']);

    $this->getJson("/api/v1/people/{$person->id}")
        ->assertOk()
        ->assertJsonPath('data.contacts.phone', '+79123456789');
});

it('shows contacts the person made public', function () {
    actingAsUserWith([Permission::PeopleView]);
    $person = Person::factory()->create(['phone' => '+79123456789', 'contacts_public' => true]);

    $this->getJson("/api/v1/people/{$person->id}")->assertJsonPath('data.contacts.phone', '+79123456789');
});

it('always shows a person their own contacts', function () {
    $person = Person::factory()->create(['phone' => '+79123456789', 'contacts_public' => false]);
    actingAsUserWith([], $person);

    $this->getJson("/api/v1/people/{$person->id}")->assertJsonPath('data.contacts.phone', '+79123456789');
});

it('hides notes without people.view_notes', function () {
    actingAsUserWith([Permission::PeopleView]);
    $person = Person::factory()->create(['note' => 'Нужна помощь с переездом']);

    $this->getJson("/api/v1/people/{$person->id}")->assertJsonMissingPath('data.note');
});

it('hides a person their own note even with people.view_notes', function () {
    $person = Person::factory()->create(['note' => 'Нужна помощь с переездом']);
    actingAsUserWith([Permission::PeopleView, Permission::PeopleViewNotes], $person);

    $this->getJson("/api/v1/people/{$person->id}")->assertOk()->assertJsonMissingPath('data.note');
});

it('shows notes about other people with people.view_notes', function () {
    actingAsUserWith([Permission::PeopleView, Permission::PeopleViewNotes]);
    $person = Person::factory()->create(['note' => 'Нужна помощь с переездом']);

    $this->getJson("/api/v1/people/{$person->id}")->assertJsonPath('data.note', 'Нужна помощь с переездом');
});
```

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Feature/Directory`
Ожидается: FAIL.

- [ ] **Шаг 3: Реализовать видимость**

```php
final class PersonVisibility
{
    public function __construct(
        private readonly PermissionResolver $permissions,
        private readonly SharedMinistryFinder $ministries,
    ) {}

    public function canSeeContacts(User $viewer, Person $person): bool
    {
        if ($viewer->person_id === $person->id) {
            return true;
        }

        if ($this->permissions->can($viewer, Permission::PeopleViewContacts)) {
            return true;
        }

        if ($person->contacts_public) {
            return true;
        }

        foreach ($this->ministries->sharedMinistryIds($viewer->person_id, $person->id) as $ministryId) {
            if ($this->permissions->canInMinistry($viewer, Permission::MembersViewContacts, $ministryId)) {
                return true;
            }
        }

        return false;
    }

    public function canSeeNotes(User $viewer, Person $person): bool
    {
        if ($viewer->person_id === $person->id) {
            return false;
        }

        return $this->permissions->can($viewer, Permission::PeopleViewNotes);
    }
}
```

- [ ] **Шаг 4: Реализовать список**

Поиск через уже созданный GIN-индекс:

```php
$query->when($search !== null, fn ($q) => $q->whereRaw(
    "lower(last_name || ' ' || first_name) % ?", [mb_strtolower($search)]
)->orderByRaw("similarity(lower(last_name || ' ' || first_name), ?) desc", [mb_strtolower($search)]));
```

`without_roles`: `whereNotExists` по `person_roles`. По умолчанию `whereNull('archived_at')`.

- [ ] **Шаг 5: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Feature/Directory`
Ожидается: PASS, 13 тестов.

- [ ] **Шаг 6: Коммит**

```bash
composer openapi && git add . && git commit -m "feat(directory): people index with trigram search and contact visibility"
```

**Критерии готовности:**
- Поиск находит человека по неполной и слегка неверной фамилии (триграммы), а не только по префиксу.
- Все четыре условия видимости контактов из раздела 6.4 закрыты тестами; условие «общее служение» подключается задачей 19 без правки этой задачи.
- Заметка не уходит в ответ без `people.view_notes` и не уходит человеку о нём самом — оба случая проверяются `assertJsonMissingPath`, а не сравнением значения.
- Пагинация постраничная, с `meta.total`.

---

### Задача 13: Приглашения и ссылки сброса пароля

**Файлы:**
- Создать: миграцию `..._000300_create_access_links_table.php`; `app/Modules/Directory/Models/AccessLink.php`, `AccessLinkKind.php`; `Actions/CreateInvitation.php`, `CreatePasswordResetLink.php`, `AcceptAccessLink.php`; `Http/Controllers/AccessLinkController.php`, `InvitationController.php`; `Http/Requests/AcceptAccessLinkRequest.php`; `Events/UserCreated.php`; `database/factories/AccessLinkFactory.php` — фабрика генерирует токен, кладёт в базу его хеш и оставляет открытый токен в свойстве `plain_token` для тестов; состояния `used()`, `expired()`, `revoked()`
- Изменить: `app/Modules/Directory/routes.php`
- Тест: `tests/Feature/Directory/InvitationTest.php`

**Интерфейсы:**
- Отдаёт наружу: `POST /people/{id}/invite` → `201 {"data": {"url": "https://…/invite/{token}", "expires_at": "…"}}`, токен показывается один раз.
- Отдаёт наружу: `POST /people/{id}/password-reset-link` → тот же формат, срок 24 часа.
- Отдаёт наружу: публичные `GET /access-links/{token}` → `{kind, person: {first_name, last_name}, login_hint: {phone, email}}` и `POST /access-links/{token}/accept` с телом `{login, password, password_confirmation}`; для `kind = password_reset` поле `login` не принимается — логин у аккаунта уже есть.
- Отдаёт наружу: `UserCreated(string $userId, string $personId)`.
- Коды ошибок: `invite.person_has_no_global_role`, `invite.person_has_account`, `invite.person_archived`, `access_link.invalid`, `access_link.expired`, `access_link.used`, `login.taken`.
- Решение внутри задачи: создание новой ссылки того же вида помечает прежние неиспользованные ссылки этого человека как отозванные (`revoked_at`). Иначе старая ссылка, разосланная по ошибке, остаётся рабочей.

- [ ] **Шаг 1: Написать падающие тесты**

```php
<?php

declare(strict_types=1);

use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Directory\Models\AccessLink;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;

function personWithRole(array $attributes = []): Person
{
    $person = Person::factory()->create($attributes);
    $person->globalRoles()->attach(Role::factory()->global()->create());

    return $person;
}

it('denies invitations without people.invite', function () {
    actingAsUserWith([Permission::PeopleManage]);

    $this->postJson('/api/v1/people/'.personWithRole()->id.'/invite')->assertForbidden();
});

it('creates an invitation and returns the link once', function () {
    actingAsUserWith([Permission::PeopleInvite]);
    $person = personWithRole();

    $response = $this->postJson("/api/v1/people/{$person->id}/invite")->assertCreated();

    expect($response->json('data.url'))->toContain('/invite/')
        ->and(AccessLink::query()->sole()->token_hash)->not->toBe($response->json('data.url'));
});

it('refuses to invite a person without a global role', function () {
    actingAsUserWith([Permission::PeopleInvite]);
    $person = Person::factory()->create();

    $this->postJson("/api/v1/people/{$person->id}/invite")
        ->assertStatus(422)->assertJsonPath('code', 'invite.person_has_no_global_role');
});

it('refuses to invite a person who already has an account', function () {
    actingAsUserWith([Permission::PeopleInvite]);
    $person = personWithRole();
    User::factory()->for($person)->create();

    $this->postJson("/api/v1/people/{$person->id}/invite")
        ->assertStatus(422)->assertJsonPath('code', 'invite.person_has_account');
});

it('refuses to invite an archived person', function () {
    actingAsUserWith([Permission::PeopleInvite]);
    $person = personWithRole(['archived_at' => now()]);

    $this->postJson("/api/v1/people/{$person->id}/invite")
        ->assertStatus(422)->assertJsonPath('code', 'invite.person_archived');
});

it('revokes the previous unused invitation', function () {
    actingAsUserWith([Permission::PeopleInvite]);
    $person = personWithRole();

    $this->postJson("/api/v1/people/{$person->id}/invite");
    $this->postJson("/api/v1/people/{$person->id}/invite");

    expect(AccessLink::query()->whereNotNull('revoked_at')->count())->toBe(1);
});

it('shows the invited person their name without a session', function () {
    actingAsUserWith([Permission::PeopleInvite]);
    $person = personWithRole(['first_name' => 'Мария', 'phone' => '+79123456789']);
    $url = $this->postJson("/api/v1/people/{$person->id}/invite")->json('data.url');
    $token = str($url)->afterLast('/')->toString();

    auth()->logout();

    $this->getJson("/api/v1/access-links/{$token}")
        ->assertOk()
        ->assertJsonPath('data.person.first_name', 'Мария')
        ->assertJsonPath('data.kind', 'invite')
        ->assertJsonPath('data.login_hint.phone', '+79123456789');
});

it('creates an account from an invitation and logs in', function () {
    actingAsUserWith([Permission::PeopleInvite]);
    $person = personWithRole(['email' => 'maria@example.com']);
    $token = str($this->postJson("/api/v1/people/{$person->id}/invite")->json('data.url'))->afterLast('/')->toString();
    auth()->logout();

    $this->postJson("/api/v1/access-links/{$token}/accept", [
        'login' => 'maria@example.com',
        'password' => 'secret123',
        'password_confirmation' => 'secret123',
    ])->assertCreated();

    $this->assertAuthenticated();
    expect($person->fresh()->user)->not->toBeNull()
        ->and(AccessLink::query()->sole()->used_at)->not->toBeNull();
});

it('refuses a used token', function () {
    $link = AccessLink::factory()->used()->create();

    $this->getJson("/api/v1/access-links/{$link->plain_token}")
        ->assertStatus(422)->assertJsonPath('code', 'access_link.used');
});

it('refuses an expired token', function () {
    $link = AccessLink::factory()->expired()->create();

    $this->getJson("/api/v1/access-links/{$link->plain_token}")
        ->assertStatus(422)->assertJsonPath('code', 'access_link.expired');
});

it('refuses a login already taken by another account', function () {
    actingAsUserWith([Permission::PeopleInvite]);
    User::factory()->create(['email' => 'maria@example.com']);
    $person = personWithRole();
    $token = str($this->postJson("/api/v1/people/{$person->id}/invite")->json('data.url'))->afterLast('/')->toString();
    auth()->logout();

    $this->postJson("/api/v1/access-links/{$token}/accept", [
        'login' => 'maria@example.com',
        'password' => 'secret123',
        'password_confirmation' => 'secret123',
    ])->assertStatus(422)->assertJsonPath('code', 'login.taken');
});

it('resets a password through a reset link', function () {
    actingAsUserWith([Permission::PeopleInvite]);
    $person = personWithRole();
    $user = User::factory()->for($person)->create(['password' => bcrypt('old-password')]);

    $token = str($this->postJson("/api/v1/people/{$person->id}/password-reset-link")->json('data.url'))
        ->afterLast('/')->toString();
    auth()->logout();

    $this->postJson("/api/v1/access-links/{$token}/accept", [
        'password' => 'new-password',
        'password_confirmation' => 'new-password',
    ])->assertOk();

    expect(\Illuminate\Support\Facades\Hash::check('new-password', $user->fresh()->password))->toBeTrue();
});
```

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Feature/Directory/InvitationTest.php`
Ожидается: FAIL.

- [ ] **Шаг 3: Миграция**

```php
Schema::create('access_links', function (Blueprint $table) {
    $table->char('id', 26)->primary();
    $table->char('person_id', 26);
    $table->string('kind', 20);
    $table->string('token_hash', 64)->unique();
    $table->char('created_by_user_id', 26)->nullable();
    $table->timestampTz('expires_at');
    $table->timestampTz('used_at')->nullable();
    $table->timestampTz('revoked_at')->nullable();
    $table->timestampTz('created_at');

    $table->foreign('person_id')->references('id')->on('people')->restrictOnDelete();
});

DB::statement("ALTER TABLE access_links ADD CONSTRAINT access_links_kind_check
    CHECK (kind IN ('invite', 'password_reset'))");
```

- [ ] **Шаг 4: Реализовать создание ссылки**

```php
final class CreateInvitation
{
    /** @return array{link: AccessLink, url: string} */
    public function handle(Person $person): array
    {
        if ($person->archived_at !== null) {
            throw DomainRuleException::because('invite.person_archived', 'Человек архивирован.');
        }

        if ($person->user !== null) {
            throw DomainRuleException::because('invite.person_has_account', 'У человека уже есть аккаунт.');
        }

        if ($person->globalRoles()->doesntExist()) {
            throw DomainRuleException::because(
                'invite.person_has_no_global_role',
                'Сначала выдайте человеку хотя бы одну глобальную роль.'
            );
        }

        AccessLink::query()
            ->where('person_id', $person->id)
            ->where('kind', AccessLinkKind::Invite)
            ->whereNull('used_at')->whereNull('revoked_at')
            ->update(['revoked_at' => now()]);

        $token = Str::random(48);

        $link = AccessLink::query()->create([
            'person_id' => $person->id,
            'kind' => AccessLinkKind::Invite,
            'token_hash' => hash('sha256', $token),
            'created_by_user_id' => auth()->id(),
            'expires_at' => now()->addDays(7),
            'created_at' => now(),
        ]);

        app(AuditLogger::class)->record('person.invited', $person);

        return ['link' => $link, 'url' => config('app.frontend_url')."/invite/{$token}"];
    }
}
```

`AcceptAccessLink` в одной транзакции: находит ссылку по `hash('sha256', $token)`, проверяет `revoked_at`, `used_at`, `expires_at`; для `invite` — нормализует логин, проверяет занятость (`login.taken`), создаёт `User`, помечает ссылку использованной, публикует `UserCreated`, логинит; для `password_reset` — меняет пароль, помечает ссылку, завершает прочие сессии аккаунта.

- [ ] **Шаг 5: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Feature/Directory/InvitationTest.php`
Ожидается: PASS, 12 тестов.

- [ ] **Шаг 6: Коммит**

```bash
composer openapi && git add . && git commit -m "feat(directory): invitations and password reset links"
```

**Критерии готовности:**
- Инвариант 6.3.3 закрыт тремя тестами: без глобальной роли, с аккаунтом, архивированного — не приглашаем.
- В базе лежит только хеш токена; сам токен возвращается один раз в ответе.
- Просроченная, использованная и отозванная ссылки различимы по коду ошибки.
- Приём приглашения создаёт аккаунт, помечает ссылку и сразу логинит — человек не вводит пароль дважды.
- Сброс пароля завершает прочие сессии аккаунта.

---

### Задача 14: Свой профиль, вход, устройства, отключение и включение аккаунта

**Файлы:**
- Создать: `app/Modules/Directory/Http/Controllers/ProfileController.php`, `SessionController.php`; `Http/Requests/UpdateProfileRequest.php`, `UpdateLoginRequest.php`, `UpdatePasswordRequest.php`; `Actions/UpdateOwnProfile.php`, `UpdateOwnLogin.php`, `UpdateOwnPassword.php`, `DisableUser.php`, `EnableUser.php`; `Events/UserDisabled.php`, `Events/UserEnabled.php`
- Изменить: `app/Modules/Directory/routes.php`, `BumpPermissionCache` (подписка на `UserDisabled` и `UserEnabled`)
- Тест: `tests/Feature/Directory/ProfileTest.php`, `tests/Feature/Directory/SessionTest.php`

**Интерфейсы:**
- Отдаёт наружу: `PATCH /me/profile` (`phone`, `email`, `birth_date`, `contacts_public`), `PATCH /me/login` (`login`, `current_password`), `PATCH /me/password` (`current_password`, `password`, `password_confirmation`), `GET /auth/sessions`, `DELETE /auth/sessions/{id}`, `POST /auth/sessions/logout-others`, `POST /people/{id}/disable`, `POST /people/{id}/enable`.
- Решение заказчика (2026-09-12): контакты человека и логины аккаунта — отдельные поля. `PATCH /me/profile` меняет только `people`; логин меняется только через `PATCH /me/login` с текущим паролем. Тип логина определяется по значению: телефон нормализуется в E.164 и пишется в `users.phone`, почта приводится к нижнему регистру и пишется в `users.email`.
- Коды ошибок: `login.taken`, `auth.invalid_password`, `session.current_cannot_be_revoked`, `user.no_account`, `user.not_disabled`.

- [ ] **Шаг 1: Написать падающие тесты**

```php
<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;

it('lets anyone edit their own contacts without permissions and leaves the login alone', function () {
    $user = actingAsUser();
    $login = $user->phone;

    $this->patchJson('/api/v1/me/profile', [
        'phone' => '8 912 345 67 89',
        'birth_date' => '1990-05-01',
        'contacts_public' => true,
    ])->assertOk();

    expect($user->person->fresh()->phone)->toBe('+79123456789')
        ->and($user->fresh()->phone)->toBe($login)
        ->and($user->person->fresh()->contacts_public)->toBeTrue();
});

it('refuses to change the name through the profile', function () {
    actingAsUser();

    $this->patchJson('/api/v1/me/profile', ['last_name' => 'Другой'])
        ->assertStatus(422)->assertJsonValidationErrors('last_name');
});

it('changes the login with the current password and leaves person contacts alone', function () {
    $user = actingAsUser();
    $contactEmail = $user->person->email;

    $this->patchJson('/api/v1/me/login', ['login' => 'New@Example.com', 'current_password' => 'password'])
        ->assertOk();

    expect($user->fresh()->email)->toBe('new@example.com')
        ->and($user->person->fresh()->email)->toBe($contactEmail);
});

it('refuses a login change with a wrong current password', function () {
    actingAsUser();

    $this->patchJson('/api/v1/me/login', ['login' => 'new@example.com', 'current_password' => 'wrong'])
        ->assertStatus(422)->assertJsonPath('code', 'auth.invalid_password');
});

it('refuses a login already taken', function () {
    actingAsUser();
    User::factory()->create(['email' => 'taken@example.com']);

    $this->patchJson('/api/v1/me/login', ['login' => 'taken@example.com', 'current_password' => 'password'])
        ->assertStatus(422)->assertJsonPath('code', 'login.taken');
});

it('changes the password and ends the other sessions', function () {
    $user = actingAsUser();
    $this->getJson('/api/v1/auth/me');
    \DB::table('sessions')->insert([
        'id' => 'other-session', 'user_id' => $user->id, 'ip_address' => '10.0.0.1',
        'user_agent' => 'Other', 'payload' => '', 'last_activity' => time(),
    ]);

    $this->patchJson('/api/v1/me/password', [
        'current_password' => 'password',
        'password' => 'new-secret-123',
        'password_confirmation' => 'new-secret-123',
    ])->assertOk();

    expect(\Hash::check('new-secret-123', $user->fresh()->password))->toBeTrue()
        ->and(\DB::table('sessions')->where('id', 'other-session')->exists())->toBeFalse();
});

it('lists devices', function () {
    actingAsUser();
    $this->getJson('/api/v1/auth/me');

    $this->getJson('/api/v1/auth/sessions')
        ->assertOk()
        ->assertJsonStructure(['data' => [['id', 'ip_address', 'user_agent', 'last_activity', 'current']]]);
});

it('refuses to end the current session from the device list', function () {
    actingAsUser();
    $this->getJson('/api/v1/auth/me');
    $current = session()->getId();

    $this->deleteJson("/api/v1/auth/sessions/{$current}")
        ->assertStatus(422)->assertJsonPath('code', 'session.current_cannot_be_revoked');
});

it('ends all other sessions', function () {
    $user = actingAsUser();
    \DB::table('sessions')->insert([
        'id' => 'other-session', 'user_id' => $user->id, 'ip_address' => '10.0.0.1',
        'user_agent' => 'Other', 'payload' => '', 'last_activity' => time(),
    ]);

    $this->postJson('/api/v1/auth/sessions/logout-others')->assertNoContent();

    expect(\DB::table('sessions')->where('id', 'other-session')->exists())->toBeFalse();
});

it('denies disabling an account without people.invite', function () {
    actingAsUser();
    $person = Person::factory()->has(User::factory())->create();

    $this->postJson("/api/v1/people/{$person->id}/disable")->assertForbidden();
});

it('disables an account, drops its sessions and empties its permissions', function () {
    actingAsUserWith([Permission::PeopleInvite]);
    $person = Person::factory()->create();
    $person->globalRoles()->attach(\App\Modules\Access\Models\Role::factory()->system()->create());
    $victim = User::factory()->for($person)->create();
    \DB::table('sessions')->insert([
        'id' => 'victim-session', 'user_id' => $victim->id, 'ip_address' => '10.0.0.1',
        'user_agent' => 'Phone', 'payload' => '', 'last_activity' => time(),
    ]);

    $this->postJson("/api/v1/people/{$person->id}/disable")->assertOk();

    expect($victim->fresh()->disabled_at)->not->toBeNull()
        ->and(\DB::table('sessions')->where('id', 'victim-session')->exists())->toBeFalse()
        ->and(app(\App\Modules\Access\PermissionResolver::class)->for($victim->fresh())->global)->toBeEmpty();
});

it('refuses to disable a person without an account', function () {
    actingAsUserWith([Permission::PeopleInvite]);
    $person = Person::factory()->create();

    $this->postJson("/api/v1/people/{$person->id}/disable")
        ->assertStatus(422)->assertJsonPath('code', 'user.no_account');
});

it('enables a disabled account again', function () {
    actingAsUserWith([Permission::PeopleInvite]);
    $person = Person::factory()->create();
    $victim = User::factory()->for($person)->create(['disabled_at' => now()]);

    $this->postJson("/api/v1/people/{$person->id}/enable")->assertOk();

    expect($victim->fresh()->disabled_at)->toBeNull();
});

it('refuses to enable an account that is not disabled', function () {
    actingAsUserWith([Permission::PeopleInvite]);
    $person = Person::factory()->has(User::factory())->create();

    $this->postJson("/api/v1/people/{$person->id}/enable")
        ->assertStatus(422)->assertJsonPath('code', 'user.not_disabled');
});
```

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Feature/Directory/ProfileTest.php tests/Feature/Directory/SessionTest.php`
Ожидается: FAIL.

- [ ] **Шаг 3: Реализовать**

`UpdateProfileRequest` принимает только `phone`, `email`, `birth_date`, `contacts_public`; любое другое поле — ошибка валидации (`prohibited`). `UpdateOwnProfile` меняет только `people`: логины аккаунта не трогает.

`UpdateOwnLogin`: проверяет текущий пароль (`auth.invalid_password`), определяет тип логина по значению, нормализует его, проверяет занятость среди `users` (`login.taken`), пишет в `users.phone` или `users.email`, пишет журнал. `UpdateOwnPassword`: проверяет текущий пароль, меняет хеш, удаляет все сессии аккаунта, кроме текущей. Пароль фабрики `User` — `password`, как в стандартной фабрике Laravel; тесты на это опираются.

`DisableUser`: ставит `disabled_at`, удаляет строки `sessions` аккаунта, пишет журнал, публикует `UserDisabled`. Слушатель сбрасывает кеш прав. (Push-подписки удаляются здесь же начиная с фазы 2.) `EnableUser`: для отключённого аккаунта снимает `disabled_at`, пишет журнал, публикует `UserEnabled`; для неотключённого — `422` с `user.not_disabled`.

- [ ] **Шаг 4: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Feature/Directory`
Ожидается: PASS.

- [ ] **Шаг 5: Коммит**

```bash
composer openapi && git add . && git commit -m "feat(directory): own profile, login and password change, device list, account disabling and enabling"
```

**Критерии готовности:**
- Профиль правится без единого права — это «всегда доступный минимум» из раздела 6.1.
- ФИО и статус через профиль не меняются: попытка отвергается валидацией.
- Список устройств показывает текущую сессию с флагом `current`, завершить её из списка нельзя.
- Правка контактов в профиле не меняет логины аккаунта; логин и пароль меняются только с подтверждением текущего пароля.
- Отключённый аккаунт теряет сессии и права немедленно (инвариант 6.3.9).
- Включение возвращает отключённому аккаунту вход без пересоздания; включение неотключённого отвергается кодом `user.not_disabled`.

---

### Задача 15: Команды установки и стирания персональных данных

**Файлы:**
- Создать: `app/Modules/Directory/Console/InstallCommand.php`, `ErasePersonCommand.php`; `app/Modules/Access/Actions/EnsureAdministratorRole.php`
- Тест: `tests/Feature/Directory/InstallCommandTest.php`, `tests/Feature/Directory/ErasePersonTest.php`

**Интерфейсы:**
- Отдаёт наружу: `php artisan app:install` — интерактивно спрашивает название церкви, часовой пояс, регион телефонов, ФИО, телефон или почту первого администратора и пароль. Поддерживает неинтерактивный режим опциями `--church-name`, `--timezone`, `--phone-region`, `--last-name`, `--first-name`, `--login`, `--password` (нужен тестам и деплою).
- Отдаёт наружу: `php artisan people:erase {id}`.

- [ ] **Шаг 1: Написать падающие тесты**

```php
<?php

declare(strict_types=1);

use App\Modules\Access\Models\Role;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use App\Modules\Settings\ChurchSettings;

it('installs settings, the administrator role, a person and an account', function () {
    $this->artisan('app:install', [
        '--church-name' => 'Дом хлеба',
        '--timezone' => 'Europe/Moscow',
        '--phone-region' => 'RU',
        '--last-name' => 'Иванов',
        '--first-name' => 'Иван',
        '--login' => 'ivan@example.com',
        '--password' => 'secret123',
    ])->assertSuccessful();

    expect(app(ChurchSettings::class)->timezone())->toBe('Europe/Moscow')
        ->and(Role::query()->where('is_system', true)->count())->toBe(1)
        ->and(Person::query()->sole()->last_name)->toBe('Иванов')
        ->and(User::query()->sole()->email)->toBe('ivan@example.com');
});

it('creates no roles besides the administrator', function () {
    $this->artisan('app:install', [/* те же опции */])->assertSuccessful();

    expect(Role::query()->count())->toBe(1);
});

it('refuses to run twice', function () {
    $this->artisan('app:install', [/* те же опции */])->assertSuccessful();

    $this->artisan('app:install', [/* те же опции */])->assertFailed();
});

it('erases personal data but keeps the history', function () {
    $person = Person::factory()->create([
        'last_name' => 'Иванов', 'first_name' => 'Иван',
        'phone' => '+79123456789', 'email' => 'ivan@example.com',
        'birth_date' => '1990-01-01', 'note' => 'заметка',
    ]);
    $user = User::factory()->for($person)->create();

    $this->artisan('people:erase', ['id' => $person->id, '--force' => true])->assertSuccessful();

    $person->refresh();
    expect($person->last_name)->toBe('Удалённый человек')
        ->and($person->first_name)->toBe('')
        ->and($person->phone)->toBeNull()
        ->and($person->email)->toBeNull()
        ->and($person->birth_date)->toBeNull()
        ->and($person->note)->toBeNull()
        ->and($person->archived_at)->not->toBeNull()
        ->and(User::query()->find($user->id))->toBeNull();
});

it('writes erasure to the journal without an actor', function () {
    $person = Person::factory()->create();

    $this->artisan('people:erase', ['id' => $person->id, '--force' => true]);

    $entry = \App\Modules\Access\Models\AuditEntry::query()->where('action', 'person.erased')->sole();
    expect($entry->actor_user_id)->toBeNull();
});
```

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Feature/Directory/InstallCommandTest.php tests/Feature/Directory/ErasePersonTest.php`
Ожидается: FAIL.

- [ ] **Шаг 3: Реализовать**

`InstallCommand` в одной транзакции: `ChurchSettings::put`, `EnsureAdministratorRole` (создаёт роль «Администратор», `is_system = true`), `CreatePerson`, `SetPersonRoles`, создание `User` с хешем пароля. Отказ, если системная роль уже существует. Никаких других ролей, людей и настроек не создаётся (ADR-0003).

`ErasePersonCommand` без `--force` запрашивает подтверждение; в интерфейсе операции нет намеренно (раздел 7.9).

- [ ] **Шаг 4: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Feature/Directory`
Ожидается: PASS.

- [ ] **Шаг 5: Коммит**

```bash
git add . && git commit -m "feat(directory): install and erase commands"
```

**Критерии готовности:**
- `app:install` на чистой базе даёт рабочего администратора и ровно одну роль — заготовок нет (ADR-0003).
- Повторный запуск отклоняется, а не создаёт второго администратора.
- `people:erase` обезличивает карточку, удаляет аккаунт и оставляет историю; запись в журнале без актора.
- Неинтерактивный режим работает — он нужен деплою и тестам.

---

## Блок 4. Ministries: служения, состав, роли

### Задача 16: Служение — создание, правка, архивация

**Файлы:**
- Создать: миграции `..._000400_create_ministries_tables.php`, `..._000410_add_ministry_foreign_key_to_roles.php`; `app/Modules/Ministries/Models/Ministry.php`, `MinistryMember.php`, `MinistryMemberRole.php`; `Actions/CreateMinistry.php`, `UpdateMinistry.php`, `ArchiveMinistry.php`; `Http/Controllers/MinistryController.php`, `Http/Requests/MinistryRequest.php`, `Http/Resources/MinistryResource.php`, `Policies/MinistryPolicy.php`; `Events/MinistryCreated.php`, `MinistryArchived.php`; `app/Modules/Ministries/routes.php`
- Создать: `database/factories/MinistryFactory.php`
- Тест: `tests/Feature/Ministries/MinistryCrudTest.php`

**Интерфейсы:**
- Отдаёт наружу: `GET /ministries`, `POST /ministries`, `GET /ministries/{id}`, `PATCH /ministries/{id}`, `POST /ministries/{id}/archive`.
- Отдаёт наружу: `CreateMinistry::handle(string $name, ?string $description): Ministry` — в одной транзакции создаёт служение, роль «Лидер» со всеми правами служения, роль «Участник» без прав и ставит «Участника» ролью по умолчанию. Создатель участником не становится.
- Отдаёт наружу: `Ministry::defaultRole(): BelongsTo`, `Ministry::roles(): HasMany`, `Ministry::members(): HasMany`.
- Напоминание: колонка `chat_id` в фазе 1 не создаётся, чат появляется в фазе 4 (решение планирования 1).

- [ ] **Шаг 1: Написать падающие тесты**

```php
<?php

declare(strict_types=1);

use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Access\PermissionScope;
use App\Modules\Access\RoleScope;
use App\Modules\Ministries\Models\Ministry;

it('denies creating a ministry without ministries.create', function () {
    actingAsUser();

    $this->postJson('/api/v1/ministries', ['name' => 'Прославление'])->assertForbidden();
});

it('creates a ministry with a leader role and a default member role', function () {
    actingAsUserWith([Permission::MinistriesCreate]);

    $this->postJson('/api/v1/ministries', ['name' => 'Прославление'])
        ->assertCreated()
        ->assertJsonPath('data.name', 'Прославление');

    $ministry = Ministry::query()->sole();
    $roles = Role::query()->where('ministry_id', $ministry->id)->get();

    expect($roles->pluck('name')->all())->toEqualCanonicalizing(['Лидер', 'Участник'])
        ->and($ministry->defaultRole->name)->toBe('Участник')
        ->and($roles->firstWhere('name', 'Лидер')->permissions)
            ->toHaveCount(count(Permission::ofScope(PermissionScope::Ministry)))
        ->and($roles->firstWhere('name', 'Участник')->permissions)->toHaveCount(0);
});

it('does not make the creator a member', function () {
    actingAsUserWith([Permission::MinistriesCreate]);

    $this->postJson('/api/v1/ministries', ['name' => 'Прославление']);

    expect(Ministry::query()->sole()->members)->toBeEmpty();
});

it('creates ministry-scoped roles, not global ones', function () {
    actingAsUserWith([Permission::MinistriesCreate]);

    $this->postJson('/api/v1/ministries', ['name' => 'Прославление']);

    expect(Role::query()->where('scope', RoleScope::Ministry)->count())->toBe(2)
        ->and(Role::query()->where('scope', RoleScope::Global)->where('name', 'Лидер')->exists())->toBeFalse();
});

it('refuses a duplicate name among active ministries', function () {
    actingAsUserWith([Permission::MinistriesCreate]);
    Ministry::factory()->create(['name' => 'Прославление']);

    $this->postJson('/api/v1/ministries', ['name' => 'Прославление'])
        ->assertStatus(422)->assertJsonPath('code', 'ministry.name_taken');
});

it('allows reusing the name of an archived ministry', function () {
    actingAsUserWith([Permission::MinistriesCreate]);
    Ministry::factory()->archived()->create(['name' => 'Прославление']);

    $this->postJson('/api/v1/ministries', ['name' => 'Прославление'])->assertCreated();
});

it('denies editing a ministry without ministry.edit in it', function () {
    actingAsUser();
    $ministry = Ministry::factory()->create();

    $this->patchJson("/api/v1/ministries/{$ministry->id}", ['name' => 'Другое'])->assertForbidden();
});

it('lets ministries.manage_all edit any ministry', function () {
    actingAsUserWith([Permission::MinistriesManageAll]);
    $ministry = Ministry::factory()->create();

    $this->patchJson("/api/v1/ministries/{$ministry->id}", ['description' => 'Служение прославления'])
        ->assertOk();
});

it('archives a ministry and hides it from the list', function () {
    actingAsUserWith([Permission::MinistriesCreate, Permission::MinistriesViewAll]);
    $ministry = Ministry::factory()->create();

    $this->postJson("/api/v1/ministries/{$ministry->id}/archive")->assertOk();

    $ids = collect($this->getJson('/api/v1/ministries')->json('data'))->pluck('id');
    expect($ids)->not->toContain($ministry->id)
        ->and($ministry->fresh()->archived_at)->not->toBeNull();
});

it('shows a member only their own ministries in the list', function () {
    $ministry = Ministry::factory()->create();
    Ministry::factory()->create();
    $user = actingAsUser();
    memberOf($ministry, $user->person);

    $ids = collect($this->getJson('/api/v1/ministries')->json('data'))->pluck('id');
    expect($ids)->toEqual([$ministry->id]);
});

it('shows every ministry to ministries.view_all', function () {
    actingAsUserWith([Permission::MinistriesViewAll]);
    Ministry::factory()->count(2)->create();

    expect($this->getJson('/api/v1/ministries')->json('data'))->toHaveCount(2);
});
```

Хелпер `memberOf(Ministry $ministry, Person $person, array $roleIds = []): MinistryMember` добавляется в `tests/Pest.php` в задаче 17; в этой задаче он объявляется минимально — создаёт `ministry_members` и выдаёт роль по умолчанию.

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Feature/Ministries/MinistryCrudTest.php`
Ожидается: FAIL.

- [ ] **Шаг 3: Миграции**

```php
Schema::create('ministries', function (Blueprint $table) {
    $table->char('id', 26)->primary();
    $table->string('name', 100);
    $table->text('description')->nullable();
    $table->char('cover_media_id', 26)->nullable();     // FK добавит задача 23
    $table->char('default_role_id', 26)->nullable();    // в коде обязателен, раздел 5.3
    $table->timestampTz('archived_at')->nullable();
    $table->timestampsTz();

    $table->foreign('default_role_id')->references('id')->on('roles')->restrictOnDelete();
});

DB::statement('CREATE UNIQUE INDEX ministries_active_name_idx ON ministries (name) WHERE archived_at IS NULL');

Schema::create('ministry_members', function (Blueprint $table) {
    $table->char('id', 26)->primary();
    $table->char('ministry_id', 26);
    $table->char('person_id', 26);
    $table->timestampTz('joined_at');
    $table->char('added_by_user_id', 26)->nullable();

    $table->unique(['ministry_id', 'person_id']);
    $table->unique(['id', 'ministry_id']);
    $table->foreign('ministry_id')->references('id')->on('ministries')->restrictOnDelete();
    $table->foreign('person_id')->references('id')->on('people')->restrictOnDelete();
});

Schema::create('ministry_member_roles', function (Blueprint $table) {
    $table->char('member_id', 26);
    $table->char('role_id', 26);
    $table->char('ministry_id', 26);
    $table->primary(['member_id', 'role_id']);
});

// Составные ключи: роль участника всегда роль его же служения (инвариант 6.3.8)
DB::statement('ALTER TABLE ministry_member_roles ADD CONSTRAINT mmr_member_fk
    FOREIGN KEY (member_id, ministry_id) REFERENCES ministry_members (id, ministry_id) ON DELETE RESTRICT');
DB::statement('ALTER TABLE ministry_member_roles ADD CONSTRAINT mmr_role_fk
    FOREIGN KEY (role_id, ministry_id) REFERENCES roles (id, ministry_id) ON DELETE RESTRICT');
```

Отдельной миграцией:

```php
DB::statement('ALTER TABLE roles ADD CONSTRAINT roles_ministry_fk
    FOREIGN KEY (ministry_id) REFERENCES ministries (id) ON DELETE RESTRICT');
```

- [ ] **Шаг 4: Реализовать `CreateMinistry`**

```php
final class CreateMinistry
{
    public function handle(string $name, ?string $description = null): Ministry
    {
        if (Ministry::query()->whereNull('archived_at')->where('name', $name)->exists()) {
            throw DomainRuleException::because('ministry.name_taken', 'Служение с таким названием уже есть.');
        }

        $ministry = DB::transaction(function () use ($name, $description) {
            $ministry = Ministry::query()->create(['name' => $name, 'description' => $description]);

            app(CreateRole::class)->handle(
                RoleScope::Ministry, $ministry->id, 'Лидер', null,
                Permission::ofScope(PermissionScope::Ministry)
            );

            $member = app(CreateRole::class)->handle(
                RoleScope::Ministry, $ministry->id, 'Участник', null, []
            );

            $ministry->forceFill(['default_role_id' => $member->id])->save();

            return $ministry;
        });

        app(AuditLogger::class)->record('ministry.created', $ministry);
        MinistryCreated::dispatch($ministry->id);

        return $ministry->refresh();
    }
}
```

Список служений: участникам — свои, носителям `ministries.view_all` и администратору — все. `MinistryPolicy::update` опирается на `canInMinistry($user, Permission::MinistryEdit, $ministry->id)`.

- [ ] **Шаг 5: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Feature/Ministries/MinistryCrudTest.php`
Ожидается: PASS, 11 тестов.

- [ ] **Шаг 6: Коммит**

```bash
composer openapi && git add . && git commit -m "feat(ministries): ministry creation with leader and member roles"
```

**Критерии готовности:**
- Создание служения одной транзакцией даёт две роли служения и заполненный `default_role_id`; при падении в середине не остаётся служения без ролей.
- Обе роли обычные: и «Лидер», и «Участник» переименовываются и редактируются (проверит задача 18).
- Создатель не становится участником (раздел 7.3).
- Имя уникально среди активных, архивное имя переиспользуется.
- Составные внешние ключи стоят в базе — инвариант 6.3.8 держится и в обход приложения.

---

### Задача 17: Состав служения

**Файлы:**
- Создать: `app/Modules/Ministries/Actions/AddMember.php`, `RemoveMember.php`, `SetMemberRoles.php`; `Http/Controllers/MinistryMemberController.php`, `Http/Resources/MemberResource.php`; `Events/MemberAdded.php`, `MemberRemoved.php`, `MemberRolesChanged.php`
- Изменить: `app/Modules/Ministries/routes.php`, `PersonIndexQuery` (фильтр `?ministry=`), `tests/Pest.php` (`memberOf`)
- Тест: `tests/Feature/Ministries/MembershipTest.php`

**Интерфейсы:**
- Отдаёт наружу: `GET /ministries/{id}/members`, `POST /ministries/{id}/members` (`person_id`, `role_ids` необязателен), `PUT /ministries/{id}/members/{memberId}/roles`, `DELETE /ministries/{id}/members/{memberId}`.
- Отдаёт наружу: `GET /people?ministry={ministryId}` — фильтр справочника по служению.
- Отдаёт наружу: `MemberAdded(string $ministryId, string $personId, ?string $userId)`, `MemberRemoved(...)`, `MemberRolesChanged(...)` — в фазе 4 их слушает Chat.
- Коды ошибок: `member.already_in_ministry`, `member.last_role_cannot_be_removed`, `member.role_from_other_ministry`, `member.person_archived`.

- [ ] **Шаг 1: Написать падающие тесты**

```php
<?php

declare(strict_types=1);

use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Directory\Models\Person;
use App\Modules\Ministries\Models\Ministry;

it('denies managing members without members.manage', function () {
    $ministry = ministryWithRoles();
    $user = actingAsUser();
    memberOf($ministry, $user->person);

    $this->postJson("/api/v1/ministries/{$ministry->id}/members", ['person_id' => Person::factory()->create()->id])
        ->assertForbidden();
});

it('adds a member with the default role', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::MinistriesManageAll]);
    $person = Person::factory()->create();

    $this->postJson("/api/v1/ministries/{$ministry->id}/members", ['person_id' => $person->id])
        ->assertCreated()
        ->assertJsonPath('data.roles.0.name', 'Участник');
});

it('adds a member with extra roles on top of the default one', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::MinistriesManageAll]);
    $leader = $ministry->roles()->where('name', 'Лидер')->sole();
    $person = Person::factory()->create();

    $this->postJson("/api/v1/ministries/{$ministry->id}/members", [
        'person_id' => $person->id,
        'role_ids' => [$leader->id],
    ])->assertCreated();

    $member = $ministry->members()->where('person_id', $person->id)->sole();
    expect($member->roles->pluck('name')->all())->toEqualCanonicalizing(['Участник', 'Лидер']);
});

it('refuses to add the same person twice', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::MinistriesManageAll]);
    $person = Person::factory()->create();
    memberOf($ministry, $person);

    $this->postJson("/api/v1/ministries/{$ministry->id}/members", ['person_id' => $person->id])
        ->assertStatus(422)->assertJsonPath('code', 'member.already_in_ministry');
});

it('refuses to add an archived person', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::MinistriesManageAll]);

    $this->postJson("/api/v1/ministries/{$ministry->id}/members", [
        'person_id' => Person::factory()->archived()->create()->id,
    ])->assertStatus(422)->assertJsonPath('code', 'member.person_archived');
});

it('refuses a role from another ministry', function () {
    $ministry = ministryWithRoles();
    $other = ministryWithRoles('Молодёжное');
    actingAsUserWith([Permission::MinistriesManageAll]);
    $person = Person::factory()->create();
    $member = memberOf($ministry, $person);

    $this->putJson("/api/v1/ministries/{$ministry->id}/members/{$member->id}/roles", [
        'role_ids' => [$other->default_role_id],
    ])->assertStatus(422)->assertJsonPath('code', 'member.role_from_other_ministry');
});

it('refuses to strip a member of their last role', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::MinistriesManageAll]);
    $member = memberOf($ministry, Person::factory()->create());

    $this->putJson("/api/v1/ministries/{$ministry->id}/members/{$member->id}/roles", ['role_ids' => []])
        ->assertStatus(422)->assertJsonPath('code', 'member.last_role_cannot_be_removed');
});

it('removes a member', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::MinistriesManageAll]);
    $member = memberOf($ministry, Person::factory()->create());

    $this->deleteJson("/api/v1/ministries/{$ministry->id}/members/{$member->id}")->assertNoContent();

    expect($ministry->members()->count())->toBe(0);
});

it('filters the directory by ministry', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::PeopleView]);
    $inside = Person::factory()->create();
    $outside = Person::factory()->create();
    memberOf($ministry, $inside);

    $ids = collect($this->getJson("/api/v1/people?ministry={$ministry->id}")->json('data'))->pluck('id');

    expect($ids)->toContain($inside->id)->not->toContain($outside->id);
});

it('writes membership changes to the journal', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::MinistriesManageAll]);

    $this->postJson("/api/v1/ministries/{$ministry->id}/members", ['person_id' => Person::factory()->create()->id]);

    expect(\App\Modules\Access\Models\AuditEntry::query()->where('action', 'member.added')->exists())->toBeTrue();
});
```

- [ ] **Шаг 2: Дописать хелперы в `tests/Pest.php`**

```php
function ministryWithRoles(string $name = 'Прославление'): Ministry
{
    return app(CreateMinistry::class)->handle($name, null);
}

/** @param list<string> $roleIds */
function memberOf(Ministry $ministry, Person $person, array $roleIds = []): MinistryMember
{
    return app(AddMember::class)->handle($ministry, $person, $roleIds);
}
```

- [ ] **Шаг 3: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Feature/Ministries/MembershipTest.php`
Ожидается: FAIL.

- [ ] **Шаг 4: Реализовать Actions**

```php
final class AddMember
{
    /** @param list<string> $roleIds дополнительные роли сверх роли по умолчанию */
    public function handle(Ministry $ministry, Person $person, array $roleIds = []): MinistryMember
    {
        if ($person->archived_at !== null) {
            throw DomainRuleException::because('member.person_archived', 'Человек архивирован.');
        }

        if ($ministry->members()->where('person_id', $person->id)->exists()) {
            throw DomainRuleException::because('member.already_in_ministry', 'Человек уже в служении.');
        }

        $member = DB::transaction(function () use ($ministry, $person, $roleIds) {
            $member = $ministry->members()->create([
                'person_id' => $person->id,
                'joined_at' => now(),
                'added_by_user_id' => auth()->id(),
            ]);

            $this->attachRoles($ministry, $member, array_unique([$ministry->default_role_id, ...$roleIds]));

            return $member;
        });

        app(AuditLogger::class)->record('member.added', $member, ['ministry_id' => $ministry->id]);
        MemberAdded::dispatch($ministry->id, $person->id, $person->user?->id);

        return $member->load('roles');
    }
}
```

`SetMemberRoles` проверяет непустой список (`member.last_role_cannot_be_removed`) и принадлежность каждой роли этому служению (`member.role_from_other_ministry`), затем переписывает `ministry_member_roles` и публикует `MemberRolesChanged`.

Политика: `canInMinistry($user, Permission::MembersManage, $ministry->id)`.

- [ ] **Шаг 5: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Feature/Ministries/MembershipTest.php`
Ожидается: PASS, 10 тестов. Все проверки прав здесь идут от `ministries.manage_all`: право через участие в служении включает задача 19, туда же вынесены его тесты.

- [ ] **Шаг 6: Коммит**

```bash
composer openapi && git add . && git commit -m "feat(ministries): membership with default role and role invariants"
```

**Критерии готовности:**
- Новый участник получает роль по умолчанию автоматически, дополнительные роли выдаются тем же запросом (раздел 7.3).
- Инвариант 6.3.5 закрыт: последнюю роль снять нельзя.
- Роль чужого служения отвергается приложением понятной ошибкой, а не ошибкой внешнего ключа.
- `GET /people?ministry=` работает — этот фильтр обещан разделом 8.
- Добавление и исключение участника попадают в журнал.

---

### Задача 18: Роли служения и роль по умолчанию

**Файлы:**
- Изменить: `app/Modules/Access/Actions/DeleteRole.php` (блокировка по последней роли участника), `RoleUsageCollector.php`, `Policies/RolePolicy.php`, `app/Modules/Ministries/Actions/UpdateMinistry.php` (смена `default_role_id`)
- Создать: `app/Modules/Ministries/Http/Controllers/MinistryRoleController.php`
- Тест: `tests/Feature/Ministries/MinistryRoleTest.php`

**Интерфейсы:**
- Отдаёт наружу: `GET /ministries/{id}/roles`, `POST /ministries/{id}/roles`; правка и удаление роли служения идут по общим `PATCH /roles/{id}` и `DELETE /roles/{id}` из задачи 8.
- Отдаёт наружу: смена роли по умолчанию — `PATCH /ministries/{id}` с полем `default_role_id`.
- Коды ошибок: `role.is_default` (удаление роли по умолчанию), `role.last_role_of_member` (удаление роли, которая у кого-то единственная), `role.default_from_other_ministry`.

- [ ] **Шаг 1: Написать падающие тесты**

```php
<?php

declare(strict_types=1);

use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Directory\Models\Person;

it('denies the ministry role editor without roles.manage in that ministry', function () {
    $ministry = ministryWithRoles();
    $user = actingAsUser();
    memberOf($ministry, $user->person);

    $this->postJson("/api/v1/ministries/{$ministry->id}/roles", ['name' => 'Вокалист', 'permissions' => []])
        ->assertForbidden();
});

it('creates a ministry role without permissions', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::MinistriesManageAll]);

    $this->postJson("/api/v1/ministries/{$ministry->id}/roles", ['name' => 'Вокалист', 'permissions' => []])
        ->assertCreated()->assertJsonPath('data.name', 'Вокалист');
});

it('refuses a global permission on a ministry role', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::MinistriesManageAll]);

    $this->postJson("/api/v1/ministries/{$ministry->id}/roles", [
        'name' => 'Вокалист', 'permissions' => ['people.manage'],
    ])->assertStatus(422)->assertJsonPath('code', 'role.permission_scope_mismatch');
});

it('allows renaming and re-permissioning the leader role', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::MinistriesManageAll]);
    $leader = $ministry->roles()->where('name', 'Лидер')->sole();

    $this->patchJson("/api/v1/roles/{$leader->id}", ['name' => 'Ответственный', 'permissions' => ['members.manage']])
        ->assertOk();

    expect($leader->fresh()->name)->toBe('Ответственный')
        ->and($leader->fresh()->permissions)->toHaveCount(1);
});

it('refuses to delete the default role', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::MinistriesManageAll]);

    $this->deleteJson("/api/v1/roles/{$ministry->default_role_id}")
        ->assertStatus(422)->assertJsonPath('code', 'role.is_default');
});

it('allows deleting the former default role after another is chosen', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::MinistriesManageAll]);
    $old = $ministry->default_role_id;
    $new = $this->postJson("/api/v1/ministries/{$ministry->id}/roles", ['name' => 'Новичок', 'permissions' => []])
        ->json('data.id');

    $this->patchJson("/api/v1/ministries/{$ministry->id}", ['default_role_id' => $new])->assertOk();
    $this->deleteJson("/api/v1/roles/{$old}")->assertNoContent();
});

it('refuses a default role from another ministry', function () {
    $ministry = ministryWithRoles();
    $other = ministryWithRoles('Молодёжное');
    actingAsUserWith([Permission::MinistriesManageAll]);

    $this->patchJson("/api/v1/ministries/{$ministry->id}", ['default_role_id' => $other->default_role_id])
        ->assertStatus(422)->assertJsonPath('code', 'role.default_from_other_ministry');
});

it('refuses to delete a role that is someones only role', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::MinistriesManageAll]);
    $solo = Role::query()->create([
        'scope' => 'ministry', 'ministry_id' => $ministry->id, 'name' => 'Звукорежиссёр',
    ]);
    $member = memberOf($ministry, Person::factory()->create(), [$solo->id]);
    $member->roles()->where('role_id', $ministry->default_role_id)->delete();

    $this->deleteJson("/api/v1/roles/{$solo->id}")
        ->assertStatus(422)->assertJsonPath('code', 'role.last_role_of_member');
});

it('reports carriers of a ministry role in usage', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::MinistriesManageAll]);
    memberOf($ministry, Person::factory()->create());

    $this->getJson("/api/v1/roles/{$ministry->default_role_id}/usage")
        ->assertOk()->assertJsonPath('data.carriers', 1);
});

it('keeps ministry role names unique inside the ministry only', function () {
    $ministry = ministryWithRoles();
    $other = ministryWithRoles('Молодёжное');
    actingAsUserWith([Permission::MinistriesManageAll]);

    $this->postJson("/api/v1/ministries/{$other->id}/roles", ['name' => 'Лидер', 'permissions' => []])
        ->assertStatus(422)->assertJsonPath('code', 'role.name_taken');

    $this->postJson("/api/v1/ministries/{$ministry->id}/roles", ['name' => 'Вокалист', 'permissions' => []])
        ->assertCreated();
});
```

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Feature/Ministries/MinistryRoleTest.php`
Ожидается: FAIL.

- [ ] **Шаг 3: Расширить `RoleUsageCollector` и `DeleteRole`**

```php
final class RoleUsageCollector
{
    /** @return array{carriers: int, blockers: list<array{type: string, id: string, title: string}>} */
    public function for(Role $role): array
    {
        if ($role->scope === RoleScope::Global) {
            return [
                'carriers' => PersonRole::query()->where('role_id', $role->id)->count(),
                'blockers' => [],
            ];
        }

        $blockers = [];

        if (Ministry::query()->where('default_role_id', $role->id)->exists()) {
            $blockers[] = ['type' => 'default_role', 'id' => $role->ministry_id, 'title' => 'Роль по умолчанию'];
        }

        foreach ($this->membersWhoseOnlyRoleItIs($role) as $member) {
            $blockers[] = [
                'type' => 'last_role_of_member',
                'id' => $member->id,
                'title' => $member->person->fullName(),
            ];
        }

        return [
            'carriers' => MinistryMemberRole::query()->where('role_id', $role->id)->count(),
            'blockers' => $blockers,
        ];
    }
}
```

`DeleteRole` выбирает код ошибки по типу первой блокировки: `default_role` → `role.is_default`, `last_role_of_member` → `role.last_role_of_member`, всё прочее (появится в фазе 3) → `role.in_use`.

- [ ] **Шаг 4: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Feature/Ministries`
Ожидается: PASS.

- [ ] **Шаг 5: Коммит**

```bash
composer openapi && git add . && git commit -m "feat(ministries): ministry role editor and default role"
```

**Критерии готовности:**
- Инвариант 6.3.4 закрыт: роль по умолчанию не удаляется, пока она по умолчанию; после смены — удаляется.
- Роли «Лидер» и «Участник» переименовываются и урезаются как обычные — заготовками они не заперты.
- Удаление роли, которая у участника единственная, блокируется с указанием, у кого именно (риск 9 из раздела 15 смягчается тем же ответом `usage`).
- Имена ролей уникальны внутри служения и не конфликтуют между служениями.
- `GET /roles/{id}/usage` считает носителей и для ролей служения.

---

### Задача 19: Права внутри служения и покрытие политик

**Файлы:**
- Создать: `app/Modules/Ministries/Access/DatabaseMinistryPermissionSource.php`, `DatabaseSharedMinistryFinder.php`; `app/Modules/Ministries/Listeners/BumpMembershipPermissionCache.php`
- Изменить: `AppServiceProvider` (подмена привязок `MinistryPermissionSource` и `SharedMinistryFinder`)
- Тест: `tests/Feature/Ministries/MinistryPermissionsTest.php`, `tests/Feature/Access/PermissionCoverageTest.php`

**Интерфейсы:**
- Потребляет: `MinistryPermissionSource` и `SharedMinistryFinder` из задач 6 и 12 — здесь они получают рабочие реализации, сигнатуры не меняются.
- Отдаёт наружу: покрытие тестами каждого ключа каталога — с этой задачи каталог нельзя расширить, не написав тест.

- [ ] **Шаг 1: Написать падающие тесты**

```php
<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use App\Modules\Access\PermissionResolver;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;

it('lets a member with members.manage manage their own ministry only', function () {
    $ministry = ministryWithRoles();
    $other = ministryWithRoles('Молодёжное');
    $user = actingAsUser();
    memberOf($ministry, $user->person, [$ministry->roles()->where('name', 'Лидер')->sole()->id]);

    $this->postJson("/api/v1/ministries/{$ministry->id}/members", ['person_id' => Person::factory()->create()->id])
        ->assertCreated();

    $this->postJson("/api/v1/ministries/{$other->id}/members", ['person_id' => Person::factory()->create()->id])
        ->assertForbidden();
});

it('grants a member the permissions of their ministry roles', function () {
    $ministry = ministryWithRoles();
    $person = Person::factory()->create();
    $user = User::factory()->for($person)->create();
    memberOf($ministry, $person, [$ministry->roles()->where('name', 'Лидер')->sole()->id]);

    expect(app(PermissionResolver::class)->canInMinistry($user, Permission::MembersManage, $ministry->id))->toBeTrue();
});

it('does not leak ministry permissions to another ministry', function () {
    $ministry = ministryWithRoles();
    $other = ministryWithRoles('Молодёжное');
    $person = Person::factory()->create();
    $user = User::factory()->for($person)->create();
    memberOf($ministry, $person, [$ministry->roles()->where('name', 'Лидер')->sole()->id]);

    expect(app(PermissionResolver::class)->canInMinistry($user, Permission::MembersManage, $other->id))->toBeFalse();
});

it('treats a member with a permissionless role as a member', function () {
    $ministry = ministryWithRoles();
    $person = Person::factory()->create();
    $user = User::factory()->for($person)->create();
    memberOf($ministry, $person);

    expect(app(PermissionResolver::class)->isMember($user, $ministry->id))->toBeTrue()
        ->and(app(PermissionResolver::class)->canInMinistry($user, Permission::MembersManage, $ministry->id))->toBeFalse();
});

it('refreshes permissions when a member gains a role', function () {
    $ministry = ministryWithRoles();
    $person = Person::factory()->create();
    $user = User::factory()->for($person)->create();
    $member = memberOf($ministry, $person);
    $leader = $ministry->roles()->where('name', 'Лидер')->sole();

    expect(app(PermissionResolver::class)->canInMinistry($user, Permission::MembersManage, $ministry->id))->toBeFalse();

    app(\App\Modules\Ministries\Actions\SetMemberRoles::class)->handle($member, [$leader->id]);

    expect(app(PermissionResolver::class)->canInMinistry($user->fresh(), Permission::MembersManage, $ministry->id))
        ->toBeTrue();
});

it('refreshes permissions when a member is removed', function () {
    $ministry = ministryWithRoles();
    $person = Person::factory()->create();
    $user = User::factory()->for($person)->create();
    $member = memberOf($ministry, $person, [$ministry->roles()->where('name', 'Лидер')->sole()->id]);

    expect(app(PermissionResolver::class)->canInMinistry($user, Permission::MembersManage, $ministry->id))->toBeTrue();

    app(\App\Modules\Ministries\Actions\RemoveMember::class)->handle($member);

    expect(app(PermissionResolver::class)->canInMinistry($user->fresh(), Permission::MembersManage, $ministry->id))
        ->toBeFalse();
});

it('refreshes permissions when a role loses a permission', function () {
    $ministry = ministryWithRoles();
    $person = Person::factory()->create();
    $user = User::factory()->for($person)->create();
    $leader = $ministry->roles()->where('name', 'Лидер')->sole();
    memberOf($ministry, $person, [$leader->id]);

    expect(app(PermissionResolver::class)->canInMinistry($user, Permission::MembersManage, $ministry->id))->toBeTrue();

    app(\App\Modules\Access\Actions\SetRolePermissions::class)->handle($leader, [Permission::MinistryEdit]);

    expect(app(PermissionResolver::class)->canInMinistry($user->fresh(), Permission::MembersManage, $ministry->id))
        ->toBeFalse();
});

it('shows contacts to a fellow member with members.view_contacts', function () {
    $ministry = ministryWithRoles();
    $viewerPerson = Person::factory()->create();
    $subject = Person::factory()->create(['phone' => '+79123456789', 'contacts_public' => false]);
    $role = \App\Modules\Access\Models\Role::query()->create([
        'scope' => 'ministry', 'ministry_id' => $ministry->id, 'name' => 'Куратор',
    ]);
    $role->permissions()->create(['permission' => Permission::MembersViewContacts->value]);

    memberOf($ministry, $viewerPerson, [$role->id]);
    memberOf($ministry, $subject);

    actingAsUserWith([Permission::PeopleView], $viewerPerson);

    $this->getJson("/api/v1/people/{$subject->id}")->assertJsonPath('data.contacts.phone', '+79123456789');
});

it('hides contacts of a person from another ministry', function () {
    $ministry = ministryWithRoles();
    $other = ministryWithRoles('Молодёжное');
    $viewerPerson = Person::factory()->create();
    $subject = Person::factory()->create(['phone' => '+79123456789', 'contacts_public' => false]);
    $role = \App\Modules\Access\Models\Role::query()->create([
        'scope' => 'ministry', 'ministry_id' => $ministry->id, 'name' => 'Куратор',
    ]);
    $role->permissions()->create(['permission' => Permission::MembersViewContacts->value]);

    memberOf($ministry, $viewerPerson, [$role->id]);
    memberOf($other, $subject);

    actingAsUserWith([Permission::PeopleView], $viewerPerson);

    $this->getJson("/api/v1/people/{$subject->id}")->assertJsonMissingPath('data.contacts');
});
```

`tests/Feature/Access/PermissionCoverageTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use Symfony\Component\Finder\Finder;

it('has an authorization test mentioning every permission key', function (Permission $permission) {
    $files = Finder::create()->files()->in(base_path('tests'))->name('*.php')
        ->notName('PermissionCoverageTest.php');

    $corpus = '';
    foreach ($files as $file) {
        $corpus .= $file->getContents();
    }

    expect(str_contains($corpus, 'Permission::'.$permission->name) || str_contains($corpus, $permission->value))
        ->toBeTrue("Для права {$permission->value} нет ни одного теста.");
})->with(Permission::cases());
```

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Feature/Ministries/MinistryPermissionsTest.php tests/Feature/Access/PermissionCoverageTest.php`
Ожидается: FAIL.

- [ ] **Шаг 3: Реализовать источник прав служений**

```php
final class DatabaseMinistryPermissionSource implements MinistryPermissionSource
{
    /** @return array<string, list<string>> */
    public function forPerson(string $personId): array
    {
        $rows = DB::table('ministry_members as m')
            ->join('ministries as mi', 'mi.id', '=', 'm.ministry_id')
            ->leftJoin('ministry_member_roles as mr', 'mr.member_id', '=', 'm.id')
            ->leftJoin('role_permissions as rp', 'rp.role_id', '=', 'mr.role_id')
            ->where('m.person_id', $personId)
            ->whereNull('mi.archived_at')
            ->select('m.ministry_id', 'rp.permission')
            ->get();

        $result = [];

        foreach ($rows as $row) {
            $result[$row->ministry_id] ??= [];

            if ($row->permission !== null) {
                $result[$row->ministry_id][] = $row->permission;
            }
        }

        return array_map(fn (array $p) => array_values(array_unique($p)), $result);
    }
}
```

`DatabaseSharedMinistryFinder` возвращает идентификаторы служений, где оба человека — участники.

`BumpMembershipPermissionCache` слушает `MemberAdded`, `MemberRemoved`, `MemberRolesChanged`, `MinistryArchived` и вызывает `PermissionCache::bump` для затронутых аккаунтов. `SetRolePermissions` уже сбрасывает кеш носителей (задача 8), теперь `Role::carrierUserIds()` для роли служения считает и участников.

- [ ] **Шаг 4: Запустить весь набор тестов**

Выполнить: `./vendor/bin/pest`
Ожидается: PASS целиком, включая `PermissionCoverageTest`.

- [ ] **Шаг 5: Коммит**

```bash
git add . && git commit -m "feat(ministries): ministry-scoped permissions, cache invalidation, permission coverage test"
```

**Критерии готовности:**
- Участие даёт права только своего служения; `ministries.manage_all` по-прежнему перекрывает всё.
- Пять источников изменения прав (выдача глобальной роли, добавление участника, смена его ролей, исключение, правка прав роли) сбрасывают кеш — по тесту на каждый (риск 5).
- Четвёртое условие видимости контактов из раздела 6.4 работает: коллега по служению с `members.view_contacts` видит телефон, чужой — нет.
- `PermissionCoverageTest` зелёный: у каждого ключа каталога есть тест. С этого момента новый ключ без теста роняет CI.

---

## Блок 5. Media: загрузка, обработка, раздача

### Задача 20: Загрузка медиафайла

**Файлы:**
- Создать: миграцию `..._000500_create_media_tables.php`; `app/Modules/Media/Models/Media.php`, `MediaAttachment.php`, `MediaKind.php`, `MediaPurpose.php`, `MediaStatus.php`; `Actions/StoreMedia.php`; `Http/Controllers/MediaUploadController.php`, `Http/Requests/StoreMediaRequest.php`, `Http/Resources/MediaResource.php`; `config/media.php`; `app/Modules/Media/routes.php`
- Изменить: `config/filesystems.php` (диск `media`)
- Тест: `tests/Feature/Media/UploadTest.php`

**Интерфейсы:**
- Отдаёт наружу: `POST /media` (multipart: `file`, `purpose` ∈ `message|announcement|event|person_photo|ministry_cover|chat_avatar`) → `201 MediaResource` с `id`, `kind`, `status`, `url`.
- Отдаёт наружу: `config('media.limits')` — размеры и белые списки расширений по видам; `MediaKind::forMime(string $mime): ?MediaKind`.
- Отдаёт наружу: `Media::factory()` — по умолчанию готовое изображение (`kind = image`, `status = ready`, `disk = media`, путь вида `2026/09/{ulid}.jpg`); используется задачами 21–23.
- Коды ошибок: `media.type_not_allowed`, `media.too_large`, `media.heic_unsupported`.

- [ ] **Шаг 1: Написать падающие тесты**

```php
<?php

declare(strict_types=1);

use App\Modules\Media\Models\Media;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

beforeEach(fn () => Storage::fake('media'));

it('requires a session to upload', function () {
    $this->postJson('/api/v1/media', ['file' => UploadedFile::fake()->image('photo.jpg')])
        ->assertStatus(401);
});

it('stores an image under a year and month path', function () {
    actingAsUser();

    $response = $this->postJson('/api/v1/media', [
        'file' => UploadedFile::fake()->image('photo.jpg', 800, 600),
        'purpose' => 'person_photo',
    ])->assertCreated();

    $media = Media::query()->sole();
    expect($media->kind->value)->toBe('image')
        ->and($media->status->value)->toBe('processing')
        ->and($media->path)->toMatch('#^\d{4}/\d{2}/[0-9A-Z]{26}\.jpg$#')
        ->and($response->json('data.id'))->toBe($media->id);

    Storage::disk('media')->assertExists($media->path);
});

it('marks a document as ready immediately', function () {
    actingAsUser();

    $this->postJson('/api/v1/media', [
        'file' => UploadedFile::fake()->create('doc.pdf', 100, 'application/pdf'),
        'purpose' => 'message',
    ])->assertCreated();

    expect(Media::query()->sole()->status->value)->toBe('ready');
});

it('rejects a disallowed type', function () {
    actingAsUser();

    $this->postJson('/api/v1/media', [
        'file' => UploadedFile::fake()->create('script.exe', 10, 'application/x-msdownload'),
        'purpose' => 'message',
    ])->assertStatus(422)->assertJsonPath('code', 'media.type_not_allowed');
});

it('rejects a type that lies about its extension', function () {
    actingAsUser();
    $file = UploadedFile::fake()->create('photo.jpg', 10, 'application/x-msdownload');

    $this->postJson('/api/v1/media', ['file' => $file, 'purpose' => 'message'])
        ->assertStatus(422)->assertJsonPath('code', 'media.type_not_allowed');
});

it('rejects an image over ten megabytes', function () {
    actingAsUser();

    $this->postJson('/api/v1/media', [
        'file' => UploadedFile::fake()->image('big.jpg')->size(11 * 1024),
        'purpose' => 'message',
    ])->assertStatus(422)->assertJsonPath('code', 'media.too_large');
});

it('allows a fifty megabyte document but not a sixty megabyte one', function () {
    actingAsUser();

    $this->postJson('/api/v1/media', [
        'file' => UploadedFile::fake()->create('big.pdf', 50 * 1024, 'application/pdf'),
        'purpose' => 'message',
    ])->assertCreated();

    $this->postJson('/api/v1/media', [
        'file' => UploadedFile::fake()->create('bigger.pdf', 60 * 1024, 'application/pdf'),
        'purpose' => 'message',
    ])->assertStatus(422)->assertJsonPath('code', 'media.too_large');
});

it('rejects heic with a clear message when libheif is missing', function () {
    actingAsUser();
    config(['media.heic_supported' => false]);

    $this->postJson('/api/v1/media', [
        'file' => UploadedFile::fake()->create('photo.heic', 100, 'image/heic'),
        'purpose' => 'person_photo',
    ])->assertStatus(422)->assertJsonPath('code', 'media.heic_unsupported');
});

it('remembers who uploaded the file', function () {
    $user = actingAsUser();

    $this->postJson('/api/v1/media', [
        'file' => UploadedFile::fake()->image('photo.jpg'), 'purpose' => 'person_photo',
    ]);

    expect(Media::query()->sole()->uploader_user_id)->toBe($user->id);
});
```

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Feature/Media/UploadTest.php`
Ожидается: FAIL.

- [ ] **Шаг 3: Миграция и конфиг**

```php
Schema::create('media', function (Blueprint $table) {
    $table->char('id', 26)->primary();
    $table->char('uploader_user_id', 26);
    $table->string('disk', 32);
    $table->string('path');
    $table->string('original_name');
    $table->string('mime', 128);
    $table->bigInteger('size');
    $table->string('kind', 16);
    $table->integer('width')->nullable();
    $table->integer('height')->nullable();
    $table->jsonb('variants')->nullable();
    $table->string('status', 16);
    $table->timestampTz('created_at');

    $table->foreign('uploader_user_id')->references('id')->on('users')->restrictOnDelete();
    $table->index('created_at');
});

DB::statement("ALTER TABLE media ADD CONSTRAINT media_kind_check CHECK (kind IN ('image', 'video', 'file'))");
DB::statement("ALTER TABLE media ADD CONSTRAINT media_status_check
    CHECK (status IN ('processing', 'ready', 'failed'))");

Schema::create('media_attachments', function (Blueprint $table) {
    $table->char('id', 26)->primary();
    $table->char('media_id', 26)->unique();     // файл принадлежит ровно одному объекту
    $table->string('attachable_type', 64);
    $table->char('attachable_id', 26);
    $table->integer('sort_order')->default(0);
    $table->timestampTz('created_at');

    $table->foreign('media_id')->references('id')->on('media')->restrictOnDelete();
    $table->index(['attachable_type', 'attachable_id']);
});

// Прямые ссылки: фото человека и обложка служения (раздел 5.8).
// Создаются здесь, потому что здесь появляется таблица media; наполняет их задача 23.
Schema::table('people', function (Blueprint $table) {
    $table->char('photo_media_id', 26)->nullable();
    $table->foreign('photo_media_id')->references('id')->on('media')->restrictOnDelete();
});

Schema::table('ministries', function (Blueprint $table) {
    $table->foreign('cover_media_id')->references('id')->on('media')->restrictOnDelete();
});
```

`config/media.php` задаёт по видам максимальный размер и белый список расширений и MIME из таблицы раздела 7.8, а также `heic_supported` — вычисляется один раз через `extension_loaded('imagick') && in_array('HEIC', \Imagick::queryFormats())`.

- [ ] **Шаг 4: Реализовать `StoreMedia`**

Порядок проверок: MIME по содержимому через `finfo` (не по заголовку запроса) → вид файла по MIME → расширение из белого списка вида → размер по лимиту вида → HEIC отдельной веткой. Затем `Str::ulid()`, путь `Y/m/{ulid}.{ext}`, `Storage::disk('media')->putFileAs(...)`, запись со статусом `processing` для изображений и `ready` для остальных.

- [ ] **Шаг 5: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Feature/Media/UploadTest.php`
Ожидается: PASS, 9 тестов.

- [ ] **Шаг 6: Коммит**

```bash
composer openapi && git add . && git commit -m "feat(media): upload with content-based type and size validation"
```

**Критерии готовности:**
- Тип определяется по содержимому: файл с расширением `.jpg` и телом исполняемого отвергается (раздел 7.8).
- Лимиты 10/50/100 МБ соблюдаются по видам, ошибка понятная, с кодом.
- HEIC без поддержки libheif отвергается сообщением, а не 500 (риск 3).
- Изображение сохраняется со статусом `processing`, документ — `ready`.
- Уникальность `media_attachments.media_id` в базе: файл не может принадлежать двум объектам.

---

### Задача 21: Обработка изображений в очереди

**Файлы:**
- Создать: `app/Modules/Media/Jobs/ProcessUploadedImage.php`, `ImageProcessor.php`
- Изменить: `StoreMedia` (постановка задачи в очередь), `composer.json` (`intervention/image`)
- Тест: `tests/Feature/Media/ImageProcessingTest.php`

**Интерфейсы:**
- Отдаёт наружу: `ProcessUploadedImage::dispatch(string $mediaId)` — удаляет EXIF, поворачивает по ориентации, ужимает оригинал до 2000 px по большей стороне, создаёт варианты `thumb` (320 px) и `large` (1080 px) в WebP, заполняет `width`, `height`, `variants`, ставит `status = ready`; при ошибке — `failed`.

- [ ] **Шаг 1: Написать падающие тесты**

```php
<?php

declare(strict_types=1);

use App\Modules\Media\Jobs\ProcessUploadedImage;
use App\Modules\Media\Models\Media;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Storage;

beforeEach(fn () => Storage::fake('media'));

it('queues processing for an image only', function () {
    Bus::fake();
    actingAsUser();

    $this->postJson('/api/v1/media', ['file' => UploadedFile::fake()->image('a.jpg'), 'purpose' => 'message']);
    Bus::assertDispatched(ProcessUploadedImage::class);

    Bus::fake();
    $this->postJson('/api/v1/media', [
        'file' => UploadedFile::fake()->create('a.pdf', 10, 'application/pdf'), 'purpose' => 'message',
    ]);
    Bus::assertNotDispatched(ProcessUploadedImage::class);
});

it('downscales a large image and records its dimensions', function () {
    actingAsUser();
    $this->postJson('/api/v1/media', [
        'file' => UploadedFile::fake()->image('a.jpg', 4000, 3000), 'purpose' => 'message',
    ]);

    $media = Media::query()->sole();
    ProcessUploadedImage::dispatchSync($media->id);
    $media->refresh();

    expect($media->width)->toBe(2000)
        ->and($media->height)->toBe(1500)
        ->and($media->status->value)->toBe('ready');
});

it('creates thumb and large webp variants', function () {
    actingAsUser();
    $this->postJson('/api/v1/media', [
        'file' => UploadedFile::fake()->image('a.jpg', 4000, 3000), 'purpose' => 'message',
    ]);

    $media = Media::query()->sole();
    ProcessUploadedImage::dispatchSync($media->id);
    $media->refresh();

    expect($media->variants)->toHaveKeys(['thumb', 'large'])
        ->and($media->variants['thumb'])->toEndWith('.webp');

    Storage::disk('media')->assertExists($media->variants['thumb']);
    Storage::disk('media')->assertExists($media->variants['large']);
});

it('does not upscale a small image', function () {
    actingAsUser();
    $this->postJson('/api/v1/media', [
        'file' => UploadedFile::fake()->image('a.jpg', 200, 150), 'purpose' => 'message',
    ]);

    $media = Media::query()->sole();
    ProcessUploadedImage::dispatchSync($media->id);

    expect($media->fresh()->width)->toBe(200);
});

it('marks the media failed when the file is not a readable image', function () {
    actingAsUser();
    $media = Media::factory()->create(['kind' => 'image', 'status' => 'processing', 'path' => '2026/09/missing.jpg']);

    ProcessUploadedImage::dispatchSync($media->id);

    expect($media->fresh()->status->value)->toBe('failed');
});
```

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Feature/Media/ImageProcessingTest.php`
Ожидается: FAIL.

- [ ] **Шаг 3: Реализовать**

Установить `composer require intervention/image`. `ImageProcessor` работает с драйвером Imagick: читает файл, применяет `orient()`, убирает профили и EXIF, при большей стороне свыше 2000 px делает `scaleDown(2000)`, пишет оригинал обратно; затем `scaleDown(320)` и `scaleDown(1080)` в WebP качества 80 по путям `{dir}/{ulid}_thumb.webp` и `_large.webp`.

`ProcessUploadedImage` — `ShouldQueue` с `tries = 3`, в `failed()` ставит `status = failed`.

- [ ] **Шаг 4: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Feature/Media/ImageProcessingTest.php`
Ожидается: PASS, 5 тестов.

- [ ] **Шаг 5: Коммит**

```bash
git add . && git commit -m "feat(media): image processing job with exif strip and webp variants"
```

**Критерии готовности:**
- Задача ставится только для изображений.
- Большая фотография с телефона ужимается до 2000 px, маленькая не растягивается.
- Варианты `thumb` и `large` лежат на диске и записаны в `variants`.
- Нечитаемый файл переводит запись в `failed`, а не оставляет её в `processing` навсегда.

---

### Задача 22: Раздача файлов через подписанную ссылку и nginx

**Файлы:**
- Создать: `app/Modules/Media/MediaAccess.php`, `Contracts/MediaOwnerResolver.php`; `Http/Controllers/MediaDownloadController.php`
- Изменить: `MediaResource` (подписанные ссылки), `app/Modules/Media/routes.php`
- Тест: `tests/Feature/Media/DownloadTest.php`

**Интерфейсы:**
- Отдаёт наружу: `GET /media/{id}?variant=thumb|large|original&expires&signature` — подпись Laravel на 60 минут, ответ с заголовком `X-Accel-Redirect: /_protected/{path}` и `Content-Type`.
- Отдаёт наружу: `MediaAccess::canView(User $user, Media $media): bool` — правило владельца по разделу 6.4. В фазе 1 владельцами бывают фото человека, обложка служения и непривязанный файл самого загрузившего; фазы 2–4 регистрируют своих владельцев через `MediaOwnerResolver`.
- Отдаёт наружу: `MediaResource` подставляет готовый подписанный `url` и `thumb_url` — клиент подписи не строит.

- [ ] **Шаг 1: Написать падающие тесты**

```php
<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use App\Modules\Media\Models\Media;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;

beforeEach(fn () => Storage::fake('media'));

it('refuses an unsigned url', function () {
    actingAsUser();
    $media = Media::factory()->create();

    $this->get("/api/v1/media/{$media->id}")->assertStatus(403);
});

it('refuses an expired signature', function () {
    actingAsUser();
    $media = Media::factory()->create();
    $url = URL::temporarySignedRoute('media.show', now()->subMinute(), ['media' => $media->id]);

    $this->get($url)->assertStatus(403);
});

it('serves the file through x-accel-redirect', function () {
    $user = actingAsUser();
    $media = Media::factory()->create(['uploader_user_id' => $user->id, 'path' => '2026/09/a.jpg']);
    Storage::disk('media')->put('2026/09/a.jpg', 'bytes');

    $this->get(URL::temporarySignedRoute('media.show', now()->addHour(), ['media' => $media->id]))
        ->assertOk()
        ->assertHeader('X-Accel-Redirect', '/_protected/2026/09/a.jpg')
        ->assertHeader('Content-Type', 'image/jpeg');
});

it('serves a variant', function () {
    $user = actingAsUser();
    $media = Media::factory()->create([
        'uploader_user_id' => $user->id,
        'variants' => ['thumb' => '2026/09/a_thumb.webp'],
    ]);

    $this->get(URL::temporarySignedRoute('media.show', now()->addHour(), [
        'media' => $media->id, 'variant' => 'thumb',
    ]))->assertHeader('X-Accel-Redirect', '/_protected/2026/09/a_thumb.webp');
});

it('hides an unattached file from another account', function () {
    $other = \App\Modules\Directory\Models\User::factory()->create();
    $media = Media::factory()->create(['uploader_user_id' => $other->id]);
    actingAsUser();

    $this->get(URL::temporarySignedRoute('media.show', now()->addHour(), ['media' => $media->id]))
        ->assertForbidden();
});

it('shows a person photo to anyone with people.view', function () {
    $person = \App\Modules\Directory\Models\Person::factory()->create();
    $media = Media::factory()->create();
    $person->forceFill(['photo_media_id' => $media->id])->save();

    actingAsUserWith([Permission::PeopleView]);

    $this->get(URL::temporarySignedRoute('media.show', now()->addHour(), ['media' => $media->id]))
        ->assertOk();
});

it('hides a person photo from an account without people.view', function () {
    $person = \App\Modules\Directory\Models\Person::factory()->create();
    $media = Media::factory()->create();
    $person->forceFill(['photo_media_id' => $media->id])->save();

    actingAsUser();

    $this->get(URL::temporarySignedRoute('media.show', now()->addHour(), ['media' => $media->id]))
        ->assertForbidden();
});
```

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Feature/Media/DownloadTest.php`
Ожидается: FAIL.

- [ ] **Шаг 3: Реализовать**

```php
final class MediaDownloadController
{
    public function __invoke(Request $request, Media $media, MediaAccess $access): Response
    {
        abort_unless($access->canView($request->user(), $media), 403);

        $path = match ($request->query('variant')) {
            'thumb', 'large' => $media->variants[$request->query('variant')] ?? $media->path,
            default => $media->path,
        };

        return response('', 200, [
            'Content-Type' => $media->mimeFor($path),
            'Content-Disposition' => $media->kind === MediaKind::File
                ? 'attachment; filename="'.addslashes($media->original_name).'"'
                : 'inline',
            'X-Accel-Redirect' => '/_protected/'.$path,
        ]);
    }
}
```

Маршрут: `Route::get('media/{media}', MediaDownloadController::class)->name('media.show')->middleware(['auth:sanctum', 'signed']);`

- [ ] **Шаг 4: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Feature/Media/DownloadTest.php`
Ожидается: PASS, 7 тестов.

- [ ] **Шаг 5: Проверить отдачу через nginx вручную**

Выполнить: `make up`, загрузить фото через API, открыть подписанную ссылку в браузере.
Ожидается: файл отдан, в `docker compose logs app` нет строки о чтении файла PHP — байты гонит nginx.

- [ ] **Шаг 6: Коммит**

```bash
composer openapi && git add . && git commit -m "feat(media): signed delivery through x-accel-redirect"
```

**Критерии готовности:**
- Без подписи и с просроченной подписью — `403`.
- Право определяется объектом-владельцем, а не фактом загрузки: чужой непривязанный файл недоступен, фото человека доступно по `people.view`.
- PHP не читает байты файла — только ставит заголовок (раздел 7.8).
- Клиент получает готовые ссылки в `MediaResource` и не занимается подписями.

---

### Задача 23: Фото человека, обложка служения, очистка сирот

**Файлы:**
- Создать: `app/Modules/Media/Actions/AttachDirectMedia.php`, `Console/PruneOrphanMediaCommand.php` (колонки `people.photo_media_id` и `ministries.cover_media_id` уже созданы задачей 20)
- Изменить: `ProfileController` (`PUT /me/photo`), `PersonController` (`PUT /people/{id}/photo`), `MinistryController` (`PUT /ministries/{id}/cover`), `routes/console.php` (ежедневное расписание)
- Тест: `tests/Feature/Media/AttachmentTest.php`, `tests/Feature/Media/PruneTest.php`

**Интерфейсы:**
- Отдаёт наружу: `PUT /me/photo`, `PUT /people/{id}/photo`, `PUT /ministries/{id}/cover` — тело `{ "media_id": "..." }`.
- Отдаёт наружу: `DELETE /media/{id}` — аккаунт удаляет свой ещё не привязанный файл (раздел 8); привязанный файл этим эндпоинтом не удаляется.
- Отдаёт наружу: `php artisan media:prune` — удаляет непривязанные файлы старше 24 часов вместе с вариантами; ставится в расписание ежедневно.
- Коды ошибок: `media.not_owned`, `media.already_attached`, `media.wrong_kind`.

- [ ] **Шаг 1: Написать падающие тесты**

```php
<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use App\Modules\Directory\Models\Person;
use App\Modules\Media\Models\Media;
use Illuminate\Support\Facades\Storage;

beforeEach(fn () => Storage::fake('media'));

it('sets ones own photo without any permission', function () {
    $user = actingAsUser();
    $media = Media::factory()->create(['uploader_user_id' => $user->id, 'kind' => 'image']);

    $this->putJson('/api/v1/me/photo', ['media_id' => $media->id])->assertOk();

    expect($user->person->fresh()->photo_media_id)->toBe($media->id);
});

it('refuses a media file uploaded by someone else', function () {
    actingAsUser();
    $media = Media::factory()->create();

    $this->putJson('/api/v1/me/photo', ['media_id' => $media->id])
        ->assertStatus(422)->assertJsonPath('code', 'media.not_owned');
});

it('refuses a document as a photo', function () {
    $user = actingAsUser();
    $media = Media::factory()->create(['uploader_user_id' => $user->id, 'kind' => 'file']);

    $this->putJson('/api/v1/me/photo', ['media_id' => $media->id])
        ->assertStatus(422)->assertJsonPath('code', 'media.wrong_kind');
});

it('refuses a media file already attached elsewhere', function () {
    $user = actingAsUser();
    $media = Media::factory()->create(['uploader_user_id' => $user->id, 'kind' => 'image']);
    $this->putJson('/api/v1/me/photo', ['media_id' => $media->id]);

    $this->putJson('/api/v1/me/photo', ['media_id' => $media->id])
        ->assertStatus(422)->assertJsonPath('code', 'media.already_attached');
});

it('sets another persons photo with people.manage', function () {
    $user = actingAsUserWith([Permission::PeopleManage]);
    $person = Person::factory()->create();
    $media = Media::factory()->create(['uploader_user_id' => $user->id, 'kind' => 'image']);

    $this->putJson("/api/v1/people/{$person->id}/photo", ['media_id' => $media->id])->assertOk();
});

it('sets a ministry cover with ministry.edit', function () {
    $ministry = ministryWithRoles();
    $user = actingAsUserWith([Permission::MinistriesManageAll]);
    $media = Media::factory()->create(['uploader_user_id' => $user->id, 'kind' => 'image']);

    $this->putJson("/api/v1/ministries/{$ministry->id}/cover", ['media_id' => $media->id])->assertOk();

    expect($ministry->fresh()->cover_media_id)->toBe($media->id);
});

it('lets an account delete its own unattached file', function () {
    $user = actingAsUser();
    $media = Media::factory()->create(['uploader_user_id' => $user->id, 'path' => '2026/09/a.jpg']);
    Storage::disk('media')->put('2026/09/a.jpg', 'bytes');

    $this->deleteJson("/api/v1/media/{$media->id}")->assertNoContent();

    expect(Media::query()->find($media->id))->toBeNull();
    Storage::disk('media')->assertMissing('2026/09/a.jpg');
});

it('refuses to delete an attached file', function () {
    $user = actingAsUser();
    $media = Media::factory()->create(['uploader_user_id' => $user->id, 'kind' => 'image']);
    $this->putJson('/api/v1/me/photo', ['media_id' => $media->id]);

    $this->deleteJson("/api/v1/media/{$media->id}")
        ->assertStatus(422)->assertJsonPath('code', 'media.already_attached');
});

it('refuses to delete someone elses file', function () {
    actingAsUser();
    $media = Media::factory()->create();

    $this->deleteJson("/api/v1/media/{$media->id}")
        ->assertStatus(422)->assertJsonPath('code', 'media.not_owned');
});

it('prunes unattached media older than a day', function () {
    $user = actingAsUser();
    $old = Media::factory()->create([
        'uploader_user_id' => $user->id, 'created_at' => now()->subDays(2), 'path' => '2026/09/old.jpg',
    ]);
    $fresh = Media::factory()->create(['uploader_user_id' => $user->id, 'created_at' => now()->subHour()]);
    Storage::disk('media')->put('2026/09/old.jpg', 'bytes');

    $this->artisan('media:prune')->assertSuccessful();

    expect(Media::query()->find($old->id))->toBeNull()
        ->and(Media::query()->find($fresh->id))->not->toBeNull();

    Storage::disk('media')->assertMissing('2026/09/old.jpg');
});

it('keeps a directly referenced photo even when unattached', function () {
    $user = actingAsUser();
    $media = Media::factory()->create([
        'uploader_user_id' => $user->id, 'kind' => 'image', 'created_at' => now()->subDays(2),
    ]);
    $this->putJson('/api/v1/me/photo', ['media_id' => $media->id]);

    $this->artisan('media:prune');

    expect(Media::query()->find($media->id))->not->toBeNull();
});
```

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Feature/Media`
Ожидается: FAIL.

- [ ] **Шаг 3: Реализовать**

`AttachDirectMedia::handle(Media $media, MediaKind $expected): void` проверяет: загрузивший — текущий аккаунт (`media.not_owned`), вид совпадает (`media.wrong_kind`), файл ещё нигде не используется — ни в `media_attachments`, ни прямой ссылкой (`media.already_attached`).

`PruneOrphanMediaCommand` выбирает `media` старше 24 часов, у которых нет строки в `media_attachments` и нет прямых ссылок из `people.photo_media_id` и `ministries.cover_media_id`, удаляет файл, варианты и запись. Расписание: `Schedule::command('media:prune')->daily();`

- [ ] **Шаг 4: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Feature/Media`
Ожидается: PASS.

- [ ] **Шаг 5: Коммит**

```bash
composer openapi && git add . && git commit -m "feat(media): direct attachments for photos and covers, orphan pruning"
```

**Критерии готовности:**
- Своё фото ставится без прав, чужое — по `people.manage`, обложка — по `ministry.edit` в служении.
- Чужой, повторно привязанный и неподходящий по виду файл отвергаются с разными кодами.
- Очистка удаляет только сирот старше суток и не трогает файл, на который есть прямая ссылка.
- `DELETE /media/{id}` убирает свой непривязанный файл и отказывает на чужом и на привязанном.
- Команда стоит в ежедневном расписании.

---

## Блок 6. Оболочка Nuxt

Клиент — SPA (`ssr: false`), сборка в статику. Тесты: Vitest для composables, stores и компонентов через `@nuxt/test-utils/runtime`; сквозные сценарии — задача 32.

### Задача 24: Скелет Nuxt, типы из OpenAPI, CI

**Файлы:**
- Создать: `apps/web/` (скелет Nuxt), `apps/web/nuxt.config.ts`, `eslint.config.mjs`, `vitest.config.ts`, `package.json` (скрипты), `apps/web/types/api.d.ts` (генерируется)
- Изменить: `.github/workflows/ci.yml` (задание `web`)
- Тест: `apps/web/tests/unit/smoke.spec.ts`

**Интерфейсы:**
- Отдаёт наружу: `npm run gen:api` — генерирует `types/api.d.ts` из `apps/api/openapi.json`; `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`.
- Отдаёт наружу: тип `paths` из `types/api.d.ts` — им типизируются все запросы.

- [ ] **Шаг 1: Создать скелет**

```bash
npx nuxi@latest init apps/web --packageManager npm --no-install --gitInit false
```

```bash
cd apps/web && npm i && npm i -D @nuxt/test-utils vitest @vue/test-utils happy-dom vue-tsc openapi-typescript @nuxt/eslint
```

`nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  ssr: false,
  modules: ['@pinia/nuxt', '@nuxt/eslint'],
  runtimeConfig: {
    public: { apiBase: process.env.NUXT_PUBLIC_API_BASE || 'http://localhost:8080' },
  },
  app: { head: { htmlAttrs: { lang: 'ru' }, title: 'Церковь' } },
})
```

Скрипты в `package.json`:

```json
{
  "lint": "eslint .",
  "typecheck": "nuxt typecheck",
  "test": "vitest run",
  "gen:api": "openapi-typescript ../api/openapi.json -o types/api.d.ts"
}
```

- [ ] **Шаг 2: Написать падающий тест**

`apps/web/tests/unit/smoke.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { paths } from '~/types/api'

describe('generated api types', () => {
  it('describes the health endpoint', () => {
    const path: keyof paths = '/api/v1/health'
    expect(path).toBe('/api/v1/health')
  })
})
```

- [ ] **Шаг 3: Запустить тест, убедиться что падает**

Выполнить: `npm run test`
Ожидается: FAIL, `types/api` не найден.

- [ ] **Шаг 4: Сгенерировать типы и прогнать проверки**

Выполнить: `npm run gen:api && npm run test && npm run lint && npm run typecheck && npm run build`
Ожидается: всё зелёное.

- [ ] **Шаг 5: Задание `web` в CI**

```yaml
  web:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/web
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
          cache-dependency-path: apps/web/package-lock.json
      - run: npm ci
      - run: npm run gen:api
      - name: Generated types are up to date
        run: git diff --exit-code types/api.d.ts
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test
      - run: npm run build
```

- [ ] **Шаг 6: Коммит**

```bash
git add apps/web .github && git commit -m "chore(web): nuxt skeleton, generated api types, CI"
```

**Критерии готовности:**
- `npm run build` собирает статику без ошибок.
- `types/api.d.ts` сгенерирован из схемы и закоммичен; CI падает, если он разошёлся со схемой API.
- Линт, проверка типов и Vitest подключены и запускаются в CI.

---

### Задача 25: Слой API, авторизация, навигация

**Файлы:**
- Создать: `apps/web/app/composables/useApi.ts`, `useCan.ts`; `app/stores/auth.ts`; `app/middleware/auth.global.ts`; `app/pages/login.vue`; `app/pages/index.vue` (главная: приветствие и ссылки на справочник, служения и профиль; ленты объявлений, событий и непрочитанного добавляют фазы 2–4); `app/layouts/default.vue`; `app/components/AppNav.vue`
- Тест: `apps/web/tests/unit/useCan.spec.ts`, `tests/unit/auth.store.spec.ts`, `tests/component/login.spec.ts`

**Интерфейсы:**
- Отдаёт наружу: `useApi()` — обёртка над `$fetch` с `credentials: 'include'`, CSRF-cookie через `/sanctum/csrf-cookie` перед небезопасными методами, обработкой `401` (переход на `/login`) и `403`.
- Отдаёт наружу: `useAuthStore()` с `user`, `person`, `permissions`, `login(login, password, remember)`, `logout()`, `fetchMe()`.
- Отдаёт наружу: `useCan()` → `{ can(key: string): boolean, canIn(ministryId: string, key: string): boolean }`.
- Отдаёт наружу: глобальный middleware — неавторизованного отправляет на `/login`, авторизованного с `/login` — на `/`. Публичные маршруты: `/login`, `/invite/[token]`.

- [ ] **Шаг 1: Написать падающие тесты**

`tests/unit/useCan.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { permissionChecker } from '~/app/composables/useCan'

describe('permissionChecker', () => {
  const admin = { administrator: true, global: [], ministries: {} }
  const plain = { administrator: false, global: ['people.view'], ministries: { m1: ['members.manage'] } }

  it('lets an administrator do anything', () => {
    const { can, canIn } = permissionChecker(admin)
    expect(can('settings.manage')).toBe(true)
    expect(canIn('any', 'members.manage')).toBe(true)
  })

  it('checks a global permission', () => {
    const { can } = permissionChecker(plain)
    expect(can('people.view')).toBe(true)
    expect(can('people.manage')).toBe(false)
  })

  it('scopes ministry permissions to their ministry', () => {
    const { canIn } = permissionChecker(plain)
    expect(canIn('m1', 'members.manage')).toBe(true)
    expect(canIn('m2', 'members.manage')).toBe(false)
  })

  it('lets ministries.manage_all cover every ministry', () => {
    const { canIn } = permissionChecker({ administrator: false, global: ['ministries.manage_all'], ministries: {} })
    expect(canIn('m9', 'roles.manage')).toBe(true)
  })
})
```

`tests/unit/auth.store.spec.ts`:

```ts
import { createPinia, setActivePinia } from 'pinia'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '~/app/stores/auth'

const get = vi.fn()
const post = vi.fn()

mockNuxtImport('useApi', () => () => ({ get, post }))

const me = {
  user: { id: 'u1', phone: null, email: 'ivan@example.com' },
  person: { id: 'p1', first_name: 'Иван', last_name: 'Иванов' },
  permissions: { administrator: false, global: ['people.view'], ministries: {} },
}

beforeEach(() => {
  setActivePinia(createPinia())
  get.mockReset()
  post.mockReset()
})

describe('auth store', () => {
  it('keeps the person and the permissions after login', async () => {
    post.mockResolvedValue(me)

    const auth = useAuthStore()
    await auth.login('ivan@example.com', 'secret123', true)

    expect(auth.person?.first_name).toBe('Иван')
    expect(auth.permissions.global).toContain('people.view')
    expect(post).toHaveBeenCalledWith('/auth/login', {
      login: 'ivan@example.com', password: 'secret123', remember: true,
    })
  })

  it('clears the state on logout', async () => {
    post.mockResolvedValue(me)
    const auth = useAuthStore()
    await auth.login('ivan@example.com', 'secret123', false)

    post.mockResolvedValue({})
    await auth.logout()

    expect(auth.user).toBeNull()
    expect(auth.permissions.global).toEqual([])
  })

  it('stays empty when fetchMe gets a 401', async () => {
    get.mockRejectedValue(Object.assign(new Error('unauthenticated'), { statusCode: 401 }))

    const auth = useAuthStore()
    await auth.fetchMe()

    expect(auth.user).toBeNull()
    expect(auth.permissions.administrator).toBe(false)
  })
})
```

`tests/component/login.spec.ts`:

```ts
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LoginPage from '~/app/pages/login.vue'

const login = vi.fn()
const push = vi.fn()

mockNuxtImport('useAuthStore', () => () => ({ login }))
mockNuxtImport('useRouter', () => () => ({ push }))

beforeEach(() => {
  login.mockReset()
  push.mockReset()
})

describe('login page', () => {
  it('shows the validation message from a 422', async () => {
    login.mockRejectedValue(Object.assign(new Error('failed'), {
      statusCode: 422,
      data: { message: 'Неверный логин или пароль.', errors: { login: ['Неверный логин или пароль.'] } },
    }))

    const page = await mountSuspended(LoginPage)
    await page.find('[data-test="login"]').setValue('ivan@example.com')
    await page.find('[data-test="password"]').setValue('nope')
    await page.find('form').trigger('submit')
    await new Promise(resolve => setTimeout(resolve))

    expect(page.text()).toContain('Неверный логин или пароль')
    expect(push).not.toHaveBeenCalled()
  })

  it('explains a disabled account separately', async () => {
    login.mockRejectedValue(Object.assign(new Error('failed'), {
      statusCode: 422,
      data: { code: 'auth.account_disabled', message: 'Аккаунт отключён.' },
    }))

    const page = await mountSuspended(LoginPage)
    await page.find('form').trigger('submit')
    await new Promise(resolve => setTimeout(resolve))

    expect(page.text()).toContain('Аккаунт отключён')
  })

  it('blocks the button while the request is in flight', async () => {
    let release: () => void = () => {}
    login.mockReturnValue(new Promise<void>((resolve) => { release = resolve }))

    const page = await mountSuspended(LoginPage)
    await page.find('form').trigger('submit')

    expect(page.find('[data-test="submit"]').attributes('disabled')).toBeDefined()

    release()
    await new Promise(resolve => setTimeout(resolve))
  })

  it('goes to the home page after a successful login', async () => {
    login.mockResolvedValue(undefined)

    const page = await mountSuspended(LoginPage)
    await page.find('form').trigger('submit')
    await new Promise(resolve => setTimeout(resolve))

    expect(push).toHaveBeenCalledWith('/')
  })
})
```

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `npm run test`
Ожидается: FAIL.

- [ ] **Шаг 3: Реализовать проверку прав чистой функцией**

```ts
export interface Permissions {
  administrator: boolean
  global: string[]
  ministries: Record<string, string[]>
}

export function permissionChecker(permissions: Permissions) {
  const can = (key: string) => permissions.administrator || permissions.global.includes(key)

  const canIn = (ministryId: string, key: string) =>
    can('ministries.manage_all') || (permissions.ministries[ministryId] ?? []).includes(key)

  return { can, canIn }
}

export function useCan() {
  const auth = useAuthStore()
  return permissionChecker(auth.permissions)
}
```

Права на клиенте только прячут кнопки; сервер остаётся единственным авторитетом (раздел 10).

- [ ] **Шаг 4: Реализовать `useApi`, store и вход**

`useApi` перед `POST`, `PUT`, `PATCH`, `DELETE` дёргает `/sanctum/csrf-cookie`, добавляет `credentials: 'include'`, в `onResponseError` при `401` чистит store и ведёт на `/login`.

`default.vue`: на телефоне — нижняя панель вкладок (Главная, Люди, Служения, Профиль), на десктопе — боковая панель. Пункты скрываются по `can('people.view')` и наличию служений.

- [ ] **Шаг 5: Запустить тесты, убедиться что проходят**

Выполнить: `npm run test`
Ожидается: PASS.

- [ ] **Шаг 6: Проверить вручную**

Выполнить: `make up`, `npm run dev`, войти логином администратора из `app:install`.
Ожидается: вход проходит, видна навигация, перезагрузка страницы сессию не теряет.

- [ ] **Шаг 7: Коммит**

```bash
git add apps/web && git commit -m "feat(web): api layer, auth store, permission checks, navigation"
```

**Критерии готовности:**
- `permissionChecker` — чистая функция, покрытая тестами; администратор и `ministries.manage_all` обрабатываются так же, как на сервере.
- Cookie-сессия переживает перезагрузку страницы, CSRF-cookie запрашивается автоматически.
- `401` из любого запроса ведёт на вход, а не показывает пустой экран.
- Навигация различается на телефоне и десктопе.

---

### Задача 26: Экран приглашения

**Файлы:**
- Создать: `apps/web/app/pages/invite/[token].vue`, `app/components/PasswordField.vue`
- Тест: `apps/web/tests/component/invite.spec.ts`

**Интерфейсы:**
- Потребляет: `GET /access-links/{token}`, `POST /access-links/{token}/accept`.
- Отдаёт наружу: маршрут `/invite/{token}` — публичный, без сессии.

- [ ] **Шаг 1: Написать падающие тесты**

`apps/web/tests/component/invite.spec.ts`:

```ts
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import InvitePage from '~/app/pages/invite/[token].vue'

const get = vi.fn()
const post = vi.fn()
const push = vi.fn()

mockNuxtImport('useApi', () => () => ({ get, post }))
mockNuxtImport('useRoute', () => () => ({ params: { token: 'tok123' } }))
mockNuxtImport('useRouter', () => () => ({ push }))

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  push.mockReset()
})

function apiError(code: string) {
  return Object.assign(new Error('failed'), { data: { code, message: 'Ошибка' }, statusCode: 422 })
}

describe('invite page', () => {
  it('greets the invited person by name', async () => {
    get.mockResolvedValue({ data: { kind: 'invite', person: { first_name: 'Мария', last_name: 'Иванова' }, login_hint: {} } })

    const page = await mountSuspended(InvitePage)

    expect(page.text()).toContain('Мария')
  })

  it('prefills the login from the person card', async () => {
    get.mockResolvedValue({
      data: { kind: 'invite', person: { first_name: 'Мария' }, login_hint: { phone: '+79123456789' } },
    })

    const page = await mountSuspended(InvitePage)

    expect((page.find('[data-test="login"]').element as HTMLInputElement).value).toBe('+79123456789')
  })

  it('shows a clear message for an expired link', async () => {
    get.mockRejectedValue(apiError('access_link.expired'))

    const page = await mountSuspended(InvitePage)

    expect(page.text()).toContain('Срок действия ссылки истёк')
  })

  it('shows a clear message for a used link', async () => {
    get.mockRejectedValue(apiError('access_link.used'))

    const page = await mountSuspended(InvitePage)

    expect(page.text()).toContain('Ссылка уже использована')
  })

  it('requires the password twice before sending anything', async () => {
    get.mockResolvedValue({ data: { kind: 'invite', person: { first_name: 'Мария' }, login_hint: {} } })

    const page = await mountSuspended(InvitePage)
    await page.find('[data-test="login"]').setValue('maria@example.com')
    await page.find('[data-test="password"]').setValue('secret123')
    await page.find('[data-test="password-confirmation"]').setValue('secret124')
    await page.find('form').trigger('submit')

    expect(post).not.toHaveBeenCalled()
    expect(page.text()).toContain('Пароли не совпадают')
  })

  it('goes to the home page after accepting', async () => {
    get.mockResolvedValue({ data: { kind: 'invite', person: { first_name: 'Мария' }, login_hint: {} } })
    post.mockResolvedValue({ data: { user: { id: 'u1' } } })

    const page = await mountSuspended(InvitePage)
    await page.find('[data-test="login"]').setValue('maria@example.com')
    await page.find('[data-test="password"]').setValue('secret123')
    await page.find('[data-test="password-confirmation"]').setValue('secret123')
    await page.find('form').trigger('submit')
    await new Promise(resolve => setTimeout(resolve))

    expect(post).toHaveBeenCalledWith('/access-links/tok123/accept', expect.objectContaining({
      login: 'maria@example.com',
      password: 'secret123',
    }))
    expect(push).toHaveBeenCalledWith('/')
  })
})
```

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `npm run test tests/component/invite.spec.ts`
Ожидается: FAIL.

- [ ] **Шаг 3: Реализовать страницу**

Страница помечена `definePageMeta({ layout: false, auth: false })`. Состояния: загрузка, приветствие с формой, ошибка ссылки (просрочена, использована, отозвана — разные тексты по `code`), успех. Поле логина предзаполняется из `login_hint`, пароль вводится дважды.

- [ ] **Шаг 4: Запустить тесты, убедиться что проходят**

Выполнить: `npm run test tests/component/invite.spec.ts`
Ожидается: PASS, 6 тестов.

- [ ] **Шаг 5: Коммит**

```bash
git add apps/web && git commit -m "feat(web): invitation acceptance screen"
```

**Критерии готовности:**
- Страница открывается без сессии и не редиректит на вход.
- Человек видит своё имя до ввода пароля — это подтверждает, что ссылка его.
- Просроченная, использованная и отозванная ссылки дают три разных понятных текста, а не «ошибка 422».
- После принятия человек уже внутри приложения, повторный вход не требуется.

---

### Задача 27: Справочник людей

**Файлы:**
- Создать: `apps/web/app/pages/people/index.vue`, `people/[id].vue`; `app/components/people/PersonListItem.vue`, `PersonForm.vue`, `PersonContacts.vue`
- Тест: `apps/web/tests/component/people.spec.ts`

**Интерфейсы:**
- Потребляет: `GET /people`, `GET /people/{id}`, `POST /people`, `PATCH /people/{id}`, `POST /people/{id}/archive`, `POST /people/{id}/restore`, `PUT /people/{id}/roles`, `POST /people/{id}/invite`.

- [ ] **Шаг 1: Написать падающие тесты**

`apps/web/tests/component/people.spec.ts`:

```ts
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PeopleIndex from '~/app/pages/people/index.vue'
import PersonCard from '~/app/pages/people/[id].vue'

const get = vi.fn()
const post = vi.fn()
const permissions = { administrator: false, global: ['people.view'], ministries: {} }

mockNuxtImport('useApi', () => () => ({ get, post }))
mockNuxtImport('useCan', () => () => permissionChecker(permissions))

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  permissions.global = ['people.view']
})

const person = (over = {}) => ({
  id: 'p1', last_name: 'Прокопенко', first_name: 'Мария', full_name: 'Прокопенко Мария',
  status: 'member', archived: false, has_account: false, has_global_roles: false, ...over,
})

describe('people list', () => {
  it('searches with a debounce and passes the query to the api', async () => {
    vi.useFakeTimers()
    get.mockResolvedValue({ data: [person()], meta: { current_page: 1, last_page: 1, total: 1 } })

    const page = await mountSuspended(PeopleIndex)
    await page.find('[data-test="search"]').setValue('прокопенк')
    vi.advanceTimersByTime(299)
    expect(get).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1)
    expect(get).toHaveBeenLastCalledWith('/people', expect.objectContaining({ search: 'прокопенк' }))
    vi.useRealTimers()
  })

  it('hides the create button without people.manage', async () => {
    get.mockResolvedValue({ data: [], meta: { current_page: 1, last_page: 1, total: 0 } })

    const page = await mountSuspended(PeopleIndex)

    expect(page.find('[data-test="create-person"]').exists()).toBe(false)
  })

  it('shows the create button with people.manage', async () => {
    permissions.global = ['people.view', 'people.manage']
    get.mockResolvedValue({ data: [], meta: { current_page: 1, last_page: 1, total: 0 } })

    const page = await mountSuspended(PeopleIndex)

    expect(page.find('[data-test="create-person"]').exists()).toBe(true)
  })

  it('marks a person without global roles', async () => {
    get.mockResolvedValue({ data: [person({ has_global_roles: false })], meta: { current_page: 1, last_page: 1, total: 1 } })

    const page = await mountSuspended(PeopleIndex)

    expect(page.text()).toContain('без ролей')
  })

  it('asks the api for archived people only when the filter is on', async () => {
    get.mockResolvedValue({ data: [], meta: { current_page: 1, last_page: 1, total: 0 } })

    const page = await mountSuspended(PeopleIndex)
    expect(get).toHaveBeenLastCalledWith('/people', expect.not.objectContaining({ archived: 1 }))

    await page.find('[data-test="filter-archived"]').setValue(true)
    expect(get).toHaveBeenLastCalledWith('/people', expect.objectContaining({ archived: 1 }))
  })
})

describe('person card', () => {
  it('hides the contacts block when the api returned no contacts', async () => {
    get.mockResolvedValue({ data: person() })

    const page = await mountSuspended(PersonCard)

    expect(page.find('[data-test="contacts"]').exists()).toBe(false)
  })

  it('shows contacts when the api returned them', async () => {
    get.mockResolvedValue({ data: person({ contacts: { phone: '+79123456789', email: null, birth_date: null } }) })

    const page = await mountSuspended(PersonCard)

    expect(page.find('[data-test="contacts"]').text()).toContain('+79123456789')
  })

  it('explains why the invite button is disabled without a global role', async () => {
    permissions.global = ['people.view', 'people.invite']
    get.mockResolvedValue({ data: person({ has_global_roles: false }) })

    const page = await mountSuspended(PersonCard)
    const button = page.find('[data-test="invite"]')

    expect(button.attributes('disabled')).toBeDefined()
    expect(button.attributes('title')).toContain('глобальную роль')
  })

  it('shows the invitation link once with a copy button', async () => {
    permissions.global = ['people.view', 'people.invite']
    get.mockResolvedValue({ data: person({ has_global_roles: true }) })
    post.mockResolvedValue({ data: { url: 'https://church.test/invite/tok123', expires_at: '2026-09-19T00:00:00Z' } })

    const page = await mountSuspended(PersonCard)
    await page.find('[data-test="invite"]').trigger('click')
    await new Promise(resolve => setTimeout(resolve))

    expect(page.find('[data-test="invite-link"]').text()).toContain('/invite/tok123')
    expect(page.find('[data-test="copy-invite-link"]').exists()).toBe(true)
  })
})
```

Предупреждения о дубликате телефона проверяются в форме создания человека тем же приёмом: `post` возвращает `{ data: ..., warnings: [{ code: 'person.duplicate_phone' }] }`, и тест ожидает текст предупреждения в `[data-test="warnings"]`.

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `npm run test tests/component/people.spec.ts`
Ожидается: FAIL.

- [ ] **Шаг 3: Реализовать**

Список: поиск с задержкой 300 мс, фильтры по статусу, служению, архиву и «без ролей», постраничная подгрузка. Карточка: ФИО, фото, статус, служения, блок контактов (показывается, только если пришёл в ответе), заметка, глобальные роли, кнопки «Пригласить», «Ссылка сброса пароля», «Отключить аккаунт» (у отключённого аккаунта вместо неё «Включить аккаунт», `POST /people/{id}/enable`), «Архивировать». Кнопка приглашения неактивна с подсказкой, если у человека нет глобальной роли или уже есть аккаунт.

Ссылка приглашения показывается один раз в модальном окне с кнопкой копирования и QR-кодом (`qrcode` в зависимостях).

- [ ] **Шаг 4: Запустить тесты, убедиться что проходят**

Выполнить: `npm run test tests/component/people.spec.ts`
Ожидается: PASS, 8 тестов.

- [ ] **Шаг 5: Коммит**

```bash
git add apps/web && git commit -m "feat(web): directory list and person card"
```

**Критерии готовности:**
- Отсутствие контактов в ответе не рисует пустой блок с прочерками — блока просто нет.
- Предупреждение о дубликате телефона показывается после создания, не мешая работе.
- Ссылка приглашения показывается один раз, с копированием и QR — её передают мессенджером или показывают с экрана (раздел 7.2).
- Неактивная кнопка приглашения объясняет причину.

---

### Задача 28: Служения и состав

**Файлы:**
- Создать: `apps/web/app/pages/ministries/index.vue`, `ministries/[id]/index.vue`, `ministries/[id]/members.vue`; `app/components/ministries/MemberRow.vue`, `AddMemberDialog.vue`
- Тест: `apps/web/tests/component/ministries.spec.ts`

**Интерфейсы:**
- Потребляет: `GET /ministries`, `POST /ministries`, `GET /ministries/{id}`, `PATCH /ministries/{id}`, `POST /ministries/{id}/archive`, `GET /ministries/{id}/members`, `POST /ministries/{id}/members`, `PUT /ministries/{id}/members/{memberId}/roles`, `DELETE /ministries/{id}/members/{memberId}`.

- [ ] **Шаг 1: Написать падающие тесты**

`apps/web/tests/component/ministries.spec.ts`:

```ts
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MembersTab from '~/app/pages/ministries/[id]/members.vue'
import MinistryCard from '~/app/pages/ministries/[id]/index.vue'

const get = vi.fn()
const post = vi.fn()
const put = vi.fn()
const del = vi.fn()
const permissions = { administrator: false, global: [], ministries: {} as Record<string, string[]> }

mockNuxtImport('useApi', () => () => ({ get, post, put, delete: del }))
mockNuxtImport('useCan', () => () => permissionChecker(permissions))
mockNuxtImport('useRoute', () => () => ({ params: { id: 'm1' } }))

beforeEach(() => {
  [get, post, put, del].forEach(fn => fn.mockReset())
  permissions.ministries = {}
})

const ministry = { id: 'm1', name: 'Прославление', description: null, cover_url: null, default_role_id: 'r-member' }
const member = {
  id: 'mem1', person: { id: 'p1', full_name: 'Прокопенко Мария' },
  roles: [{ id: 'r-member', name: 'Участник' }],
}

describe('ministry members tab', () => {
  it('hides member actions without members.manage in that ministry', async () => {
    get.mockResolvedValue({ data: [member] })

    const page = await mountSuspended(MembersTab)

    expect(page.find('[data-test="add-member"]').exists()).toBe(false)
    expect(page.find('[data-test="remove-member"]').exists()).toBe(false)
  })

  it('shows member actions with members.manage in that ministry', async () => {
    permissions.ministries = { m1: ['members.manage'] }
    get.mockResolvedValue({ data: [member] })

    const page = await mountSuspended(MembersTab)

    expect(page.find('[data-test="add-member"]').exists()).toBe(true)
  })

  it('shows the default role on a freshly added member', async () => {
    permissions.ministries = { m1: ['members.manage'] }
    get.mockResolvedValue({ data: [] })
    post.mockResolvedValue({ data: member })

    const page = await mountSuspended(MembersTab)
    await page.find('[data-test="add-member"]').trigger('click')
    await page.find('[data-test="person-option-p1"]').trigger('click')
    await new Promise(resolve => setTimeout(resolve))

    expect(page.text()).toContain('Участник')
  })

  it('shows the domain error text when the last role is removed', async () => {
    permissions.ministries = { m1: ['members.manage'] }
    get.mockResolvedValue({ data: [member] })
    put.mockRejectedValue(Object.assign(new Error('failed'), {
      statusCode: 422,
      data: { code: 'member.last_role_cannot_be_removed', message: 'Нельзя снять последнюю роль.' },
    }))

    const page = await mountSuspended(MembersTab)
    await page.find('[data-test="role-r-member"]').setValue(false)
    await page.find('[data-test="save-roles"]').trigger('click')
    await new Promise(resolve => setTimeout(resolve))

    expect(page.text()).toContain('Нельзя снять последнюю роль')
  })
})

describe('ministry card', () => {
  it('hides the cover uploader without ministry.edit', async () => {
    get.mockResolvedValue({ data: ministry })

    const page = await mountSuspended(MinistryCard)

    expect(page.find('[data-test="change-cover"]').exists()).toBe(false)
  })

  it('asks for confirmation before archiving', async () => {
    permissions.global = ['ministries.create']
    get.mockResolvedValue({ data: ministry })

    const page = await mountSuspended(MinistryCard)
    await page.find('[data-test="archive"]').trigger('click')

    expect(page.find('[data-test="confirm-archive"]').exists()).toBe(true)
    expect(post).not.toHaveBeenCalled()
  })
})
```

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `npm run test tests/component/ministries.spec.ts`
Ожидается: FAIL.

- [ ] **Шаг 3: Реализовать**

Список служений с обложками. Карточка с вкладками «Участники» и «Роли» (вторая — задача 29). Вкладка участников: строка с фото, ФИО, ролями-чипами; диалог добавления с поиском по справочнику; смена ролей чекбоксами; исключение с подтверждением. Действия скрыты, если `canIn(ministryId, 'members.manage')` ложно.

- [ ] **Шаг 4: Запустить тесты, убедиться что проходят**

Выполнить: `npm run test tests/component/ministries.spec.ts`
Ожидается: PASS, 5 тестов.

- [ ] **Шаг 5: Коммит**

```bash
git add apps/web && git commit -m "feat(web): ministries list, card and membership tab"
```

**Критерии готовности:**
- Лидер служения видит управление только в своём служении.
- Роль по умолчанию видна на строке нового участника сразу после добавления.
- Доменная ошибка «последняя роль» показывается человеческим текстом рядом с полем, а не всплывающим «ошибка сервера».
- Архивация спрашивает подтверждение.

---

### Задача 29: Редакторы ролей

**Файлы:**
- Создать: `apps/web/app/pages/admin/roles.vue`, `app/pages/ministries/[id]/roles.vue`; `app/components/roles/RoleEditor.vue`, `PermissionGroup.vue`, `RoleUsageDialog.vue`
- Тест: `apps/web/tests/component/roles.spec.ts`

**Интерфейсы:**
- Потребляет: `GET /permissions`, `GET /roles?scope=global`, `POST /roles`, `PATCH /roles/{id}`, `DELETE /roles/{id}`, `GET /roles/{id}/usage`, `GET /ministries/{id}/roles`, `POST /ministries/{id}/roles`, `PATCH /ministries/{id}` (роль по умолчанию).
- Отдаёт наружу: `RoleEditor` — один компонент на оба уровня, отличается списком прав по области.

- [ ] **Шаг 1: Написать падающие тесты**

`apps/web/tests/component/roles.spec.ts`:

```ts
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RoleEditor from '~/app/components/roles/RoleEditor.vue'

const get = vi.fn()
const post = vi.fn()
const del = vi.fn()

mockNuxtImport('useApi', () => () => ({ get, post, delete: del }))

const catalogue = [
  { key: 'people.view', scope: 'global', label: 'Видеть справочник', description: '...' },
  { key: 'settings.manage', scope: 'global', label: 'Настройки церкви', description: '...' },
  { key: 'members.manage', scope: 'ministry', label: 'Управлять составом', description: '...' },
  { key: 'roles.manage', scope: 'ministry', label: 'Управлять ролями служения', description: '...' },
]

beforeEach(() => {
  [get, post, del].forEach(fn => fn.mockReset())
  get.mockResolvedValue({ data: catalogue })
})

describe('role editor', () => {
  it('shows only global permissions for a global role', async () => {
    const editor = await mountSuspended(RoleEditor, { props: { scope: 'global', role: null } })

    expect(editor.text()).toContain('Видеть справочник')
    expect(editor.text()).not.toContain('Управлять составом')
  })

  it('shows only ministry permissions for a ministry role', async () => {
    const editor = await mountSuspended(RoleEditor, { props: { scope: 'ministry', ministryId: 'm1', role: null } })

    expect(editor.text()).toContain('Управлять составом')
    expect(editor.text()).not.toContain('Настройки церкви')
  })

  it('saves a role with no permissions at all', async () => {
    post.mockResolvedValue({ data: { id: 'r1', name: 'Вокалист', permissions: [] } })

    const editor = await mountSuspended(RoleEditor, { props: { scope: 'ministry', ministryId: 'm1', role: null } })
    await editor.find('[data-test="role-name"]').setValue('Вокалист')
    await editor.find('form').trigger('submit')
    await new Promise(resolve => setTimeout(resolve))

    expect(post).toHaveBeenCalledWith('/ministries/m1/roles', { name: 'Вокалист', description: null, permissions: [] })
  })

  it('marks a permissionless ministry role as a slot position', async () => {
    const editor = await mountSuspended(RoleEditor, {
      props: { scope: 'ministry', ministryId: 'm1', role: { id: 'r1', name: 'Вокалист', permissions: [] } },
    })

    expect(editor.text()).toContain('используется как позиция в слотах')
  })

  it('renders the system role read-only', async () => {
    const editor = await mountSuspended(RoleEditor, {
      props: { scope: 'global', role: { id: 'r0', name: 'Администратор', is_system: true, permissions: [] } },
    })

    expect(editor.find('[data-test="role-name"]').attributes('disabled')).toBeDefined()
    expect(editor.find('[data-test="delete-role"]').exists()).toBe(false)
    expect(editor.text()).toContain('системная')
  })

  it('shows the carriers count before deleting', async () => {
    get.mockImplementation((url: string) =>
      url.endsWith('/usage')
        ? Promise.resolve({ data: { carriers: 3, blockers: [] } })
        : Promise.resolve({ data: catalogue }))

    const editor = await mountSuspended(RoleEditor, {
      props: { scope: 'global', role: { id: 'r1', name: 'Пастор', is_system: false, permissions: [] } },
    })
    await editor.find('[data-test="delete-role"]').trigger('click')
    await new Promise(resolve => setTimeout(resolve))

    expect(editor.text()).toContain('3')
    expect(del).not.toHaveBeenCalled()
  })

  it('explains a blocked deletion instead of offering to confirm', async () => {
    get.mockImplementation((url: string) =>
      url.endsWith('/usage')
        ? Promise.resolve({ data: { carriers: 1, blockers: [{ type: 'default_role', id: 'm1', title: 'Роль по умолчанию' }] } })
        : Promise.resolve({ data: catalogue }))

    const editor = await mountSuspended(RoleEditor, {
      props: { scope: 'ministry', ministryId: 'm1', role: { id: 'r1', name: 'Участник', is_system: false, permissions: [] } },
    })
    await editor.find('[data-test="delete-role"]').trigger('click')
    await new Promise(resolve => setTimeout(resolve))

    expect(editor.text()).toContain('Роль по умолчанию')
    expect(editor.find('[data-test="confirm-delete"]').exists()).toBe(false)
  })
})
```

Выбор другой роли по умолчанию проверяется в `tests/component/ministries.spec.ts`: переключатель на вкладке ролей шлёт `PATCH /ministries/m1` с `default_role_id`.

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `npm run test tests/component/roles.spec.ts`
Ожидается: FAIL.

- [ ] **Шаг 3: Реализовать**

Права берутся из `GET /permissions` и группируются по смысловому префиксу ключа (`people.*`, `ministries.*`, …) с русскими названиями и описаниями из ответа. Роль «Администратор» показывается в списке с пометкой «системная» и открывается только для чтения. Перед удалением запрашивается `usage` и показывается число носителей и список блокировок. Роль служения без прав получает пометку «используется как позиция в слотах» (риск 9 из раздела 15).

- [ ] **Шаг 4: Запустить тесты, убедиться что проходят**

Выполнить: `npm run test tests/component/roles.spec.ts`
Ожидается: PASS, 8 тестов.

- [ ] **Шаг 5: Коммит**

```bash
git add apps/web && git commit -m "feat(web): global and ministry role editors"
```

**Критерии готовности:**
- Один компонент обслуживает оба уровня, список прав приходит с сервера — новый ключ появляется в интерфейсе без правки клиента.
- Системная роль не редактируется в интерфейсе, а не только на сервере.
- Удаление показывает число носителей и причины блокировки до подтверждения.
- Роль без прав создаётся и помечается как позиция для слотов.

---

### Задача 30: Профиль, вход, устройства, фото

**Файлы:**
- Создать: `apps/web/app/pages/settings/profile.vue`, `settings/login.vue`, `settings/devices.vue`, `app/pages/admin/settings.vue`, `app/pages/admin/audit.vue`; `app/components/MediaUploader.vue`
- Тест: `apps/web/tests/component/profile.spec.ts`

**Интерфейсы:**
- Потребляет: `PATCH /me/profile`, `PATCH /me/login`, `PATCH /me/password`, `PUT /me/photo`, `POST /media`, `GET /auth/sessions`, `DELETE /auth/sessions/{id}`, `POST /auth/sessions/logout-others`, `GET /settings`, `PUT /settings`, `GET /audit`.
- Экран «Профиль» правит контакты человека и не содержит полей логина. Экран «Вход» содержит две формы: смена логина (новый логин, текущий пароль) и смена пароля (текущий, новый, повтор).

- [ ] **Шаг 1: Написать падающие тесты**

`apps/web/tests/component/profile.spec.ts`:

```ts
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AppNav from '~/app/components/AppNav.vue'
import DevicesPage from '~/app/pages/settings/devices.vue'
import LoginSettingsPage from '~/app/pages/settings/login.vue'
import MediaUploader from '~/app/components/MediaUploader.vue'
import ProfilePage from '~/app/pages/settings/profile.vue'

const get = vi.fn()
const post = vi.fn()
const put = vi.fn()
const patch = vi.fn()
const del = vi.fn()
const permissions = { administrator: false, global: [] as string[], ministries: {} }

mockNuxtImport('useApi', () => () => ({ get, post, put, patch, delete: del }))
mockNuxtImport('useCan', () => () => permissionChecker(permissions))

beforeEach(() => {
  [get, post, put, patch, del].forEach(fn => fn.mockReset())
  permissions.global = []
})

describe('login settings', () => {
  it('shows the taken-login error next to the field', async () => {
    patch.mockRejectedValue(Object.assign(new Error('failed'), {
      statusCode: 422,
      data: { code: 'login.taken', message: 'Этот логин уже занят.' },
    }))

    const page = await mountSuspended(LoginSettingsPage)
    await page.find('[data-test="login"]').setValue('taken@example.com')
    await page.find('[data-test="login-current-password"]').setValue('password')
    await page.find('[data-test="login-form"]').trigger('submit')
    await new Promise(resolve => setTimeout(resolve))

    expect(page.find('[data-test="login-error"]').text()).toContain('уже занят')
  })

  it('sends the current password together with the new login', async () => {
    patch.mockResolvedValue({ data: {} })

    const page = await mountSuspended(LoginSettingsPage)
    await page.find('[data-test="login"]').setValue('new@example.com')
    await page.find('[data-test="login-current-password"]').setValue('password')
    await page.find('[data-test="login-form"]').trigger('submit')
    await new Promise(resolve => setTimeout(resolve))

    expect(patch).toHaveBeenCalledWith('/me/login', { login: 'new@example.com', current_password: 'password' })
  })
})

describe('profile', () => {
  it('sends the contacts_public toggle', async () => {
    get.mockResolvedValue({ data: { contacts: { phone: null, email: null, birth_date: null }, contacts_public: false } })
    patch.mockResolvedValue({ data: {} })

    const page = await mountSuspended(ProfilePage)
    await page.find('[data-test="contacts-public"]').setValue(true)
    await page.find('form').trigger('submit')
    await new Promise(resolve => setTimeout(resolve))

    expect(patch).toHaveBeenCalledWith('/me/profile', expect.objectContaining({ contacts_public: true }))
  })
})

describe('media uploader', () => {
  it('waits for processing before attaching the photo', async () => {
    vi.useFakeTimers()
    post.mockResolvedValue({ data: { id: 'md1', status: 'processing' } })
    get.mockResolvedValueOnce({ data: { id: 'md1', status: 'processing' } })
      .mockResolvedValueOnce({ data: { id: 'md1', status: 'ready', url: '/api/v1/media/md1?signature=x' } })
    put.mockResolvedValue({ data: {} })

    const uploader = await mountSuspended(MediaUploader, { props: { purpose: 'person_photo', target: '/me/photo' } })
    await uploader.vm.upload(new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' }))

    expect(put).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(2000)

    expect(put).toHaveBeenCalledWith('/me/photo', { media_id: 'md1' })
    vi.useRealTimers()
  })
})

describe('devices', () => {
  it('marks the current session and disables ending it', async () => {
    get.mockResolvedValue({
      data: [
        { id: 's1', ip_address: '10.0.0.1', user_agent: 'iPhone', last_activity: '2026-09-12T10:00:00Z', current: true },
        { id: 's2', ip_address: '10.0.0.2', user_agent: 'Chrome', last_activity: '2026-09-12T09:00:00Z', current: false },
      ],
    })

    const page = await mountSuspended(DevicesPage)

    expect(page.find('[data-test="end-s1"]').attributes('disabled')).toBeDefined()
    expect(page.find('[data-test="end-s2"]').attributes('disabled')).toBeUndefined()
  })

  it('ends all other sessions', async () => {
    get.mockResolvedValue({ data: [] })
    post.mockResolvedValue({})

    const page = await mountSuspended(DevicesPage)
    await page.find('[data-test="logout-others"]').trigger('click')
    await new Promise(resolve => setTimeout(resolve))

    expect(post).toHaveBeenCalledWith('/auth/sessions/logout-others')
  })
})

describe('navigation', () => {
  it('hides the admin section without settings.manage and audit.view', async () => {
    const nav = await mountSuspended(AppNav)

    expect(nav.find('[data-test="nav-admin"]').exists()).toBe(false)
  })

  it('shows the admin section with audit.view', async () => {
    permissions.global = ['audit.view']

    const nav = await mountSuspended(AppNav)

    expect(nav.find('[data-test="nav-admin"]').exists()).toBe(true)
  })
})
```

Постраничная подгрузка журнала проверяется отдельным тестом на `admin/audit.vue`: второй вызов `get` уходит с `cursor` из `next_cursor` первого ответа.

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `npm run test tests/component/profile.spec.ts`
Ожидается: FAIL.

- [ ] **Шаг 3: Реализовать**

`MediaUploader`: выбор файла, `POST /media` с `purpose`, ожидание `status = ready` опросом раз в секунду до 15 секунд, затем привязка (`PUT /me/photo`). Даты в журнале и везде — в часовом поясе церкви из `GET /settings`, не устройства (раздел 10).

`settings/login.vue`: две независимые формы. Смена логина шлёт `PATCH /me/login`, ошибки `login.taken` и `auth.invalid_password` показываются у соответствующего поля. Смена пароля шлёт `PATCH /me/password`; несовпадение повтора ловится на клиенте до запроса. После успешной смены пароля показывается уведомление, что другие устройства разлогинены.

- [ ] **Шаг 4: Запустить тесты, убедиться что проходят**

Выполнить: `npm run test tests/component/profile.spec.ts`
Ожидается: PASS, 8 тестов.

- [ ] **Шаг 5: Коммит**

```bash
git add apps/web && git commit -m "feat(web): profile, login settings, devices, church settings and journal"
```

**Критерии готовности:**
- Фото загружается и появляется после обработки, без ручной перезагрузки страницы.
- Логин и пароль меняются только на экране «Вход» с текущим паролем; экран «Профиль» полей логина не содержит.
- Текущая сессия помечена и не завершается из списка.
- Раздел администрирования скрыт у того, у кого нет соответствующих прав.
- Все даты показываются в часовом поясе церкви.

---

### Задача 31: PWA: манифест, иконки, установка

**Файлы:**
- Создать: `apps/web/public/manifest.webmanifest`, иконки `public/icons/*`, `app/components/InstallPrompt.vue`, `apps/web/app/sw.ts` (заготовка: предкеш оболочки; обработчики `push` добавит фаза 2)
- Изменить: `nuxt.config.ts` (`@vite-pwa/nuxt`, `injectManifest`)
- Тест: `apps/web/tests/component/install-prompt.spec.ts`

**Интерфейсы:**
- Отдаёт наружу: `InstallPrompt` — на iOS в Safari (не в standalone) показывает инструкцию «Поделиться → На экран „Домой“»; на Android перехватывает `beforeinstallprompt` и предлагает установку кнопкой.

- [ ] **Шаг 1: Написать падающие тесты**

`apps/web/tests/component/install-prompt.spec.ts`:

```ts
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import InstallPrompt from '~/app/components/InstallPrompt.vue'

function platform(ua: string, standalone = false) {
  vi.stubGlobal('navigator', { userAgent: ua, standalone })
  vi.stubGlobal('matchMedia', () => ({ matches: standalone, addEventListener() {}, removeEventListener() {} }))
}

const IOS_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1'
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36'

beforeEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('install prompt', () => {
  it('shows ios instructions in mobile safari outside standalone', async () => {
    platform(IOS_SAFARI)

    const prompt = await mountSuspended(InstallPrompt)

    expect(prompt.text()).toContain('Поделиться')
    expect(prompt.text()).toContain('На экран «Домой»')
  })

  it('hides itself when the app runs in standalone mode', async () => {
    platform(IOS_SAFARI, true)

    const prompt = await mountSuspended(InstallPrompt)

    expect(prompt.find('[data-test="install-prompt"]').exists()).toBe(false)
  })

  it('offers the native install button on android after beforeinstallprompt', async () => {
    platform(ANDROID_CHROME)
    const prompt = await mountSuspended(InstallPrompt)

    const event = Object.assign(new Event('beforeinstallprompt'), { prompt: vi.fn(), preventDefault: vi.fn() })
    window.dispatchEvent(event)
    await prompt.vm.$nextTick()

    await prompt.find('[data-test="install-button"]').trigger('click')
    expect(event.prompt).toHaveBeenCalled()
  })

  it('stays hidden after the person dismissed it', async () => {
    platform(IOS_SAFARI)
    const first = await mountSuspended(InstallPrompt)
    await first.find('[data-test="dismiss-install"]').trigger('click')

    const second = await mountSuspended(InstallPrompt)

    expect(second.find('[data-test="install-prompt"]').exists()).toBe(false)
  })
})
```

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `npm run test tests/component/install-prompt.spec.ts`
Ожидается: FAIL.

- [ ] **Шаг 3: Реализовать**

Манифест: русское название, `display: standalone`, `start_url: /`, иконки 192, 512 и maskable. Определение standalone: `window.matchMedia('(display-mode: standalone)').matches || navigator.standalone`. Отказ от подсказки запоминается в `localStorage`.

Service worker собирается через `injectManifest` и в фазе 1 только предкеширует оболочку; запросы к API не кешируются, офлайн-режима нет (раздел 10).

- [ ] **Шаг 4: Запустить тесты, убедиться что проходят**

Выполнить: `npm run test tests/component/install-prompt.spec.ts`
Ожидается: PASS, 4 теста.

- [ ] **Шаг 5: Проверить на устройствах**

Открыть приложение на iPhone в Safari и на Android в Chrome.
Ожидается: подсказка установки видна в браузере и исчезает после установки на домашний экран; приложение открывается без адресной строки.

- [ ] **Шаг 6: Коммит**

```bash
git add apps/web && git commit -m "feat(web): pwa manifest and install prompt"
```

**Критерии готовности:**
- Приложение ставится на домашний экран на iOS и Android и открывается в standalone.
- Подсказка установки на iOS обязательна — без установки в фазе 2 не будет пушей (ADR-0001, риск 2).
- Service worker зарегистрирован и предкеширует оболочку; API не кешируется.

---

## Блок 7. Сквозная проверка и продовый контур

### Задача 32: Сквозные сценарии Playwright

**Файлы:**
- Создать: `apps/web/playwright.config.ts`, `apps/web/e2e/onboarding.spec.ts`, `e2e/ministry.spec.ts`, `e2e/fixtures.ts`
- Изменить: `.github/workflows/ci.yml` (задание `e2e`)
- Тест: сами сценарии

**Интерфейсы:**
- Отдаёт наружу: `npm run e2e` — поднимает API через `php artisan serve` на тестовой базе, выполняет `app:install` с фиксированными опциями, запускает Nuxt в режиме предпросмотра и гоняет сценарии.

- [ ] **Шаг 1: Написать сценарии**

`e2e/onboarding.spec.ts`:

```ts
test('an administrator installs, creates a role, a person and invites them', async ({ page, request }) => {
  await login(page, 'admin@example.com', 'secret123')

  await page.goto('/admin/roles')
  await page.getByRole('button', { name: 'Создать роль' }).click()
  await page.getByLabel('Название').fill('Служитель')
  await page.getByLabel('Видеть справочник').check()
  await page.getByRole('button', { name: 'Сохранить' }).click()
  await expect(page.getByText('Служитель')).toBeVisible()

  await page.goto('/people')
  await page.getByRole('button', { name: 'Добавить человека' }).click()
  await page.getByLabel('Фамилия').fill('Петров')
  await page.getByLabel('Имя').fill('Пётр')
  await page.getByRole('button', { name: 'Сохранить' }).click()

  await page.getByRole('button', { name: 'Пригласить' }).click()
  await expect(page.getByText('Сначала выдайте человеку')).toBeVisible()

  await page.getByRole('button', { name: 'Глобальные роли' }).click()
  await page.getByLabel('Служитель').check()
  await page.getByRole('button', { name: 'Сохранить' }).click()

  await page.getByRole('button', { name: 'Пригласить' }).click()
  const link = await page.getByTestId('invite-link').innerText()

  const guest = await page.context().browser()!.newContext()
  const guestPage = await guest.newPage()
  await guestPage.goto(link)
  await expect(guestPage.getByText('Пётр')).toBeVisible()
  await guestPage.getByLabel('Пароль').fill('secret123')
  await guestPage.getByLabel('Повторите пароль').fill('secret123')
  await guestPage.getByRole('button', { name: 'Создать аккаунт' }).click()
  await expect(guestPage).toHaveURL('/')
})
```

`e2e/ministry.spec.ts`:

```ts
test('a leader manages members of their own ministry only', async ({ page, browser }) => {
  await login(page, 'admin@example.com', 'secret123')

  await page.goto('/ministries')
  await page.getByRole('button', { name: 'Создать служение' }).click()
  await page.getByLabel('Название').fill('Прославление')
  await page.getByRole('button', { name: 'Сохранить' }).click()

  await page.getByRole('button', { name: 'Создать служение' }).click()
  await page.getByLabel('Название').fill('Молодёжное')
  await page.getByRole('button', { name: 'Сохранить' }).click()

  const leader = await createInvitedAccount(page, browser, { lastName: 'Сидоров', firstName: 'Сергей' })

  await page.getByRole('link', { name: 'Прославление' }).click()
  await page.getByRole('tab', { name: 'Участники' }).click()
  await page.getByRole('button', { name: 'Добавить участника' }).click()
  await page.getByPlaceholder('Поиск по справочнику').fill('Сидоров')
  await page.getByText('Сидоров Сергей').click()
  await page.getByLabel('Лидер').check()
  await page.getByRole('button', { name: 'Добавить' }).click()
  await expect(page.getByText('Сидоров Сергей')).toBeVisible()

  await page.goto('/ministries')
  const praiseId = await page.getByTestId('ministry-Прославление').getAttribute('data-id')
  const youthId = await page.getByTestId('ministry-Молодёжное').getAttribute('data-id')

  await leader.goto(`/ministries/${praiseId}/members`)
  await expect(leader.getByRole('button', { name: 'Добавить участника' })).toBeVisible()

  await leader.goto(`/ministries/${youthId}/members`)
  await expect(leader.getByRole('button', { name: 'Добавить участника' })).toHaveCount(0)
})
```

`e2e/fixtures.ts` содержит `login(page, login, password)` и `createInvitedAccount(adminPage, browser, person)` — последняя создаёт человека, выдаёт ему глобальную роль, берёт ссылку приглашения и принимает её в отдельном контексте браузера, возвращая страницу вошедшего человека.

- [ ] **Шаг 2: Запустить сценарии, убедиться что падают или проходят честно**

Выполнить: `npm run e2e`
Ожидается: сценарии проходят на собранном приложении; каждый упавший шаг — настоящий дефект интерфейса, а не «подождать подольше».

- [ ] **Шаг 3: Задание `e2e` в CI**

Запускается после `api` и `web`, на тех же сервисах Postgres и Redis, с артефактом-трассировкой при падении.

- [ ] **Шаг 4: Коммит**

```bash
git add apps/web .github && git commit -m "test(web): end-to-end onboarding and ministry scenarios"
```

**Критерии готовности:**
- Сценарий «установка → роль → человек → приглашение → вход» проходит целиком в CI.
- Сценарий подтверждает инвариант 6.3.3 на уровне интерфейса: без глобальной роли кнопка приглашения объясняет отказ.
- Сценарий служения подтверждает, что права лидера ограничены его служением.
- Трассировка падения сохраняется артефактом.

---

### Задача 33: Продовый контур и деплой

**Файлы:**
- Создать: `infra/compose.prod.yml`, `infra/nginx/prod.conf`, `infra/web/Dockerfile`, `.github/workflows/deploy.yml`, `docs/deploy.md`
- Тест: ручная проверка по чек-листу в `docs/deploy.md`

**Интерфейсы:**
- Отдаёт наружу: `deploy.yml` — на push в `main` собирает образы `app` и `web`, публикует в GHCR, по SSH выполняет `docker compose pull`, `up -d --remove-orphans`, `php artisan migrate --force`, сброс кешей и `horizon:terminate`.

- [ ] **Шаг 1: Конфиг nginx для прода**

`infra/nginx/prod.conf`: `/` — статика Nuxt с `try_files $uri $uri/ /index.html`; `/api/`, `/sanctum/`, `/broadcasting/` — fastcgi на `app:9000`; `/_protected/` — `internal` с `alias` на каталог медиафайлов; `client_max_body_size 100m`; HTTP → HTTPS; сертификаты Let's Encrypt. Локация `/app/` для Reverb добавляется в фазе 2 — в фазе 1 сервиса `reverb` ещё нет.

- [ ] **Шаг 2: `compose.prod.yml`**

Сервисы `web`, `app`, `worker`, `scheduler`, `postgres`, `redis`, `certbot`. Образы из GHCR по тегу. Том медиафайлов монтируется в `app`, `worker` и `web` (в `web` — только для чтения).

- [ ] **Шаг 3: `deploy.yml`**

```yaml
name: deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with: { registry: ghcr.io, username: ${{ github.actor }}, password: ${{ secrets.GITHUB_TOKEN }} }
      - uses: docker/build-push-action@v6
        with: { context: ., file: infra/php/Dockerfile, push: true, tags: 'ghcr.io/${{ github.repository }}/app:${{ github.sha }}' }
      - uses: docker/build-push-action@v6
        with: { context: ., file: infra/web/Dockerfile, push: true, tags: 'ghcr.io/${{ github.repository }}/web:${{ github.sha }}' }
      - uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_KEY }}
          script: |
            cd /srv/church
            export TAG=${{ github.sha }}
            docker compose -f compose.prod.yml pull
            docker compose -f compose.prod.yml up -d --remove-orphans
            docker compose -f compose.prod.yml exec -T app php artisan migrate --force
            docker compose -f compose.prod.yml exec -T app php artisan config:cache
            docker compose -f compose.prod.yml exec -T app php artisan horizon:terminate
```

- [ ] **Шаг 4: Первая установка на сервере**

`docs/deploy.md` описывает по шагам: создание `/srv/church`, `.env` с секретами (`APP_KEY`, пароль базы, домен), получение сертификата, первый `docker compose up -d`, `php artisan migrate --force`, `php artisan app:install`, проверка `https://домен/api/v1/health`.

- [ ] **Шаг 5: Проверить деплой**

Выполнить: пуш в `main`, затем `curl -s https://домен/api/v1/health`
Ожидается: `{"status":"ok",...}`; вход администратора с телефона работает.

- [ ] **Шаг 6: Коммит**

```bash
git add infra .github docs/deploy.md && git commit -m "chore: production compose, nginx and deploy workflow"
```

**Критерии готовности:**
- Пуш в `main` выкатывает систему без ручных действий на сервере, кроме первой установки.
- Миграции применяются на деплое, Horizon перезапускается, простой — секунды.
- Секреты живут только в `.env` на сервере и в секретах GitHub.
- `docs/deploy.md` позволяет поднять систему с нуля на новом сервере.

---

## Фаза 1 готова, когда

Проверка по критерию из раздела 13 архитектуры, одним прогоном на продовом сервере:

1. Администратор ставит систему командой `app:install` и входит с телефона.
2. Создаёт глобальную роль из каталога прав и выдаёт её человеку.
3. Создаёт людей в справочнике, ищет их по неполной фамилии, видит контакты по праву.
4. Создаёт служение, добавляет участников, правит роли служения и роль по умолчанию.
5. Приглашает человека ссылкой; тот открывает её на своём телефоне, заводит аккаунт, ставит PWA на домашний экран и видит свой профиль, справочник и свои служения.
6. Загружает своё фото, меняет пароль, видит список устройств, завершает лишние сессии.
7. Администратор видит журнал действий по всем перечисленным шагам.

Не входит в фазу 1 и намеренно отсутствует: объявления, уведомления и пуши (фаза 2), календарь и шаблоны (фаза 3), чаты (фаза 4).

---

## Решения заказчика после планирования

Приняты 2026-09-12 и внесены в план и в `docs/architecture.md`.

1. **Включение отключённого аккаунта** нужно: `POST /people/{id}/enable` под правом `people.invite`, событие `UserEnabled`. Реализуется в задаче 14.
2. **Логины аккаунта и контакты человека — отдельные поля.** Правка профиля не меняет логин; логин и пароль меняются через `PATCH /me/login` и `PATCH /me/password` с текущим паролем. Реализуется в задаче 14 (API) и задаче 30 (экран «Вход»).
