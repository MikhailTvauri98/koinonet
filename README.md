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

Архитектура описана в `docs/architecture.md`, словарь проекта — в `CONTEXT.md`, планы фаз — в `docs/plans/phase-1.md` … `docs/plans/phase-4.md`.
