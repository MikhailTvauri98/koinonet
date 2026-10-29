# План фазы 3: календарь — события, слоты, назначения, шаблоны, напоминания, iCal

> **Для агентов-исполнителей:** ОБЯЗАТЕЛЬНЫЙ СУБ-SKILL: используйте `superpowers:subagent-driven-development` (рекомендуется) или `superpowers:executing-plans`, чтобы выполнять план задача за задачей. Шаги размечены чекбоксами (`- [ ]`).

**Цель:** довести систему до состояния, в котором шаблон воскресного служения сам создаёт события на восемь недель вперёд, лидеры с телефона заполняют слоты людьми с нужными ролями и видят пересечения до выбора, а назначенные получают уведомления о назначении, изменении и отмене и напоминания за сутки и за два часа, плюс ленту iCal в календаре телефона.

**Архитектура:** один новый модуль `Calendar` с таблицами событий, слотов, назначений, шаблонов и напоминаний. События материализуются из шаблонов независимыми записями (ADR-0005), слоты требуют роли служений (ADR-0004) и типизированы дискриминатором `resource_type` (ADR-0007). Права управления идут через `EventAccess`, единственный сервис видимости и управления событиями; Chat в фазе 4 опирается на него. Calendar публикует `EventCreated`, `EventChanged`, `EventCancelled`, `AssignmentCreated`, `AssignmentRemoved`, `EventReminderDue`; Notifications слушает их и рассылает уведомления категорий `assignments` и `reminders` через `AppNotification` фазы 2. Две консольные команды в расписании: `calendar:materialize` раз в сутки и `calendar:send-reminders` каждые пять минут.

**Стек:** к стеку фаз 1–2 добавляется `spatie/icalendar-generator` для ленты iCal; на клиенте новых зависимостей нет.

**Спецификация:** [docs/architecture.md](../architecture.md) — разделы 5.4, 5.9 (`calendar.horizon_weeks`, `calendar.reminder_offsets`), 6.1 (ключи `calendar.church.manage`, `events.manage`, `slots.assign`), 6.3 (пункт 6), 6.4 (события, шаблоны, медиафайлы), 6.5 (отмена событий), 7.3 (архивация служения), 7.4, 7.7 (категории `assignments` и `reminders`), 8 (Calendar), 10, 12 (тесты генерации и пересечений), 13 (фаза 3), 15 (риск 6); словарь [CONTEXT.md](../../CONTEXT.md) — раздел «Календарь»; решения [docs/adr](../adr/) 0004, 0005, 0007.

---

## Глобальные ограничения

Действуют ограничения фаз 1 и 2. Дополнительно в фазе 3:

- Моменты времени событий (`starts_at`, `ends_at`, `cancelled_at`) хранятся в UTC. Локальное время шаблона (`start_time`) и даты (`occurrence_date`, `generated_until`, границы `from`/`to`) — по календарю церкви. Единственный источник часового пояса — `ChurchSettings::timezone()`; `config('app.timezone')` остаётся `UTC` и в вычислениях не участвует.
- `ends_at > starts_at` проверяется check-ограничением базы и валидацией запроса.
- `resource_type` допускает только `person` (check-ограничение); при `resource_type = 'person'` заполнен `person_id`. Помещения и техника не реализуются (раздел 1), но новое значение добавляется миграцией без правки кода календаря (ADR-0007).
- Предупреждения (`role_mismatch`, `time_conflict`, `over_capacity`) возвращаются в массиве `warnings` успешного ответа и никогда не блокируют операцию. Пересечение считается по полуоткрытому интервалу `[starts_at, ends_at)` среди событий со статусом `scheduled`.
- Каталог прав расширяется ровно тремя ключами: `calendar.church.manage` (глобальный), `events.manage` и `slots.assign` (служения). Каждый ключ появляется в той задаче, где впервые проверяется тестом.
- Генерация идемпотентна: частичный уникальный индекс `(template_id, occurrence_date)` — единственная защита от дублей, повторный запуск команды не создаёт и не меняет ничего. Отменённые события не пересоздаются, правки шаблона созданные события не трогают.
- Команды расписания: `calendar:materialize` — `dailyAt('03:00')`, `calendar:send-reminders` — `everyFiveMinutes()->withoutOverlapping()`. Обе идемпотентны и безопасны при повторном запуске.
- Миграции фазы нумеруются с `2026_11_01_000800`.

---

## Решения планирования

1. **Ключи прав вводятся вместе с первыми тестами:** `calendar.church.manage` и `events.manage` — в задаче 2, `slots.assign` — в задаче 3 (правило видимости «носители `slots.assign` видят события с нужными им слотами»). Иначе `PermissionCoverageTest` фазы 1 упадёт на промежуточном коммите.
2. **Колонка `events.chat_id` не создаётся.** Связь «событие → чат» хранится на стороне Chat в `chats.event_id` (`UNIQUE`), чат создаётся фазой 4 эндпоинтом `POST /events/{id}/chat` в модуле Chat. Раздел 5.4 архитектуры правится этим планом; та же логика для `ministries.chat_id` зафиксирована планом фазы 4.
3. **Флаг «уведомить» при создании события не хранится.** `POST /events` принимает `notify: none | ministry | all` (по умолчанию `none`); значение уезжает в событии `EventCreated(string $eventId, string $notify)`. `ministry` допустим только для событий служения, `all` — только для церковных; иное — ошибка валидации.
4. **`EventAccess` — единственная точка правил доступа к событиям:** `canView(User, Event)`, `canManage(User, Event)`, `canFillSlot(User, EventSlot)`, `canManageTemplate(User, EventTemplate)`. Политики событий, слотов, назначений и шаблонов делегируют ему; резолвер владельца медиафайла и Chat (фаза 4, чат события) тоже.
5. **Точка расширения для блокировок роли:** Access получает контракт `Access\Contracts\RoleUsageSource { /** @return list<array{type: string, id: string, title: string}> */ public function blockersFor(Role $role): array; }`, реализации регистрируются тегом `access.role_usage_sources`, `RoleUsageCollector::for` добавляет их результат к своим блокировкам. Calendar регистрирует `CalendarRoleUsageSource` с типами `event_slot` (слоты будущих событий `scheduled`) и `template_slot` (слоты активных неархивных шаблонов). `DeleteRole` фазы 1 уже переводит неизвестные типы в `role.in_use`.
6. **Пересечения считает `TimeConflictFinder::conflictsFor(string $personId, CarbonImmutable $from, CarbonImmutable $to, ?string $exceptEventId = null): Collection<int, Event>`** — события `scheduled`, куда человек назначен, пересекающие `[from, to)`. Индекс `event_assignments (person_id)` плюс `events (starts_at)` достаточны (раздел 7.4).
7. **Напоминание — доменное событие Calendar.** Команда `calendar:send-reminders` пишет `event_reminders` и публикует `EventReminderDue(string $eventId, ReminderKind $kind)`; слушатель в Notifications рассылает `EventReminderNotification` назначенным с аккаунтом. Так Notifications по-прежнему «слушает, а не вызывается» (раздел 4, правило 5). Смещения берутся из `calendar.reminder_offsets`: `h24` → 24 часа, `h2` → 2 часа.
8. **Локальное время шаблона переводится в UTC на каждую дату отдельно:** `CarbonImmutable::createFromFormat('Y-m-d H:i', "{$date} {$template->start_time}", $tz)->utc()`. Переход на летнее время меняет UTC-час, но сохраняет «10:00 по церкви». Тест генерации с переходом обязателен (раздел 12).
9. **Удаление слота снимает его назначения** и публикует `AssignmentRemoved` на каждое, чтобы уведомления и (в фазе 4) чат события отреагировали.
10. **`GET /events` требует диапазон не длиннее 93 дней;** без `from`/`to` — от сегодня по календарю церкви на 28 дней вперёд. `scope=church` (по умолчанию) — всё, что видно смотрящему; `ministry:{id}` — события, которыми владеет служение; `mine` — события, куда назначен человек смотрящего. Постраничная пагинация с `per_page` до 200.
11. **Отменённое событие заморожено:** слоты, назначения и время не меняются (код `event.cancelled`), описание и место править можно, событие остаётся в списках с пометкой.
12. **Событие из шаблона на выбранную дату** получает `occurrence_date = дата`; попытка второй раз на ту же дату — `event.occurrence_exists` (проверка до вставки, а не перехват ошибки индекса).
13. **iCal через `spatie/icalendar-generator`:** UID `event-{id}@{host APP_URL}`, `DTSTART`/`DTEND` в UTC, `DESCRIPTION` — подписи слотов, куда назначен человек. Перевыпуск токена — Action модуля Directory (`users.ical_token` — его таблица), эндпоинт `POST /me/ical-token/rotate` живёт в Directory; лента — в Calendar.
14. **Архивация служения обрабатывается слушателем Calendar:** шаблоны служения деактивируются, будущие события `scheduled` отменяются с причиной «Служение архивировано» через тот же `CancelEvent`, поэтому уведомления назначенным уходят обычным путём (раздел 7.3).
15. **`created_by_user_id` у событий и шаблонов и `assigned_by_user_id` у назначений допускают `null`:** `CalendarAccountEraser` обнуляет их при стирании аккаунта (контракт `AccountEraser` фазы 1). Раздел 5.4 правится.
16. **Кандидаты в слот:** для слота с ролью — участники служения роли, у которых она есть; для свободного слота — активные люди по поиску от двух символов (до 20). У каждого кандидата `conflicts: list<{event_id, title, starts_at}>`. Носитель `slots.assign` кандидатов свободного слота не видит — ему нечего туда ставить.
17. **Слот принимает от 1 до 50 человек** (`required_count`), подпись до 100 символов; роль слота — только роль служения (`scope = ministry`) неархивного служения.
18. **Личный календарь и главная:** страница календаря имеет переключатель «Все / Мои»; главная показывает до пяти ближайших событий, куда назначен человек (`scope=mine`, 14 дней).

---

## Структура файлов

```text
apps/api/
├── app/Modules/Calendar/
│   ├── Models/Event.php, EventSlot.php, EventAssignment.php, EventTemplate.php,
│   │          EventTemplateSlot.php, EventReminder.php
│   ├── EventOwnerType.php, EventVisibility.php, EventStatus.php, ResourceType.php, ReminderKind.php
│   ├── EventAccess.php                     правила видимости и управления
│   ├── TimeConflictFinder.php
│   ├── RecurrenceRule.php                  правило повторения: разбор, проверка, даты
│   ├── IcalFeedBuilder.php
│   ├── CalendarAccountEraser.php
│   ├── EventMediaOwnerResolver.php
│   ├── Access/CalendarRoleUsageSource.php
│   ├── Actions/CreateEvent.php, UpdateEvent.php, CancelEvent.php,
│   │           AddSlot.php, UpdateSlot.php, RemoveSlot.php,
│   │           AssignPerson.php, RemoveAssignment.php,
│   │           CreateTemplate.php, UpdateTemplate.php, ArchiveTemplate.php,
│   │           CreateEventFromTemplate.php, MaterializeTemplate.php, RecordReminder.php
│   ├── Events/EventCreated.php, EventChanged.php, EventCancelled.php,
│   │          AssignmentCreated.php, AssignmentRemoved.php, EventReminderDue.php
│   ├── Listeners/OnMinistryArchived.php
│   ├── Console/MaterializeCommand.php, SendRemindersCommand.php
│   ├── Policies/EventPolicy.php, EventSlotPolicy.php, EventTemplatePolicy.php
│   ├── Http/Controllers/EventController.php, SlotController.php, AssignmentController.php,
│   │                    CandidateController.php, TemplateController.php, IcalFeedController.php
│   ├── Http/Queries/EventIndexQuery.php
│   ├── Http/Requests/…, Http/Resources/EventResource.php, EventSlotResource.php,
│   │                    EventAssignmentResource.php, EventTemplateResource.php, CandidateResource.php
│   ├── Database/Migrations/2026_11_01_000800_create_calendar_tables.php
│   └── routes.php
├── app/Modules/Access/Contracts/RoleUsageSource.php         новый контракт
├── app/Modules/Access/RoleUsageCollector.php                опрашивает источники
├── app/Modules/Access/Permission.php                        +3 ключа
├── app/Modules/Directory/Actions/RotateIcalToken.php, Http/Controllers/IcalTokenController.php
├── app/Modules/Notifications/Notifications/AssignmentCreatedNotification.php,
│       AssignmentRemovedNotification.php, EventChangedNotification.php,
│       EventCancelledNotification.php, EventAnnouncedNotification.php, EventReminderNotification.php
├── app/Modules/Notifications/Listeners/NotifyAboutAssignment.php, NotifyAboutEventChange.php,
│       NotifyAboutEventCancellation.php, NotifyAboutNewEvent.php, NotifyAboutReminder.php
├── app/Modules/Notifications/Recipients.php                 +assignedToEvent()
├── routes/console.php                                       расписание двух команд
└── tests/Feature/Calendar/…, tests/Unit/Calendar/…, tests/Feature/Notifications/…

apps/web/
├── app/pages/calendar.vue, events/[id].vue, templates/index.vue, templates/[id].vue,
│             ministries/[id]/events.vue, settings/ical.vue
├── app/components/calendar/EventList.vue, EventCard.vue, SlotList.vue, EventEditor.vue,
│       SlotEditor.vue, CancelEventDialog.vue, AssignDialog.vue, WarningList.vue,
│       TemplateEditor.vue, RecurrenceEditor.vue, UpcomingEvents.vue
├── app/composables/useEvents.ts
└── tests/component/calendar.spec.ts, event-editor.spec.ts, assign-dialog.spec.ts, templates.spec.ts,
    tests/unit/recurrence.spec.ts, e2e/calendar.spec.ts
```

---

## Блок 1. Схема, события, слоты, назначения

### Задача 1: Таблицы календаря, модели, перечисления, фабрики

**Файлы:**
- Создать: `app/Modules/Calendar/Database/Migrations/2026_11_01_000800_create_calendar_tables.php`; `Models/Event.php`, `EventSlot.php`, `EventAssignment.php`, `EventTemplate.php`, `EventTemplateSlot.php`, `EventReminder.php`; `EventOwnerType.php`, `EventVisibility.php`, `EventStatus.php`, `ResourceType.php`, `ReminderKind.php`; `database/factories/EventFactory.php`, `EventSlotFactory.php`, `EventAssignmentFactory.php`, `EventTemplateFactory.php`, `EventTemplateSlotFactory.php`
- Изменить: `AppServiceProvider` (морф-имена `event`, `event_template`)
- Тест: `tests/Feature/Calendar/CalendarSchemaTest.php`

**Интерфейсы:**
- Отдаёт наружу: модели с отношениями `Event::slots()`, `Event::ministry()`, `Event::template()`, `EventSlot::assignments()`, `EventSlot::role()`, `EventAssignment::person()`, `EventTemplate::slots()`.
- Отдаёт наружу: `enum EventOwnerType: string { Church = 'church'; Ministry = 'ministry'; }`, `enum EventVisibility: string { Church = 'church'; Ministry = 'ministry'; Assigned = 'assigned'; }`, `enum EventStatus: string { Scheduled = 'scheduled'; Cancelled = 'cancelled'; }`, `enum ResourceType: string { Person = 'person'; }`, `enum ReminderKind: string { H24 = 'h24'; H2 = 'h2'; public function offset(): CarbonInterval; }`.
- Отдаёт наружу: фабрики. `Event::factory()` — церковное событие `scheduled` завтра 10:00–12:00 UTC, видимость `church`; состояния `ministry(Ministry $m)` (владелец и видимость `ministry`), `visibility(EventVisibility $v)`, `cancelled()`, `between(CarbonImmutable $start, CarbonImmutable $end)`, `fromTemplate(EventTemplate $t, string $date)`. `EventSlot::factory()->for($event)` — свободный слот «Помощник» на одного; состояние `withRole(Role $role)`. `EventAssignment::factory()->for($slot)->for($person)`. `EventTemplate::factory()` — церковный шаблон без повторения, 10:00, 120 минут; состояния `ministry(Ministry $m)`, `weekly(int $isoWeekday)`, `biweekly(int $isoWeekday, string $anchorDate)`, `monthlyNth(int $nth, int $isoWeekday)`, `inactive()`, `archived()`.

- [x] **Шаг 1: Написать падающие тесты**

`tests/Feature/Calendar/CalendarSchemaTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventAssignment;
use App\Modules\Calendar\Models\EventReminder;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Calendar\Models\EventTemplate;
use App\Modules\Directory\Models\Person;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

it('requires the end to come after the start', function () {
    expect(fn () => Event::factory()->create(['starts_at' => '2026-11-08 10:00:00', 'ends_at' => '2026-11-08 10:00:00']))
        ->toThrow(QueryException::class);
});

it('forbids a ministry on a church event and requires one on a ministry event', function () {
    expect(fn () => Event::factory()->create(['owner_type' => 'church', 'ministry_id' => ministryWithRoles()->id]))
        ->toThrow(QueryException::class);
    expect(fn () => Event::factory()->create(['owner_type' => 'ministry', 'ministry_id' => null]))
        ->toThrow(QueryException::class);
});

it('forbids ministry visibility on a church event', function () {
    expect(fn () => Event::factory()->create(['owner_type' => 'church', 'visibility' => 'ministry']))
        ->toThrow(QueryException::class);
});

it('accepts only people as resources for now', function () {
    $slot = EventSlot::factory()->create();

    expect(fn () => DB::table('event_slots')->where('id', $slot->id)->update(['resource_type' => 'room']))
        ->toThrow(QueryException::class);
});

it('requires a person on a person assignment', function () {
    $slot = EventSlot::factory()->create();

    expect(fn () => EventAssignment::factory()->for($slot)->create(['person_id' => null]))
        ->toThrow(QueryException::class);
});

it('does not let the same person be assigned to a slot twice', function () {
    $slot = EventSlot::factory()->create();
    $person = Person::factory()->create();
    EventAssignment::factory()->for($slot)->for($person)->create();

    expect(fn () => EventAssignment::factory()->for($slot)->for($person)->create())->toThrow(QueryException::class);
});

it('keeps one event per template and occurrence date', function () {
    $template = EventTemplate::factory()->weekly(7)->create();
    Event::factory()->fromTemplate($template, '2026-11-08')->create();

    expect(fn () => Event::factory()->fromTemplate($template, '2026-11-08')->create())->toThrow(QueryException::class);
});

it('allows many events without a template on the same date', function () {
    Event::factory()->count(2)->create(['occurrence_date' => '2026-11-08']);

    expect(Event::query()->count())->toBe(2);
});

it('records one reminder of each kind per event', function () {
    $event = Event::factory()->create();
    EventReminder::query()->create(['event_id' => $event->id, 'kind' => 'h24', 'sent_at' => now()]);

    expect(fn () => EventReminder::query()->create(['event_id' => $event->id, 'kind' => 'h24', 'sent_at' => now()]))
        ->toThrow(QueryException::class);
});

it('requires a positive slot capacity', function () {
    expect(fn () => EventSlot::factory()->create(['required_count' => 0]))->toThrow(QueryException::class);
});
```

- [x] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Feature/Calendar/CalendarSchemaTest.php`
Ожидается: FAIL, таблиц и фабрик нет.

- [x] **Шаг 3: Миграция**

```php
Schema::create('event_templates', function (Blueprint $table) {
    $table->char('id', 26)->primary();
    $table->string('owner_type', 16);
    $table->char('ministry_id', 26)->nullable();
    $table->string('title', 200);
    $table->text('description')->nullable();
    $table->string('location', 200)->nullable();
    $table->string('visibility', 16);
    $table->time('start_time');
    $table->integer('duration_minutes');
    $table->jsonb('recurrence')->nullable();
    $table->boolean('active')->default(true);
    $table->date('generated_until')->nullable();
    $table->char('created_by_user_id', 26)->nullable();
    $table->timestampTz('archived_at')->nullable();
    $table->timestampsTz();

    $table->foreign('ministry_id')->references('id')->on('ministries')->restrictOnDelete();
    $table->foreign('created_by_user_id')->references('id')->on('users')->restrictOnDelete();
    $table->index(['owner_type', 'ministry_id']);
});

DB::statement("ALTER TABLE event_templates ADD CONSTRAINT event_templates_owner_check
    CHECK ((owner_type = 'church' AND ministry_id IS NULL) OR (owner_type = 'ministry' AND ministry_id IS NOT NULL))");
DB::statement("ALTER TABLE event_templates ADD CONSTRAINT event_templates_visibility_check
    CHECK (visibility IN ('church', 'ministry', 'assigned') AND NOT (owner_type = 'church' AND visibility = 'ministry'))");
DB::statement('ALTER TABLE event_templates ADD CONSTRAINT event_templates_duration_check CHECK (duration_minutes > 0)');

Schema::create('events', function (Blueprint $table) {
    $table->char('id', 26)->primary();
    $table->string('owner_type', 16);
    $table->char('ministry_id', 26)->nullable();
    $table->char('template_id', 26)->nullable();
    $table->date('occurrence_date')->nullable();
    $table->string('title', 200);
    $table->text('description')->nullable();
    $table->string('location', 200)->nullable();
    $table->timestampTz('starts_at');
    $table->timestampTz('ends_at');
    $table->string('visibility', 16);
    $table->string('status', 16)->default('scheduled');
    $table->timestampTz('cancelled_at')->nullable();
    $table->string('cancel_reason', 500)->nullable();
    $table->char('created_by_user_id', 26)->nullable();
    $table->timestampTz('archived_at')->nullable();
    $table->timestampsTz();

    $table->foreign('ministry_id')->references('id')->on('ministries')->restrictOnDelete();
    $table->foreign('template_id')->references('id')->on('event_templates')->restrictOnDelete();
    $table->foreign('created_by_user_id')->references('id')->on('users')->restrictOnDelete();
    $table->index('starts_at');
    $table->index(['ministry_id', 'starts_at']);
});

DB::statement("ALTER TABLE events ADD CONSTRAINT events_owner_check
    CHECK ((owner_type = 'church' AND ministry_id IS NULL) OR (owner_type = 'ministry' AND ministry_id IS NOT NULL))");
DB::statement("ALTER TABLE events ADD CONSTRAINT events_visibility_check
    CHECK (visibility IN ('church', 'ministry', 'assigned') AND NOT (owner_type = 'church' AND visibility = 'ministry'))");
DB::statement("ALTER TABLE events ADD CONSTRAINT events_status_check CHECK (status IN ('scheduled', 'cancelled'))");
DB::statement('ALTER TABLE events ADD CONSTRAINT events_time_check CHECK (ends_at > starts_at)');
DB::statement('CREATE UNIQUE INDEX events_template_occurrence_idx ON events (template_id, occurrence_date) WHERE template_id IS NOT NULL');

Schema::create('event_slots', function (Blueprint $table) {
    $table->char('id', 26)->primary();
    $table->char('event_id', 26);
    $table->string('label', 100);
    $table->string('resource_type', 16)->default('person');
    $table->char('role_id', 26)->nullable();
    $table->smallInteger('required_count');
    $table->integer('sort_order')->default(0);
    $table->timestampsTz();

    $table->foreign('event_id')->references('id')->on('events')->restrictOnDelete();
    $table->foreign('role_id')->references('id')->on('roles')->restrictOnDelete();
    $table->index('event_id');
    $table->index('role_id');
});

DB::statement("ALTER TABLE event_slots ADD CONSTRAINT event_slots_resource_check CHECK (resource_type IN ('person'))");
DB::statement('ALTER TABLE event_slots ADD CONSTRAINT event_slots_count_check CHECK (required_count > 0)');

Schema::create('event_template_slots', function (Blueprint $table) {
    $table->char('id', 26)->primary();
    $table->char('template_id', 26);
    $table->string('label', 100);
    $table->string('resource_type', 16)->default('person');
    $table->char('role_id', 26)->nullable();
    $table->smallInteger('required_count');
    $table->integer('sort_order')->default(0);
    $table->timestampsTz();

    $table->foreign('template_id')->references('id')->on('event_templates')->restrictOnDelete();
    $table->foreign('role_id')->references('id')->on('roles')->restrictOnDelete();
    $table->index('role_id');
});

DB::statement("ALTER TABLE event_template_slots ADD CONSTRAINT event_template_slots_resource_check CHECK (resource_type IN ('person'))");
DB::statement('ALTER TABLE event_template_slots ADD CONSTRAINT event_template_slots_count_check CHECK (required_count > 0)');

Schema::create('event_assignments', function (Blueprint $table) {
    $table->char('id', 26)->primary();
    $table->char('slot_id', 26);
    $table->string('resource_type', 16)->default('person');
    $table->char('person_id', 26)->nullable();
    $table->char('assigned_by_user_id', 26)->nullable();
    $table->timestampTz('created_at');

    $table->foreign('slot_id')->references('id')->on('event_slots')->restrictOnDelete();
    $table->foreign('person_id')->references('id')->on('people')->restrictOnDelete();
    $table->foreign('assigned_by_user_id')->references('id')->on('users')->restrictOnDelete();
    $table->unique(['slot_id', 'person_id']);
    $table->index('person_id');
});

DB::statement("ALTER TABLE event_assignments ADD CONSTRAINT event_assignments_resource_check
    CHECK (resource_type = 'person' AND person_id IS NOT NULL)");

Schema::create('event_reminders', function (Blueprint $table) {
    $table->char('event_id', 26);
    $table->string('kind', 8);
    $table->timestampTz('sent_at');
    $table->primary(['event_id', 'kind']);
    $table->foreign('event_id')->references('id')->on('events')->restrictOnDelete();
});

DB::statement("ALTER TABLE event_reminders ADD CONSTRAINT event_reminders_kind_check CHECK (kind IN ('h24', 'h2'))");
```

- [x] **Шаг 4: Модели, перечисления, фабрики**

`Event` с `HasUlids`, `$guarded = []`, casts: `owner_type => EventOwnerType`, `visibility => EventVisibility`, `status => EventStatus`, `starts_at`, `ends_at`, `cancelled_at` → `immutable_datetime`, `occurrence_date` → `immutable_date`. Методы: `isCancelled(): bool`, `isPast(): bool` (`ends_at <= now()`), `slots(): HasMany` (по `sort_order`), `assignedPersonIds(): list<string>`.

```php
enum ReminderKind: string
{
    case H24 = 'h24';
    case H2 = 'h2';

    public function offset(): CarbonInterval
    {
        return match ($this) {
            self::H24 => CarbonInterval::hours(24),
            self::H2 => CarbonInterval::hours(2),
        };
    }

    public function label(): string
    {
        return match ($this) {
            self::H24 => 'за сутки',
            self::H2 => 'за два часа',
        };
    }
}
```

`EventFactory::definition()`:

```php
return [
    'owner_type' => EventOwnerType::Church,
    'ministry_id' => null,
    'title' => 'Воскресное служение',
    'starts_at' => CarbonImmutable::tomorrow('UTC')->setTime(10, 0),
    'ends_at' => CarbonImmutable::tomorrow('UTC')->setTime(12, 0),
    'visibility' => EventVisibility::Church,
    'status' => EventStatus::Scheduled,
];
```

Состояние `ministry(Ministry $m)` ставит `owner_type = ministry`, `ministry_id`, `visibility = ministry`. `fromTemplate($t, $date)` копирует владельца и видимость, ставит `template_id`, `occurrence_date`. Морф-имена: `'event' => Event::class`, `'event_template' => EventTemplate::class` в `enforceMorphMap`.

- [x] **Шаг 5: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Feature/Calendar/CalendarSchemaTest.php`
Ожидается: PASS, 10 тестов.

- [x] **Шаг 6: Коммит**

```bash
git add apps/api && git commit -m "feat(calendar): tables, models, enums and factories for events, slots, assignments, templates"
```

**Критерии готовности:**
- Все инварианты раздела 5.4 стоят в базе: согласованность владельца, запрет видимости `ministry` у церковного события, `ends_at > starts_at`, положительная ёмкость слота, единственное значение `resource_type`, уникальность `(slot, person)` и `(template, occurrence_date)`, одно напоминание каждого вида.
- Фабрики дают все состояния, нужные тестам следующих задач, без ручной сборки записей.
- `php artisan migrate:fresh` проходит на чистой базе вместе с миграциями фаз 1–2.

---
### Задача 2: Событие — создание, карточка, правка, права управления

**Файлы:**
- Создать: `app/Modules/Calendar/Actions/CreateEvent.php`, `UpdateEvent.php`; `EventAccess.php`; `Policies/EventPolicy.php`; `Http/Controllers/EventController.php`, `Http/Requests/StoreEventRequest.php`, `UpdateEventRequest.php`, `Http/Resources/EventResource.php`, `EventSlotResource.php`, `EventAssignmentResource.php`; `Events/EventCreated.php`, `EventChanged.php`; `CalendarAccountEraser.php`; `app/Modules/Calendar/routes.php`
- Изменить: `app/Modules/Access/Permission.php` (ключи `calendar.church.manage`, `events.manage`), `AppServiceProvider` (тег `directory.account_erasers`)
- Тест: `tests/Feature/Calendar/EventCrudTest.php`

**Интерфейсы:**
- Отдаёт наружу: `Permission::CalendarChurchManage = 'calendar.church.manage'` (глобальное, «Управлять церковным календарём»), `Permission::EventsManage = 'events.manage'` (служения, «Управлять событиями служения»).
- Отдаёт наружу: `CreateEvent::handle(User $creator, array $attributes): Event` — `attributes`: `owner_type`, `ministry_id`, `title`, `description`, `location`, `starts_at`, `ends_at` (ISO 8601), `visibility`, `slots: list<array{label?: string, role_id?: string, required_count: int}>`, `notify: 'none'|'ministry'|'all'`, `media_ids: list<string>` (задача 6). `UpdateEvent::handle(Event $event, array $attributes): Event` — те же поля без `owner_type`, `ministry_id`, `slots`, `notify`.
- Отдаёт наружу: `EventAccess::canManage(User $user, Event $event): bool` — владелец `church` → `calendar.church.manage`; `ministry` → `events.manage` в служении. `canView` наполняет задача 3, `canFillSlot` — задача 5, `canManageTemplate` — задача 8.
- Отдаёт наружу: `EventCreated(string $eventId, string $notify)`, `EventChanged(string $eventId, list<string> $changed)` — `changed` содержит только `starts_at`, `ends_at`, `location`; изменение одного описания событие не публикует.
- Отдаёт наружу: `POST /events`, `GET /events/{id}`, `PATCH /events/{id}`. `EventResource`: `id`, `owner_type`, `ministry: {id, name}|null`, `template_id`, `occurrence_date`, `title`, `description`, `location`, `starts_at`, `ends_at`, `visibility`, `status`, `cancelled_at`, `cancel_reason`, `can_manage`, `slots: list<EventSlotResource>`, `attachments` (задача 6). `EventSlotResource`: `id`, `label`, `resource_type`, `role: {id, name, ministry_id}|null`, `required_count`, `filled_count`, `sort_order`, `can_fill` (задача 5), `assignments: list<{id, person: {id, full_name, photo_thumb_url}, created_at}>`.
- Коды ошибок: `event.cancelled` (правка времени отменённого), `slot.label_required`, `slot.role_not_ministry`.

- [ ] **Шаг 1: Написать падающие тесты**

`tests/Feature/Calendar/EventCrudTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Calendar\Events\EventChanged;
use App\Modules\Calendar\Events\EventCreated;
use App\Modules\Calendar\Models\Event;
use Illuminate\Support\Facades\Event as EventBus;

function churchEvent(array $over = []): array
{
    return [
        'owner_type' => 'church', 'title' => 'Воскресное служение',
        'starts_at' => '2026-11-08T07:00:00Z', 'ends_at' => '2026-11-08T09:00:00Z',
        'visibility' => 'church', 'slots' => [], ...$over,
    ];
}

it('denies creating a church event without calendar.church.manage', function () {
    actingAsUserWith([Permission::PeopleView]);

    $this->postJson('/api/v1/events', churchEvent())->assertForbidden();
});

it('creates a church event with slots and derives labels from roles', function () {
    $ministry = ministryWithRoles();
    $vocalist = Role::query()->create(['scope' => 'ministry', 'ministry_id' => $ministry->id, 'name' => 'Вокалист']);
    actingAsUserWith([Permission::CalendarChurchManage]);

    $this->postJson('/api/v1/events', churchEvent(['slots' => [
        ['role_id' => $vocalist->id, 'required_count' => 2],
        ['label' => 'Встречающий', 'required_count' => 1],
    ]]))->assertCreated()
        ->assertJsonPath('data.slots.0.label', 'Вокалист')
        ->assertJsonPath('data.slots.0.role.id', $vocalist->id)
        ->assertJsonPath('data.slots.0.required_count', 2)
        ->assertJsonPath('data.slots.1.label', 'Встречающий')
        ->assertJsonPath('data.slots.1.role', null)
        ->assertJsonPath('data.can_manage', true);
});

it('lets a slot label override the role name', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::CalendarChurchManage]);

    $this->postJson('/api/v1/events', churchEvent(['slots' => [
        ['role_id' => $ministry->default_role_id, 'label' => 'Любой участник', 'required_count' => 3],
    ]]))->assertCreated()->assertJsonPath('data.slots.0.label', 'Любой участник');
});

it('refuses a free slot without a label', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);

    $this->postJson('/api/v1/events', churchEvent(['slots' => [['required_count' => 1]]]))
        ->assertStatus(422)->assertJsonPath('code', 'slot.label_required');
});

it('refuses a global role as a slot requirement', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $global = Role::factory()->global()->create();

    $this->postJson('/api/v1/events', churchEvent(['slots' => [['role_id' => $global->id, 'required_count' => 1]]]))
        ->assertStatus(422)->assertJsonPath('code', 'slot.role_not_ministry');
});

it('refuses ministry visibility on a church event', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);

    $this->postJson('/api/v1/events', churchEvent(['visibility' => 'ministry']))
        ->assertStatus(422)->assertJsonValidationErrors('visibility');
});

it('refuses an end before the start', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);

    $this->postJson('/api/v1/events', churchEvent(['ends_at' => '2026-11-08T06:00:00Z']))
        ->assertStatus(422)->assertJsonValidationErrors('ends_at');
});

it('denies creating a ministry event without events.manage in that ministry', function () {
    $ministry = ministryWithRoles();
    $user = actingAsUser();
    memberOf($ministry, $user->person);

    $this->postJson('/api/v1/events', churchEvent(['owner_type' => 'ministry', 'ministry_id' => $ministry->id]))
        ->assertForbidden();
});

it('lets a leader create a ministry event and manage it', function () {
    $ministry = ministryWithRoles();
    $user = actingAsUser();
    memberOf($ministry, $user->person, [$ministry->roles()->where('name', 'Лидер')->sole()->id]);

    $this->postJson('/api/v1/events', churchEvent(['owner_type' => 'ministry', 'ministry_id' => $ministry->id, 'visibility' => 'ministry']))
        ->assertCreated()
        ->assertJsonPath('data.ministry.id', $ministry->id)
        ->assertJsonPath('data.can_manage', true);
});

it('does not let a ministry leader create a church event', function () {
    $ministry = ministryWithRoles();
    $user = actingAsUser();
    memberOf($ministry, $user->person, [$ministry->roles()->where('name', 'Лидер')->sole()->id]);

    $this->postJson('/api/v1/events', churchEvent())->assertForbidden();
});

it('lets ministries.manage_all create an event for any ministry', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::MinistriesManageAll]);

    $this->postJson('/api/v1/events', churchEvent(['owner_type' => 'ministry', 'ministry_id' => $ministry->id]))
        ->assertCreated();
});

it('validates the notify flag against the owner', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::CalendarChurchManage, Permission::MinistriesManageAll]);

    $this->postJson('/api/v1/events', churchEvent(['notify' => 'ministry']))
        ->assertStatus(422)->assertJsonValidationErrors('notify');

    $this->postJson('/api/v1/events', churchEvent(['owner_type' => 'ministry', 'ministry_id' => $ministry->id, 'notify' => 'all']))
        ->assertStatus(422)->assertJsonValidationErrors('notify');
});

it('publishes EventCreated with the notify flag', function () {
    EventBus::fake([EventCreated::class]);
    actingAsUserWith([Permission::CalendarChurchManage]);

    $this->postJson('/api/v1/events', churchEvent(['notify' => 'all']))->assertCreated();

    EventBus::assertDispatched(EventCreated::class, fn (EventCreated $e) => $e->notify === 'all');
});

it('updates the time and publishes EventChanged with the changed fields', function () {
    EventBus::fake([EventChanged::class]);
    actingAsUserWith([Permission::CalendarChurchManage]);
    $event = Event::factory()->create();

    $this->patchJson("/api/v1/events/{$event->id}", ['starts_at' => '2026-11-08T08:00:00Z', 'ends_at' => '2026-11-08T10:00:00Z', 'location' => 'Зал 2'])
        ->assertOk()->assertJsonPath('data.location', 'Зал 2');

    EventBus::assertDispatched(EventChanged::class, fn (EventChanged $e) => $e->changed === ['starts_at', 'ends_at', 'location']);
});

it('does not publish EventChanged when only the description changed', function () {
    EventBus::fake([EventChanged::class]);
    actingAsUserWith([Permission::CalendarChurchManage]);
    $event = Event::factory()->create();

    $this->patchJson("/api/v1/events/{$event->id}", ['description' => 'Принесите Библии'])->assertOk();

    EventBus::assertNotDispatched(EventChanged::class);
});

it('refuses to move a cancelled event but allows editing its description', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $event = Event::factory()->cancelled()->create();

    $this->patchJson("/api/v1/events/{$event->id}", ['starts_at' => '2026-11-09T07:00:00Z', 'ends_at' => '2026-11-09T09:00:00Z'])
        ->assertStatus(422)->assertJsonPath('code', 'event.cancelled');
    $this->patchJson("/api/v1/events/{$event->id}", ['description' => 'Перенесено'])->assertOk();
});

it('shows can_manage false to a plain viewer', function () {
    actingAsUser();
    $event = Event::factory()->create();

    $this->getJson("/api/v1/events/{$event->id}")->assertOk()->assertJsonPath('data.can_manage', false);
});
```

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Feature/Calendar/EventCrudTest.php`
Ожидается: FAIL.

- [ ] **Шаг 3: Ключи прав и `EventAccess`**

В `Permission`: `CalendarChurchManage = 'calendar.church.manage'` (глобальное; «Управлять церковным календарём»; «События и шаблоны уровня церкви, все их слоты, отмена, чаты этих событий.») и `EventsManage = 'events.manage'` (служения; «Управлять событиями служения»; «События и шаблоны служения, все их слоты, отмена, чат события.»).

```php
final class EventAccess
{
    public function __construct(private readonly PermissionResolver $permissions) {}

    public function canManage(User $user, Event $event): bool
    {
        return $this->canManageOwner($user, $event->owner_type, $event->ministry_id);
    }

    public function canManageOwner(User $user, EventOwnerType $owner, ?string $ministryId): bool
    {
        return $owner === EventOwnerType::Church
            ? $this->permissions->can($user, Permission::CalendarChurchManage)
            : $this->permissions->canInMinistry($user, Permission::EventsManage, (string) $ministryId);
    }
}
```

`EventPolicy::create(User $user, EventOwnerType $owner, ?string $ministryId)` → `canManageOwner`; `update` → `canManage`; `view` — временно `true` для любого аккаунта, задача 3 заменяет на `canView`.

- [ ] **Шаг 4: Actions и валидация**

`StoreEventRequest`: `owner_type` — `required|in:church,ministry`; `ministry_id` — `required_if:owner_type,ministry|prohibited_if:owner_type,church|ulid|exists:ministries,id`; `title` — `required|string|max:200`; `description` — `nullable|string|max:5000`; `location` — `nullable|string|max:200`; `starts_at`, `ends_at` — `required|date`, `ends_at` — `after:starts_at`; `visibility` — `required|in:church,ministry,assigned` плюс правило «не `ministry` при `owner_type = church`»; `slots` — `array|max:30`, `slots.*.label` — `nullable|string|max:100`, `slots.*.role_id` — `nullable|ulid|exists:roles,id`, `slots.*.required_count` — `required|integer|min:1|max:50`; `notify` — `in:none,ministry,all` с правилом «`ministry` только при владельце-служении, `all` только при церкви»; `media_ids` — `array`, `media_ids.*` — `ulid`.

```php
final class CreateEvent
{
    /** @param array<string, mixed> $attributes */
    public function handle(User $creator, array $attributes): Event
    {
        $event = DB::transaction(function () use ($creator, $attributes) {
            $event = Event::query()->create([
                'owner_type' => $attributes['owner_type'],
                'ministry_id' => $attributes['ministry_id'] ?? null,
                'title' => $attributes['title'],
                'description' => $attributes['description'] ?? null,
                'location' => $attributes['location'] ?? null,
                'starts_at' => CarbonImmutable::parse($attributes['starts_at'])->utc(),
                'ends_at' => CarbonImmutable::parse($attributes['ends_at'])->utc(),
                'visibility' => $attributes['visibility'],
                'status' => EventStatus::Scheduled,
                'created_by_user_id' => $creator->id,
            ]);

            foreach (array_values($attributes['slots'] ?? []) as $position => $slot) {
                app(AddSlot::class)->handle($event, $slot + ['sort_order' => $position]);
            }

            app(SyncAttachments::class)->handle($event, $attributes['media_ids'] ?? [], $creator);

            return $event;
        });

        EventCreated::dispatch($event->id, $attributes['notify'] ?? 'none');

        return $event->load('slots.role', 'slots.assignments.person');
    }
}
```

`AddSlot::handle(Event $event, array $slot): EventSlot` в этой задаче создаётся минимально (валидирует роль и подпись, вставляет строку); задача 4 добавляет ему эндпоинт, проверку отменённого события и соседей `UpdateSlot`/`RemoveSlot`. Правила: `role_id` задан → роль со `scope = ministry`, иначе `slot.role_not_ministry`; подпись = `label ?? role->name`; без роли и без подписи → `slot.label_required`.

`UpdateEvent`: собирает `changed` из `starts_at`, `ends_at`, `location`, сравнивая с текущими значениями; для отменённого события любое из `starts_at`/`ends_at` → `event.cancelled`; публикует `EventChanged` только при непустом `changed`.

`CalendarAccountEraser::eraseAccount` обнуляет `created_by_user_id` в `events` и `event_templates` и `assigned_by_user_id` в `event_assignments`.

- [ ] **Шаг 5: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Feature/Calendar tests/Feature/Access/PermissionCoverageTest.php`
Ожидается: PASS.

- [ ] **Шаг 6: Коммит**

```bash
composer openapi && git add . && git commit -m "feat(calendar): event creation, editing, management permissions and EventAccess"
```

**Критерии готовности:**
- Оба ключа закрыты тестами в своей области: лидер служения не создаёт церковные события, `ministries.manage_all` создаёт для любого служения.
- Слот с ролью получает подпись по имени роли, свободный слот без подписи отвергается (раздел 7.4); глобальная роль в слоте невозможна (ADR-0004).
- `EventChanged` несёт только значимые поля — на этом строятся уведомления задачи 12.
- Отменённое событие не двигается по времени, но описание правится (решение 11).
- `EventAccess` — единственное место правил управления; политики его вызывают, а не дублируют.

---

### Задача 3: Видимость и список событий

**Файлы:**
- Создать: `app/Modules/Calendar/Http/Queries/EventIndexQuery.php`
- Изменить: `EventAccess` (`canView`, `visibleMinistryIds`), `EventPolicy::view`, `EventController::index`, `app/Modules/Access/Permission.php` (`slots.assign`), `routes.php`
- Тест: `tests/Feature/Calendar/EventVisibilityTest.php`, `tests/Feature/Calendar/EventIndexTest.php`

**Интерфейсы:**
- Отдаёт наружу: `Permission::SlotsAssign = 'slots.assign'` (служения, «Заполнять слоты своих ролей»).
- Отдаёт наружу: `EventAccess::canView(User $user, Event $event): bool` по разделу 6.4.
- Отдаёт наружу: `GET /events?from=YYYY-MM-DD&to=YYYY-MM-DD&scope=church|ministry:{id}|mine&page&per_page` — отсортировано по `starts_at`, отменённые включены со статусом.
- Отдаёт наружу: `EventIndexQuery::for(User $viewer, CarbonImmutable $from, CarbonImmutable $to, string $scope): Builder` — переиспользуется лентой iCal (задача 14) и главной.

- [ ] **Шаг 1: Написать падающие тесты**

`tests/Feature/Calendar/EventVisibilityTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Calendar\EventVisibility;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventAssignment;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Directory\Models\Person;

it('shows a church-visible event to anyone', function () {
    actingAsUser();
    $event = Event::factory()->create();

    $this->getJson("/api/v1/events/{$event->id}")->assertOk();
});

it('hides a ministry-visible event from a non-member and shows it to a member', function () {
    $ministry = ministryWithRoles();
    $event = Event::factory()->ministry($ministry)->create();

    actingAsUser();
    $this->getJson("/api/v1/events/{$event->id}")->assertForbidden();

    $member = actingAsUser();
    memberOf($ministry, $member->person);
    $this->getJson("/api/v1/events/{$event->id}")->assertOk();
});

it('shows a ministry-visible event to ministries.view_all', function () {
    $event = Event::factory()->ministry(ministryWithRoles())->create();
    actingAsUserWith([Permission::MinistriesViewAll]);

    $this->getJson("/api/v1/events/{$event->id}")->assertOk();
});

it('hides an assigned-only event from a plain member and shows it to the assigned person', function () {
    $ministry = ministryWithRoles();
    $event = Event::factory()->ministry($ministry)->visibility(EventVisibility::Assigned)->create();
    $slot = EventSlot::factory()->for($event)->create();

    $member = actingAsUser();
    memberOf($ministry, $member->person);
    $this->getJson("/api/v1/events/{$event->id}")->assertForbidden();

    EventAssignment::factory()->for($slot)->for($member->person)->create();
    $this->getJson("/api/v1/events/{$event->id}")->assertOk();
});

it('shows an assigned-only event to its manager', function () {
    $event = Event::factory()->visibility(EventVisibility::Assigned)->create();
    actingAsUserWith([Permission::CalendarChurchManage]);

    $this->getJson("/api/v1/events/{$event->id}")->assertOk();
});

it('shows an assigned-only event to a slots.assign holder whose ministry role is required', function () {
    $ministry = ministryWithRoles();
    $other = ministryWithRoles('Молодёжное');
    $vocalist = Role::query()->create(['scope' => 'ministry', 'ministry_id' => $ministry->id, 'name' => 'Вокалист']);
    $assigner = Role::query()->create(['scope' => 'ministry', 'ministry_id' => $ministry->id, 'name' => 'Координатор']);
    $assigner->permissions()->create(['permission' => Permission::SlotsAssign->value]);

    $event = Event::factory()->visibility(EventVisibility::Assigned)->create();
    EventSlot::factory()->for($event)->withRole($vocalist)->create();

    $user = actingAsUser();
    memberOf($ministry, $user->person, [$assigner->id]);
    $this->getJson("/api/v1/events/{$event->id}")->assertOk();

    $stranger = actingAsUser();
    memberOf($other, $stranger->person, [$other->roles()->where('name', 'Лидер')->sole()->id]);
    $this->getJson("/api/v1/events/{$event->id}")->assertForbidden();
});

it('shows an assigned-only ministry event to ministries.view_all', function () {
    $event = Event::factory()->ministry(ministryWithRoles())->visibility(EventVisibility::Assigned)->create();
    actingAsUserWith([Permission::MinistriesViewAll]);

    $this->getJson("/api/v1/events/{$event->id}")->assertOk();
});

it('keeps a cancelled event visible under the same rules', function () {
    actingAsUser();
    $event = Event::factory()->cancelled()->create();

    $this->getJson("/api/v1/events/{$event->id}")->assertOk()->assertJsonPath('data.status', 'cancelled');
});
```

`tests/Feature/Calendar/EventIndexTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventAssignment;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Settings\ChurchSettings;
use Carbon\CarbonImmutable;

it('lists visible events in the range sorted by start', function () {
    actingAsUser();
    $late = Event::factory()->between(CarbonImmutable::parse('2026-11-15 07:00'), CarbonImmutable::parse('2026-11-15 09:00'))->create();
    $early = Event::factory()->between(CarbonImmutable::parse('2026-11-08 07:00'), CarbonImmutable::parse('2026-11-08 09:00'))->create();
    Event::factory()->between(CarbonImmutable::parse('2026-12-25 07:00'), CarbonImmutable::parse('2026-12-25 09:00'))->create();

    $ids = collect($this->getJson('/api/v1/events?from=2026-11-01&to=2026-11-30')->assertOk()->json('data'))->pluck('id')->all();

    expect($ids)->toBe([$early->id, $late->id]);
});

it('interprets the range in church time', function () {
    app(ChurchSettings::class)->put(['church.timezone' => 'Asia/Vladivostok']); // UTC+10
    actingAsUser();
    $event = Event::factory()->between(CarbonImmutable::parse('2026-11-08 20:00'), CarbonImmutable::parse('2026-11-08 21:00'))->create(); // 9 ноября 06:00 во Владивостоке

    $this->getJson('/api/v1/events?from=2026-11-08&to=2026-11-08')->assertOk()->assertJsonCount(0, 'data');
    $this->getJson('/api/v1/events?from=2026-11-09&to=2026-11-09')->assertOk()->assertJsonPath('data.0.id', $event->id);
});

it('refuses a range over 93 days', function () {
    actingAsUser();

    $this->getJson('/api/v1/events?from=2026-01-01&to=2026-06-01')->assertStatus(422)->assertJsonValidationErrors('to');
});

it('defaults to four weeks from today', function () {
    actingAsUser();
    Event::factory()->create();
    Event::factory()->between(CarbonImmutable::now()->addDays(40), CarbonImmutable::now()->addDays(40)->addHour())->create();

    $this->getJson('/api/v1/events')->assertOk()->assertJsonCount(1, 'data');
});

it('hides events the viewer may not see', function () {
    $ministry = ministryWithRoles();
    actingAsUser();
    $range = [CarbonImmutable::parse('2026-11-08 07:00'), CarbonImmutable::parse('2026-11-08 09:00')];
    Event::factory()->ministry($ministry)->between(...$range)->create();
    $public = Event::factory()->between(...$range)->create();

    $ids = collect($this->getJson('/api/v1/events?from=2026-11-01&to=2026-11-30')->json('data'))->pluck('id');
    expect($ids)->toEqual([$public->id]);
});

it('scopes to a ministry', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::MinistriesViewAll]);
    $mine = Event::factory()->ministry($ministry)->create();
    Event::factory()->create();

    $ids = collect($this->getJson("/api/v1/events?scope=ministry:{$ministry->id}")->json('data'))->pluck('id');
    expect($ids)->toEqual([$mine->id]);
});

it('scopes to my assignments', function () {
    $user = actingAsUser();
    $assigned = Event::factory()->create();
    EventAssignment::factory()->for(EventSlot::factory()->for($assigned)->create())->for($user->person)->create();
    Event::factory()->create();

    $ids = collect($this->getJson('/api/v1/events?scope=mine')->json('data'))->pluck('id');
    expect($ids)->toEqual([$assigned->id]);
});

it('includes cancelled events with their status', function () {
    actingAsUser();
    Event::factory()->cancelled()->create();

    $this->getJson('/api/v1/events')->assertOk()->assertJsonPath('data.0.status', 'cancelled');
});

it('paginates with a cap of 200', function () {
    actingAsUser();
    Event::factory()->count(3)->create();

    $this->getJson('/api/v1/events?per_page=2')->assertOk()->assertJsonCount(2, 'data')->assertJsonPath('meta.total', 3);
    $this->getJson('/api/v1/events?per_page=500')->assertStatus(422);
});
```

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Feature/Calendar/EventVisibilityTest.php tests/Feature/Calendar/EventIndexTest.php`
Ожидается: FAIL.

- [ ] **Шаг 3: `canView`**

```php
public function canView(User $user, Event $event): bool
{
    if ($event->visibility === EventVisibility::Church) {
        return true;
    }

    if ($this->canManage($user, $event)) {
        return true;
    }

    if ($event->owner_type === EventOwnerType::Ministry
        && $this->permissions->can($user, Permission::MinistriesViewAll)) {
        return true;
    }

    if ($event->visibility === EventVisibility::Ministry) {
        return $this->permissions->isMember($user, (string) $event->ministry_id);
    }

    // visibility = assigned
    if (in_array($user->person_id, $event->assignedPersonIds(), true)) {
        return true;
    }

    foreach ($event->slots()->whereNotNull('role_id')->with('role')->get() as $slot) {
        if ($this->permissions->canInMinistry($user, Permission::SlotsAssign, (string) $slot->role->ministry_id)) {
            return true;
        }
    }

    return false;
}
```

- [ ] **Шаг 4: Список**

`EventIndexQuery::for($viewer, $from, $to, $scope)`: границы — `$from->startOfDay()` и `$to->endOfDay()` в поясе церкви, переведённые в UTC; условие `starts_at < $toUtc AND ends_at > $fromUtc`; `whereNull('archived_at')`. Видимость в SQL одним `where`:

- `visibility = 'church'`;
- или `visibility = 'ministry'` и `ministry_id` в `memberMinistryIds` (все служения при `ministries.view_all` или администраторе);
- или `visibility = 'assigned'` и (`id` в назначениях человека, или `owner_type = 'ministry'` при `view_all`, или есть слот с ролью из служений, где у смотрящего `slots.assign`, или событие управляемо: `owner_type = 'church'` при `calendar.church.manage`, `ministry_id` в служениях с `events.manage`).

Наборы идентификаторов служений берутся из `PermissionResolver::for($viewer)->ministries` (ключи — служения участия, значения — права). `scope=mine` — `whereHas('slots.assignments', person_id)`, `scope=ministry:{id}` — `where('ministry_id')`. Валидация запроса: `from`, `to` — `date_format:Y-m-d`, `to` не раньше `from` и не позже `from + 93 дня`; `per_page` — `integer|max:200`.

- [ ] **Шаг 5: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Feature/Calendar tests/Feature/Access/PermissionCoverageTest.php`
Ожидается: PASS.

- [ ] **Шаг 6: Коммит**

```bash
composer openapi && git add . && git commit -m "feat(calendar): event visibility rules and range listing"
```

**Критерии готовности:**
- Все правила видимости раздела 6.4 закрыты тестами, включая «носитель `slots.assign` видит событие, где нужны его роли, и не видит чужое».
- Диапазон трактуется по календарю церкви — тест с Владивостоком ловит смещение суток.
- Один запрос отдаёт и карточки, и статус отмены; ограничение 93 дня не даёт вытащить весь календарь.
- `EventIndexQuery` — общая точка для списка, главной и iCal.

---
### Задача 4: Слоты события

**Файлы:**
- Создать: `app/Modules/Calendar/Actions/UpdateSlot.php`, `RemoveSlot.php`; `Policies/EventSlotPolicy.php`; `Http/Controllers/SlotController.php`, `Http/Requests/SlotRequest.php`
- Изменить: `Actions/AddSlot.php` (проверка отменённого события, эндпоинт), `routes.php`
- Тест: `tests/Feature/Calendar/SlotTest.php`

**Интерфейсы:**
- Отдаёт наружу: `POST /events/{id}/slots` (`label?`, `role_id?`, `required_count`), `PATCH /slots/{id}` (те же поля), `DELETE /slots/{id}` — все под `EventAccess::canManage` события.
- Отдаёт наружу: `AddSlot::handle(Event $event, array $slot): EventSlot`, `UpdateSlot::handle(EventSlot $slot, array $attributes): EventSlot`, `RemoveSlot::handle(EventSlot $slot): void` — последний снимает назначения и публикует `AssignmentRemoved` (класс события создаёт задача 5; в этой задаче объявляется минимально с сигнатурой `AssignmentRemoved(string $eventId, string $slotId, string $personId, ?string $userId, ?string $actorUserId)`).
- Коды ошибок: `event.cancelled`, `slot.label_required`, `slot.role_not_ministry`, `slot.role_archived_ministry`.

- [ ] **Шаг 1: Написать падающие тесты**

```php
<?php

declare(strict_types=1);

use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Calendar\Events\AssignmentRemoved;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventAssignment;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Directory\Models\Person;
use Illuminate\Support\Facades\Event as EventBus;

it('denies adding a slot to a viewer', function () {
    actingAsUser();
    $event = Event::factory()->create();

    $this->postJson("/api/v1/events/{$event->id}/slots", ['label' => 'Помощник', 'required_count' => 1])->assertForbidden();
});

it('adds a slot to a church event with calendar.church.manage', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $event = Event::factory()->create();

    $this->postJson("/api/v1/events/{$event->id}/slots", ['label' => 'Помощник', 'required_count' => 2])
        ->assertCreated()->assertJsonPath('data.label', 'Помощник')->assertJsonPath('data.filled_count', 0);
});

it('lets a ministry leader manage slots of their ministry event only', function () {
    $ministry = ministryWithRoles();
    $other = ministryWithRoles('Молодёжное');
    $user = actingAsUser();
    memberOf($ministry, $user->person, [$ministry->roles()->where('name', 'Лидер')->sole()->id]);
    $mine = Event::factory()->ministry($ministry)->create();
    $foreign = Event::factory()->ministry($other)->create();

    $this->postJson("/api/v1/events/{$mine->id}/slots", ['label' => 'Звук', 'required_count' => 1])->assertCreated();
    $this->postJson("/api/v1/events/{$foreign->id}/slots", ['label' => 'Звук', 'required_count' => 1])->assertForbidden();
});

it('lets a slot require a role from any ministry regardless of the owner', function () {
    $ministry = ministryWithRoles();
    $other = ministryWithRoles('Молодёжное');
    $user = actingAsUser();
    memberOf($ministry, $user->person, [$ministry->roles()->where('name', 'Лидер')->sole()->id]);
    $event = Event::factory()->ministry($ministry)->create();

    $this->postJson("/api/v1/events/{$event->id}/slots", ['role_id' => $other->default_role_id, 'required_count' => 1])
        ->assertCreated()->assertJsonPath('data.role.ministry_id', $other->id);
});

it('refuses a role of an archived ministry', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::CalendarChurchManage, Permission::MinistriesCreate]);
    $this->postJson("/api/v1/ministries/{$ministry->id}/archive")->assertOk();
    $event = Event::factory()->create();

    $this->postJson("/api/v1/events/{$event->id}/slots", ['role_id' => $ministry->default_role_id, 'required_count' => 1])
        ->assertStatus(422)->assertJsonPath('code', 'slot.role_archived_ministry');
});

it('updates the label and the capacity', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $slot = EventSlot::factory()->create();

    $this->patchJson("/api/v1/slots/{$slot->id}", ['label' => 'Старший помощник', 'required_count' => 3])
        ->assertOk()->assertJsonPath('data.required_count', 3);
});

it('refuses slot changes on a cancelled event', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $event = Event::factory()->cancelled()->create();
    $slot = EventSlot::factory()->for($event)->create();

    $this->postJson("/api/v1/events/{$event->id}/slots", ['label' => 'Х', 'required_count' => 1])
        ->assertStatus(422)->assertJsonPath('code', 'event.cancelled');
    $this->deleteJson("/api/v1/slots/{$slot->id}")->assertStatus(422)->assertJsonPath('code', 'event.cancelled');
});

it('removes a slot together with its assignments and announces each removal', function () {
    EventBus::fake([AssignmentRemoved::class]);
    actingAsUserWith([Permission::CalendarChurchManage]);
    $slot = EventSlot::factory()->create(['required_count' => 2]);
    EventAssignment::factory()->for($slot)->for(Person::factory()->create())->create();
    EventAssignment::factory()->for($slot)->for(Person::factory()->create())->create();

    $this->deleteJson("/api/v1/slots/{$slot->id}")->assertNoContent();

    expect(EventSlot::query()->find($slot->id))->toBeNull()
        ->and(EventAssignment::query()->count())->toBe(0);
    EventBus::assertDispatchedTimes(AssignmentRemoved::class, 2);
});

it('caps the capacity at fifty', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $event = Event::factory()->create();

    $this->postJson("/api/v1/events/{$event->id}/slots", ['label' => 'Все', 'required_count' => 51])
        ->assertStatus(422)->assertJsonValidationErrors('required_count');
});
```

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Feature/Calendar/SlotTest.php`
Ожидается: FAIL.

- [ ] **Шаг 3: Реализовать**

```php
final class AddSlot
{
    /** @param array{label?: ?string, role_id?: ?string, required_count: int, sort_order?: int} $slot */
    public function handle(Event $event, array $slot): EventSlot
    {
        if ($event->isCancelled()) {
            throw DomainRuleException::because('event.cancelled', 'Событие отменено, слоты изменить нельзя.');
        }

        $role = isset($slot['role_id']) ? Role::query()->with('ministry')->findOrFail($slot['role_id']) : null;

        if ($role !== null && $role->scope !== RoleScope::Ministry) {
            throw DomainRuleException::because('slot.role_not_ministry', 'В слоте может требоваться только роль служения.');
        }

        if ($role !== null && $role->ministry->archived_at !== null) {
            throw DomainRuleException::because('slot.role_archived_ministry', 'Служение этой роли архивировано.');
        }

        $label = trim((string) ($slot['label'] ?? '')) !== '' ? trim($slot['label']) : $role?->name;

        if ($label === null) {
            throw DomainRuleException::because('slot.label_required', 'Свободному слоту нужна подпись.');
        }

        return $event->slots()->create([
            'label' => $label,
            'resource_type' => ResourceType::Person,
            'role_id' => $role?->id,
            'required_count' => $slot['required_count'],
            'sort_order' => $slot['sort_order'] ?? ($event->slots()->max('sort_order') ?? -1) + 1,
        ]);
    }
}
```

`RemoveSlot` в транзакции удаляет назначения и слот, после коммита публикует `AssignmentRemoved` на каждое снятое назначение (`userId` — аккаунт человека, если есть). `EventSlotPolicy::manage(User, EventSlot)` → `EventAccess::canManage($user, $slot->event)`. `SlotRequest`: `label` — `nullable|string|max:100`, `role_id` — `nullable|ulid|exists:roles,id`, `required_count` — `required|integer|min:1|max:50`.

- [ ] **Шаг 4: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Feature/Calendar`
Ожидается: PASS.

- [ ] **Шаг 5: Коммит**

```bash
composer openapi && git add . && git commit -m "feat(calendar): slot management with role and label rules"
```

**Критерии готовности:**
- Слоты правит только управляющий событием; лидер — только в событиях своего служения.
- Слот может требовать роль любого служения независимо от владельца события (CONTEXT.md, «Владелец события»).
- Удаление слота не оставляет висячих назначений и извещает о каждом снятии (решение 9).
- Отменённое событие заморожено для слотов (решение 11).

---

### Задача 5: Кандидаты и назначения с предупреждениями

**Файлы:**
- Создать: `app/Modules/Calendar/TimeConflictFinder.php`; `Actions/AssignPerson.php`, `RemoveAssignment.php`; `Events/AssignmentCreated.php`, `AssignmentRemoved.php` (окончательно); `Http/Controllers/AssignmentController.php`, `CandidateController.php`; `Http/Requests/AssignRequest.php`; `Http/Resources/CandidateResource.php`
- Изменить: `EventAccess` (`canFillSlot`), `EventSlotResource` (`can_fill`), `routes.php`
- Тест: `tests/Feature/Calendar/AssignmentTest.php`, `tests/Feature/Calendar/CandidateTest.php`, `tests/Unit/Calendar/TimeConflictFinderTest.php`

**Интерфейсы:**
- Отдаёт наружу: `POST /slots/{id}/assignments` с `{ person_id }` → `201 { data: EventAssignmentResource, warnings: list<{code, message, event_ids?}> }`; `DELETE /assignments/{id}` → `204`; `GET /slots/{id}/candidates?search` → `{ data: list<{person: {id, full_name, photo_thumb_url}, has_role: bool, conflicts: list<{event_id, title, starts_at, ends_at}>}> }`.
- Отдаёт наружу: `EventAccess::canFillSlot(User $user, EventSlot $slot): bool` — управляющий событием любой слот; `slots.assign` в служении роли слота; свободный слот только управляющий.
- Отдаёт наружу: `AssignPerson::handle(User $actor, EventSlot $slot, Person $person): array{assignment: EventAssignment, warnings: list<array{code: string, message: string, event_ids?: list<string>}>}`, `RemoveAssignment::handle(EventAssignment $assignment): void`.
- Отдаёт наружу: `TimeConflictFinder::conflictsFor(string $personId, CarbonImmutable $from, CarbonImmutable $to, ?string $exceptEventId = null): Collection<int, Event>`.
- Отдаёт наружу: `AssignmentCreated(string $eventId, string $slotId, string $personId, ?string $userId, ?string $actorUserId)`, `AssignmentRemoved(...)` с той же сигнатурой. `userId` — аккаунт назначенного (если есть), `actorUserId` — аккаунт, совершивший действие (`null` для консоли и слушателей). Их слушают Notifications (задача 12) и Chat (фаза 4).
- Коды ошибок: `assignment.duplicate`, `assignment.person_archived`, `event.cancelled`. Коды предупреждений: `role_mismatch`, `time_conflict`, `over_capacity`.

- [ ] **Шаг 1: Написать падающие тесты**

`tests/Unit/Calendar/TimeConflictFinderTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventAssignment;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Calendar\TimeConflictFinder;
use App\Modules\Directory\Models\Person;
use Carbon\CarbonImmutable;

function assignedEvent(Person $person, string $start, string $end, array $over = []): Event
{
    $event = Event::factory()->between(CarbonImmutable::parse($start), CarbonImmutable::parse($end))->create($over);
    EventAssignment::factory()->for(EventSlot::factory()->for($event)->create())->for($person)->create();

    return $event;
}

it('finds an overlapping scheduled event', function () {
    $person = Person::factory()->create();
    $busy = assignedEvent($person, '2026-11-08 10:00', '2026-11-08 12:00');

    $found = app(TimeConflictFinder::class)->conflictsFor($person->id, CarbonImmutable::parse('2026-11-08 11:00'), CarbonImmutable::parse('2026-11-08 13:00'));

    expect($found->pluck('id')->all())->toBe([$busy->id]);
});

it('treats touching intervals as free', function () {
    $person = Person::factory()->create();
    assignedEvent($person, '2026-11-08 10:00', '2026-11-08 12:00');

    expect(app(TimeConflictFinder::class)->conflictsFor($person->id, CarbonImmutable::parse('2026-11-08 12:00'), CarbonImmutable::parse('2026-11-08 14:00')))
        ->toBeEmpty();
});

it('ignores cancelled events and other people', function () {
    $person = Person::factory()->create();
    assignedEvent($person, '2026-11-08 10:00', '2026-11-08 12:00', ['status' => 'cancelled', 'cancelled_at' => now()]);
    assignedEvent(Person::factory()->create(), '2026-11-08 10:00', '2026-11-08 12:00');

    expect(app(TimeConflictFinder::class)->conflictsFor($person->id, CarbonImmutable::parse('2026-11-08 10:30'), CarbonImmutable::parse('2026-11-08 11:00')))
        ->toBeEmpty();
});

it('excludes the event being filled', function () {
    $person = Person::factory()->create();
    $same = assignedEvent($person, '2026-11-08 10:00', '2026-11-08 12:00');

    expect(app(TimeConflictFinder::class)->conflictsFor($person->id, $same->starts_at, $same->ends_at, $same->id))->toBeEmpty();
});
```

`tests/Feature/Calendar/AssignmentTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Calendar\Events\AssignmentCreated;
use App\Modules\Calendar\Events\AssignmentRemoved;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventAssignment;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Directory\Models\Person;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Event as EventBus;

function assignerIn(\App\Modules\Ministries\Models\Ministry $ministry): \App\Modules\Directory\Models\User
{
    $role = Role::query()->create(['scope' => 'ministry', 'ministry_id' => $ministry->id, 'name' => 'Координатор']);
    $role->permissions()->create(['permission' => Permission::SlotsAssign->value]);
    $user = actingAsUser();
    memberOf($ministry, $user->person, [$role->id]);

    return $user;
}

it('denies filling a slot without any right', function () {
    actingAsUser();
    $slot = EventSlot::factory()->create();

    $this->postJson("/api/v1/slots/{$slot->id}/assignments", ['person_id' => Person::factory()->create()->id])->assertForbidden();
});

it('lets the event manager fill any slot', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $slot = EventSlot::factory()->create();
    $person = Person::factory()->create();

    $this->postJson("/api/v1/slots/{$slot->id}/assignments", ['person_id' => $person->id])
        ->assertCreated()
        ->assertJsonPath('data.person.id', $person->id)
        ->assertJsonPath('warnings', []);
});

it('lets slots.assign fill a slot with their ministry role in a church event', function () {
    $ministry = ministryWithRoles();
    $vocalist = Role::query()->create(['scope' => 'ministry', 'ministry_id' => $ministry->id, 'name' => 'Вокалист']);
    $slot = EventSlot::factory()->withRole($vocalist)->create();
    assignerIn($ministry);
    $singer = Person::factory()->create();
    memberOf($ministry, $singer, [$vocalist->id]);

    $this->postJson("/api/v1/slots/{$slot->id}/assignments", ['person_id' => $singer->id])->assertCreated();
});

it('does not let slots.assign fill a free slot or a slot of another ministry', function () {
    $ministry = ministryWithRoles();
    $other = ministryWithRoles('Молодёжное');
    $event = Event::factory()->create();
    $free = EventSlot::factory()->for($event)->create();
    $foreign = EventSlot::factory()->for($event)->withRole(Role::query()->find($other->default_role_id))->create();
    assignerIn($ministry);
    $person = Person::factory()->create();

    $this->postJson("/api/v1/slots/{$free->id}/assignments", ['person_id' => $person->id])->assertForbidden();
    $this->postJson("/api/v1/slots/{$foreign->id}/assignments", ['person_id' => $person->id])->assertForbidden();
});

it('warns about a role mismatch without blocking', function () {
    $ministry = ministryWithRoles();
    $vocalist = Role::query()->create(['scope' => 'ministry', 'ministry_id' => $ministry->id, 'name' => 'Вокалист']);
    actingAsUserWith([Permission::CalendarChurchManage]);
    $slot = EventSlot::factory()->withRole($vocalist)->create();

    $this->postJson("/api/v1/slots/{$slot->id}/assignments", ['person_id' => Person::factory()->create()->id])
        ->assertCreated()
        ->assertJsonPath('warnings.0.code', 'role_mismatch');
});

it('warns about a time conflict with the overlapping event ids', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $person = Person::factory()->create();
    $busy = Event::factory()->between(CarbonImmutable::parse('2026-11-08 10:00'), CarbonImmutable::parse('2026-11-08 12:00'))->create();
    EventAssignment::factory()->for(EventSlot::factory()->for($busy)->create())->for($person)->create();
    $target = Event::factory()->between(CarbonImmutable::parse('2026-11-08 11:00'), CarbonImmutable::parse('2026-11-08 13:00'))->create();
    $slot = EventSlot::factory()->for($target)->create();

    $this->postJson("/api/v1/slots/{$slot->id}/assignments", ['person_id' => $person->id])
        ->assertCreated()
        ->assertJsonPath('warnings.0.code', 'time_conflict')
        ->assertJsonPath('warnings.0.event_ids', [$busy->id]);
});

it('warns about over capacity and still assigns', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $slot = EventSlot::factory()->create(['required_count' => 1]);
    EventAssignment::factory()->for($slot)->for(Person::factory()->create())->create();

    $this->postJson("/api/v1/slots/{$slot->id}/assignments", ['person_id' => Person::factory()->create()->id])
        ->assertCreated()
        ->assertJsonPath('warnings.0.code', 'over_capacity');

    expect($slot->assignments()->count())->toBe(2);
});

it('refuses the same person twice in one slot', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $slot = EventSlot::factory()->create();
    $person = Person::factory()->create();
    $this->postJson("/api/v1/slots/{$slot->id}/assignments", ['person_id' => $person->id]);

    $this->postJson("/api/v1/slots/{$slot->id}/assignments", ['person_id' => $person->id])
        ->assertStatus(422)->assertJsonPath('code', 'assignment.duplicate');
});

it('refuses an archived person and a cancelled event', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $slot = EventSlot::factory()->create();
    $this->postJson("/api/v1/slots/{$slot->id}/assignments", ['person_id' => Person::factory()->archived()->create()->id])
        ->assertStatus(422)->assertJsonPath('code', 'assignment.person_archived');

    $cancelledSlot = EventSlot::factory()->for(Event::factory()->cancelled()->create())->create();
    $this->postJson("/api/v1/slots/{$cancelledSlot->id}/assignments", ['person_id' => Person::factory()->create()->id])
        ->assertStatus(422)->assertJsonPath('code', 'event.cancelled');
});

it('publishes AssignmentCreated with the account id when the person has one', function () {
    EventBus::fake([AssignmentCreated::class]);
    actingAsUserWith([Permission::CalendarChurchManage]);
    $slot = EventSlot::factory()->create();
    $person = Person::factory()->has(\App\Modules\Directory\Models\User::factory())->create();

    $this->postJson("/api/v1/slots/{$slot->id}/assignments", ['person_id' => $person->id]);

    EventBus::assertDispatched(AssignmentCreated::class, fn (AssignmentCreated $e) => $e->personId === $person->id && $e->userId === $person->user->id);
});

it('removes an assignment and publishes AssignmentRemoved', function () {
    EventBus::fake([AssignmentRemoved::class]);
    actingAsUserWith([Permission::CalendarChurchManage]);
    $assignment = EventAssignment::factory()->for(EventSlot::factory()->create())->for(Person::factory()->create())->create();

    $this->deleteJson("/api/v1/assignments/{$assignment->id}")->assertNoContent();

    expect(EventAssignment::query()->find($assignment->id))->toBeNull();
    EventBus::assertDispatched(AssignmentRemoved::class);
});

it('reports can_fill per slot in the event card', function () {
    $ministry = ministryWithRoles();
    $vocalist = Role::query()->create(['scope' => 'ministry', 'ministry_id' => $ministry->id, 'name' => 'Вокалист']);
    $event = Event::factory()->create();
    EventSlot::factory()->for($event)->withRole($vocalist)->create(['sort_order' => 0]);
    EventSlot::factory()->for($event)->create(['sort_order' => 1]);
    assignerIn($ministry);

    $this->getJson("/api/v1/events/{$event->id}")
        ->assertJsonPath('data.slots.0.can_fill', true)
        ->assertJsonPath('data.slots.1.can_fill', false);
});
```

`tests/Feature/Calendar/CandidateTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventAssignment;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Directory\Models\Person;
use Carbon\CarbonImmutable;

it('lists members holding the required role with their conflicts', function () {
    $ministry = ministryWithRoles();
    $vocalist = Role::query()->create(['scope' => 'ministry', 'ministry_id' => $ministry->id, 'name' => 'Вокалист']);
    $free = Person::factory()->create(['last_name' => 'Свободная']);
    $busy = Person::factory()->create(['last_name' => 'Занятая']);
    $notSinger = Person::factory()->create();
    memberOf($ministry, $free, [$vocalist->id]);
    memberOf($ministry, $busy, [$vocalist->id]);
    memberOf($ministry, $notSinger);

    $target = Event::factory()->between(CarbonImmutable::parse('2026-11-08 10:00'), CarbonImmutable::parse('2026-11-08 12:00'))->create();
    $slot = EventSlot::factory()->for($target)->withRole($vocalist)->create();
    $other = Event::factory()->between(CarbonImmutable::parse('2026-11-08 11:00'), CarbonImmutable::parse('2026-11-08 13:00'))->create(['title' => 'Репетиция']);
    EventAssignment::factory()->for(EventSlot::factory()->for($other)->create())->for($busy)->create();

    actingAsUserWith([Permission::CalendarChurchManage]);
    $data = collect($this->getJson("/api/v1/slots/{$slot->id}/candidates")->assertOk()->json('data'));

    expect($data->pluck('person.id')->all())->toEqualCanonicalizing([$free->id, $busy->id])
        ->and($data->firstWhere('person.id', $busy->id)['conflicts'][0]['title'])->toBe('Репетиция')
        ->and($data->firstWhere('person.id', $free->id)['conflicts'])->toBe([]);
});

it('searches active people for a free slot', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    Person::factory()->create(['last_name' => 'Прокопенко', 'first_name' => 'Мария']);
    Person::factory()->archived()->create(['last_name' => 'Прокопенко', 'first_name' => 'Анна']);
    $slot = EventSlot::factory()->create();

    $data = $this->getJson("/api/v1/slots/{$slot->id}/candidates?search=прокоп")->assertOk()->json('data');

    expect($data)->toHaveCount(1)->and($data[0]['person']['full_name'])->toContain('Мария');
});

it('requires two characters to search a free slot', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $slot = EventSlot::factory()->create();

    $this->getJson("/api/v1/slots/{$slot->id}/candidates?search=п")->assertOk()->assertJsonCount(0, 'data');
});

it('denies candidates to someone who cannot fill the slot', function () {
    actingAsUser();
    $slot = EventSlot::factory()->create();

    $this->getJson("/api/v1/slots/{$slot->id}/candidates")->assertForbidden();
});
```

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Unit/Calendar tests/Feature/Calendar/AssignmentTest.php tests/Feature/Calendar/CandidateTest.php`
Ожидается: FAIL.

- [ ] **Шаг 3: Реализовать**

```php
final class TimeConflictFinder
{
    /** @return Collection<int, Event> */
    public function conflictsFor(string $personId, CarbonImmutable $from, CarbonImmutable $to, ?string $exceptEventId = null): Collection
    {
        return Event::query()
            ->where('status', EventStatus::Scheduled)
            ->whereNull('archived_at')
            ->where('starts_at', '<', $to)
            ->where('ends_at', '>', $from)
            ->when($exceptEventId !== null, fn ($q) => $q->where('id', '!=', $exceptEventId))
            ->whereHas('slots.assignments', fn ($q) => $q->where('person_id', $personId))
            ->orderBy('starts_at')
            ->get();
    }
}
```

`EventAccess::canFillSlot`:

```php
public function canFillSlot(User $user, EventSlot $slot): bool
{
    if ($this->canManage($user, $slot->event)) {
        return true;
    }

    if ($slot->role_id === null) {
        return false;
    }

    return $this->permissions->canInMinistry($user, Permission::SlotsAssign, (string) $slot->role->ministry_id);
}
```

`AssignPerson`: проверки `event.cancelled`, `assignment.person_archived`, `assignment.duplicate`; создаёт запись; предупреждения: `role_mismatch` — у слота есть роль и у человека нет `ministry_member_roles` с ней; `time_conflict` — `TimeConflictFinder` с `exceptEventId = slot.event_id`, в предупреждение кладутся `event_ids`; `over_capacity` — число назначений после вставки больше `required_count`. После коммита — `AssignmentCreated($event->id, $slot->id, $person->id, $person->user?->id, $actor->id)`. Контроллер кладёт `warnings` в корень ответа через `additional`.

Кандидаты: слот с ролью — `Person` через `ministry_members` → `ministry_member_roles` с `role_id`, неархивные; свободный слот — `search` от двух символов по триграммному индексу фазы 1, до 20 человек; для каждого `conflicts` через `TimeConflictFinder`, `has_role` для слота с ролью всегда `true`, для свободного — `false`.

- [ ] **Шаг 4: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Unit/Calendar tests/Feature/Calendar tests/Feature/Access/PermissionCoverageTest.php`
Ожидается: PASS.

- [ ] **Шаг 5: Коммит**

```bash
composer openapi && git add . && git commit -m "feat(calendar): assignments with warnings, candidates with conflicts, slots.assign"
```

**Критерии готовности:**
- Три предупреждения раздела 7.4 возвращаются и не блокируют; слот заполняется сверх ёмкости («3 из 2»).
- Пересечение считается по полуоткрытому интервалу среди `scheduled`, соприкасающиеся события не конфликтуют.
- `slots.assign` ограничен ролями своего служения и не касается свободных слотов (раздел 6.4).
- Кандидаты приходят с уже вычисленными пересечениями — лидер видит их до выбора.
- `AssignmentCreated` и `AssignmentRemoved` несут `userId`, чтобы Notifications и Chat не искали аккаунт сами.

---
### Задача 6: Отмена события и вложения

**Файлы:**
- Создать: `app/Modules/Calendar/Actions/CancelEvent.php`; `Events/EventCancelled.php`; `EventMediaOwnerResolver.php`; `Http/Requests/CancelEventRequest.php`
- Изменить: `EventController` (`cancel`), `UpdateEvent` (`media_ids` через `SyncAttachments`), `EventResource` (`attachments`), `EventPolicy` (`cancel`), `AppServiceProvider` (тег `media.owner_resolvers`), `routes.php`
- Тест: `tests/Feature/Calendar/EventCancelTest.php`, `tests/Feature/Calendar/EventAttachmentTest.php`

**Интерфейсы:**
- Отдаёт наружу: `POST /events/{id}/cancel` с `{ reason?: string }` → `200 EventResource` со `status = cancelled`.
- Отдаёт наружу: `CancelEvent::handle(Event $event, ?string $reason, ?User $actor): Event` — ставит статус, `cancelled_at`, `cancel_reason`, пишет журнал `event.cancelled`, публикует `EventCancelled(string $eventId, ?string $reason)`. `actor = null` для консольных и слушательских вызовов (задача 11).
- Отдаёт наружу: вложения события через `media_ids` при создании и правке; видимость вложения повторяет `EventAccess::canView`.
- Коды ошибок: `event.already_cancelled`.

- [ ] **Шаг 1: Написать падающие тесты**

`tests/Feature/Calendar/EventCancelTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Access\Models\AuditEntry;
use App\Modules\Access\Permission;
use App\Modules\Calendar\Events\EventCancelled;
use App\Modules\Calendar\Models\Event;
use Illuminate\Support\Facades\Event as EventBus;

it('denies cancelling to a viewer', function () {
    actingAsUser();
    $event = Event::factory()->create();

    $this->postJson("/api/v1/events/{$event->id}/cancel", ['reason' => 'Погода'])->assertForbidden();
});

it('cancels with a reason, keeps the event and writes to the journal', function () {
    EventBus::fake([EventCancelled::class]);
    actingAsUserWith([Permission::CalendarChurchManage]);
    $event = Event::factory()->create();

    $this->postJson("/api/v1/events/{$event->id}/cancel", ['reason' => 'Погода'])
        ->assertOk()
        ->assertJsonPath('data.status', 'cancelled')
        ->assertJsonPath('data.cancel_reason', 'Погода');

    expect(Event::query()->find($event->id))->not->toBeNull()
        ->and($event->fresh()->cancelled_at)->not->toBeNull()
        ->and(AuditEntry::query()->where('action', 'event.cancelled')->where('subject_id', $event->id)->exists())->toBeTrue();
    EventBus::assertDispatched(EventCancelled::class, fn (EventCancelled $e) => $e->reason === 'Погода');
});

it('refuses to cancel twice', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $event = Event::factory()->cancelled()->create();

    $this->postJson("/api/v1/events/{$event->id}/cancel")->assertStatus(422)->assertJsonPath('code', 'event.already_cancelled');
});

it('lets a ministry leader cancel only their ministry events', function () {
    $ministry = ministryWithRoles();
    $other = ministryWithRoles('Молодёжное');
    $user = actingAsUser();
    memberOf($ministry, $user->person, [$ministry->roles()->where('name', 'Лидер')->sole()->id]);

    $this->postJson('/api/v1/events/'.Event::factory()->ministry($ministry)->create()->id.'/cancel')->assertOk();
    $this->postJson('/api/v1/events/'.Event::factory()->ministry($other)->create()->id.'/cancel')->assertForbidden();
});
```

`tests/Feature/Calendar/EventAttachmentTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use App\Modules\Calendar\EventVisibility;
use App\Modules\Calendar\Models\Event;
use App\Modules\Media\Models\Media;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;

beforeEach(fn () => Storage::fake('media'));

it('attaches media on create and lists them on the card', function () {
    $user = actingAsUserWith([Permission::CalendarChurchManage]);
    $media = Media::factory()->create(['uploader_user_id' => $user->id]);

    $this->postJson('/api/v1/events', [
        'owner_type' => 'church', 'title' => 'Т', 'starts_at' => '2026-11-08T07:00:00Z', 'ends_at' => '2026-11-08T09:00:00Z',
        'visibility' => 'church', 'media_ids' => [$media->id],
    ])->assertCreated()->assertJsonPath('data.attachments.0.id', $media->id);
});

it('replaces attachments on edit', function () {
    $user = actingAsUserWith([Permission::CalendarChurchManage]);
    $a = Media::factory()->create(['uploader_user_id' => $user->id]);
    $b = Media::factory()->create(['uploader_user_id' => $user->id]);
    $event = Event::factory()->create();
    $this->patchJson("/api/v1/events/{$event->id}", ['media_ids' => [$a->id]])->assertOk();

    $this->patchJson("/api/v1/events/{$event->id}", ['media_ids' => [$b->id]])
        ->assertOk()->assertJsonPath('data.attachments.0.id', $b->id)->assertJsonCount(1, 'data.attachments');

    expect(Media::query()->find($a->id))->toBeNull();
});

it('serves an event attachment by event visibility', function () {
    $ministry = ministryWithRoles();
    $manager = actingAsUserWith([Permission::MinistriesManageAll]);
    $media = Media::factory()->create(['uploader_user_id' => $manager->id]);
    $event = Event::factory()->ministry($ministry)->visibility(EventVisibility::Ministry)->create();
    $this->patchJson("/api/v1/events/{$event->id}", ['media_ids' => [$media->id]])->assertOk();
    $url = URL::temporarySignedRoute('media.show', now()->addHour(), ['media' => $media->id]);

    actingAsUser();
    $this->get($url)->assertForbidden();

    $member = actingAsUser();
    memberOf($ministry, $member->person);
    $this->get($url)->assertOk();
});
```

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Feature/Calendar/EventCancelTest.php tests/Feature/Calendar/EventAttachmentTest.php`
Ожидается: FAIL.

- [ ] **Шаг 3: Реализовать**

```php
final class CancelEvent
{
    public function handle(Event $event, ?string $reason, ?User $actor): Event
    {
        if ($event->isCancelled()) {
            throw DomainRuleException::because('event.already_cancelled', 'Событие уже отменено.');
        }

        $event->forceFill([
            'status' => EventStatus::Cancelled,
            'cancelled_at' => now(),
            'cancel_reason' => $reason !== null && trim($reason) !== '' ? trim($reason) : null,
        ])->save();

        app(AuditLogger::class)->record('event.cancelled', $event, ['reason' => $event->cancel_reason]);
        EventCancelled::dispatch($event->id, $event->cancel_reason);

        return $event;
    }
}
```

`CancelEventRequest`: `reason` — `nullable|string|max:500`. `EventMediaOwnerResolver::canView` — по `media_attachments` с `attachable_type = 'event'` → `EventAccess::canView($viewer, $event)`; нет вложения → `null`. `UpdateEvent` вызывает `SyncAttachments`, если в `attributes` есть `media_ids`.

- [ ] **Шаг 4: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Feature/Calendar tests/Feature/Media`
Ожидается: PASS.

- [ ] **Шаг 5: Коммит**

```bash
composer openapi && git add . && git commit -m "feat(calendar): event cancellation with journal and event attachments"
```

**Критерии готовности:**
- Отмена не удаляет событие: оно остаётся в календаре с пометкой и причиной (CONTEXT.md, «Отмена события»); повторная отмена отвергается.
- Отмена — единственная операция календаря в журнале (раздел 6.5).
- Вложения события подчиняются видимости события через тот же контракт владельца, что и объявления.

---

### Задача 7: Блокировка удаления роли слотами

**Файлы:**
- Создать: `app/Modules/Access/Contracts/RoleUsageSource.php`; `app/Modules/Calendar/Access/CalendarRoleUsageSource.php`
- Изменить: `app/Modules/Access/RoleUsageCollector.php` (опрос тегированных источников), `AppServiceProvider` (тег `access.role_usage_sources`)
- Тест: `tests/Feature/Calendar/RoleUsageTest.php`

**Интерфейсы:**
- Отдаёт наружу: `interface RoleUsageSource { /** @return list<array{type: string, id: string, title: string}> */ public function blockersFor(Role $role): array; }`.
- Отдаёт наружу: типы блокировок `event_slot` (`id` — событие, `title` — «{название}, {дата по церкви}») и `template_slot` (`id` — шаблон, `title` — название шаблона).
- Потребляет: `RoleUsageCollector::for(Role): array{carriers, blockers}` и `DeleteRole` фазы 1 (неизвестный тип блокировки → `role.in_use`).

- [ ] **Шаг 1: Написать падающие тесты**

```php
<?php

declare(strict_types=1);

use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Calendar\Models\EventTemplate;
use App\Modules\Calendar\Models\EventTemplateSlot;
use Carbon\CarbonImmutable;

function ministryRole(): Role
{
    $ministry = ministryWithRoles();

    return Role::query()->create(['scope' => 'ministry', 'ministry_id' => $ministry->id, 'name' => 'Вокалист']);
}

it('blocks deleting a role required by a slot of a future scheduled event', function () {
    actingAsUserWith([Permission::MinistriesManageAll]);
    $role = ministryRole();
    $event = Event::factory()->create(['title' => 'Воскресное служение']);
    EventSlot::factory()->for($event)->withRole($role)->create();

    $this->getJson("/api/v1/roles/{$role->id}/usage")
        ->assertOk()
        ->assertJsonPath('data.blockers.0.type', 'event_slot')
        ->assertJsonPath('data.blockers.0.id', $event->id);

    $this->deleteJson("/api/v1/roles/{$role->id}")->assertStatus(422)->assertJsonPath('code', 'role.in_use');
});

it('does not count past or cancelled events', function () {
    actingAsUserWith([Permission::MinistriesManageAll]);
    $role = ministryRole();
    $past = Event::factory()->between(CarbonImmutable::now()->subDays(2), CarbonImmutable::now()->subDays(2)->addHour())->create();
    EventSlot::factory()->for($past)->withRole($role)->create();
    $cancelled = Event::factory()->cancelled()->create();
    EventSlot::factory()->for($cancelled)->withRole($role)->create();

    $this->getJson("/api/v1/roles/{$role->id}/usage")->assertJsonPath('data.blockers', []);
    $this->deleteJson("/api/v1/roles/{$role->id}")->assertNoContent();
});

it('blocks deleting a role required by a slot of an active template', function () {
    actingAsUserWith([Permission::MinistriesManageAll]);
    $role = ministryRole();
    $template = EventTemplate::factory()->weekly(7)->create(['title' => 'Воскресное служение']);
    EventTemplateSlot::factory()->for($template, 'template')->create(['role_id' => $role->id, 'label' => 'Вокалист']);

    $this->getJson("/api/v1/roles/{$role->id}/usage")
        ->assertJsonPath('data.blockers.0.type', 'template_slot')
        ->assertJsonPath('data.blockers.0.title', 'Воскресное служение');
});

it('ignores inactive and archived templates', function () {
    actingAsUserWith([Permission::MinistriesManageAll]);
    $role = ministryRole();
    EventTemplateSlot::factory()->for(EventTemplate::factory()->inactive()->create(), 'template')->create(['role_id' => $role->id]);
    EventTemplateSlot::factory()->for(EventTemplate::factory()->archived()->create(), 'template')->create(['role_id' => $role->id]);

    $this->deleteJson("/api/v1/roles/{$role->id}")->assertNoContent();
});
```

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Feature/Calendar/RoleUsageTest.php`
Ожидается: FAIL, блокировок нет и роль удаляется.

- [ ] **Шаг 3: Реализовать**

В `RoleUsageCollector::for` после собственных блокировок:

```php
foreach (app()->tagged('access.role_usage_sources') as $source) {
    $blockers = [...$blockers, ...$source->blockersFor($role)];
}
```

```php
final class CalendarRoleUsageSource implements RoleUsageSource
{
    public function blockersFor(Role $role): array
    {
        $tz = app(ChurchSettings::class)->timezone();
        $blockers = [];

        $events = Event::query()
            ->where('status', EventStatus::Scheduled)
            ->whereNull('archived_at')
            ->where('ends_at', '>', now())
            ->whereHas('slots', fn ($q) => $q->where('role_id', $role->id))
            ->orderBy('starts_at')
            ->get();

        foreach ($events as $event) {
            $blockers[] = ['type' => 'event_slot', 'id' => $event->id, 'title' => "{$event->title}, ".$event->starts_at->setTimezone($tz)->isoFormat('D MMM')];
        }

        $templates = EventTemplate::query()
            ->where('active', true)
            ->whereNull('archived_at')
            ->whereHas('slots', fn ($q) => $q->where('role_id', $role->id))
            ->get();

        foreach ($templates as $template) {
            $blockers[] = ['type' => 'template_slot', 'id' => $template->id, 'title' => $template->title];
        }

        return $blockers;
    }
}
```

- [ ] **Шаг 4: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Feature/Calendar/RoleUsageTest.php tests/Feature/Ministries/MinistryRoleTest.php tests/Feature/Access/GlobalRoleTest.php`
Ожидается: PASS, тесты ролей фазы 1 не сломаны.

- [ ] **Шаг 5: Коммит**

```bash
git add . && git commit -m "feat(calendar): role usage source blocks deletion by slots of events and templates"
```

**Критерии готовности:**
- Инвариант 6.3.6 закрыт: роль со слотами будущих `scheduled`-событий или активных шаблонов не удаляется, ответ `usage` перечисляет, где именно.
- Прошедшие и отменённые события, неактивные и архивные шаблоны не держат роль.
- Access не знает о календаре: связь через тегированный контракт, редактор ролей фазы 1 показывает новые блокировки без правок клиента.

---

## Блок 2. Шаблоны и генерация

### Задача 8: Шаблоны — создание, правка, слоты, правило повторения, архивация

**Файлы:**
- Создать: `app/Modules/Calendar/RecurrenceRule.php`; `Actions/CreateTemplate.php`, `UpdateTemplate.php`, `ArchiveTemplate.php`; `Policies/EventTemplatePolicy.php`; `Http/Controllers/TemplateController.php`, `Http/Requests/TemplateRequest.php`, `Http/Resources/EventTemplateResource.php`
- Изменить: `EventAccess` (`canManageTemplate`), `routes.php`
- Тест: `tests/Unit/Calendar/RecurrenceRuleTest.php` (разбор и проверка; даты — задача 10), `tests/Feature/Calendar/TemplateCrudTest.php`

**Интерфейсы:**
- Отдаёт наружу: `GET /templates?scope=church|ministry:{id}&archived`, `POST /templates`, `GET /templates/{id}`, `PATCH /templates/{id}`, `POST /templates/{id}/archive`.
- Отдаёт наружу: `final class RecurrenceRule` с `static fromArray(?array $data): ?self` (бросает `InvalidArgumentException` на неверной форме), `toArray(): array`, свойствами `type: 'weekly'|'biweekly'|'monthly_nth_weekday'`, `weekday: int` (ISO 1–7), `nth: ?int` (1–5 или −1), `anchorDate: ?CarbonImmutable`; метод `occurrencesBetween` добавляет задача 10.
- Отдаёт наружу: `CreateTemplate::handle(User $creator, array $attributes): EventTemplate` — `attributes`: `owner_type`, `ministry_id`, `title`, `description`, `location`, `visibility`, `start_time` (`HH:MM`), `duration_minutes`, `recurrence` (массив или `null`), `slots`. `UpdateTemplate::handle(EventTemplate $t, array $attributes): EventTemplate` — слоты заменяются целиком, если переданы; `active` переключается тем же запросом. `ArchiveTemplate::handle(EventTemplate $t): EventTemplate` — `archived_at` и `active = false`.
- Отдаёт наружу: `EventAccess::canManageTemplate(User, EventTemplate): bool` — по владельцу, как для событий.
- Отдаёт наружу: `EventTemplateResource`: `id`, `owner_type`, `ministry`, `title`, `description`, `location`, `visibility`, `start_time`, `duration_minutes`, `recurrence`, `active`, `generated_until`, `archived`, `can_manage`, `slots: list<{id, label, role, required_count, sort_order}>`.
- Коды ошибок: `template.archived`, `slot.label_required`, `slot.role_not_ministry`.

- [ ] **Шаг 1: Написать падающие тесты**

`tests/Unit/Calendar/RecurrenceRuleTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Calendar\RecurrenceRule;

it('returns null for no recurrence', function () {
    expect(RecurrenceRule::fromArray(null))->toBeNull();
});

it('parses weekly, biweekly and monthly rules', function () {
    expect(RecurrenceRule::fromArray(['type' => 'weekly', 'weekday' => 7])->weekday)->toBe(7)
        ->and(RecurrenceRule::fromArray(['type' => 'biweekly', 'weekday' => 6, 'anchor_date' => '2026-11-07'])->anchorDate?->toDateString())->toBe('2026-11-07')
        ->and(RecurrenceRule::fromArray(['type' => 'monthly_nth_weekday', 'weekday' => 2, 'nth' => -1])->nth)->toBe(-1);
});

it('rejects malformed rules', function (array $data) {
    expect(fn () => RecurrenceRule::fromArray($data))->toThrow(InvalidArgumentException::class);
})->with([
    [['type' => 'daily', 'weekday' => 1]],
    [['type' => 'weekly', 'weekday' => 0]],
    [['type' => 'weekly', 'weekday' => 8]],
    [['type' => 'biweekly', 'weekday' => 1]],
    [['type' => 'monthly_nth_weekday', 'weekday' => 1, 'nth' => 6]],
    [['type' => 'monthly_nth_weekday', 'weekday' => 1, 'nth' => 0]],
]);

it('round-trips through toArray', function () {
    $data = ['type' => 'biweekly', 'weekday' => 6, 'anchor_date' => '2026-11-07'];

    expect(RecurrenceRule::fromArray($data)?->toArray())->toBe($data);
});
```

`tests/Feature/Calendar/TemplateCrudTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Calendar\Models\EventTemplate;

function churchTemplate(array $over = []): array
{
    return [
        'owner_type' => 'church', 'title' => 'Воскресное служение', 'visibility' => 'church',
        'start_time' => '10:00', 'duration_minutes' => 120,
        'recurrence' => ['type' => 'weekly', 'weekday' => 7], 'slots' => [], ...$over,
    ];
}

it('denies creating a church template without calendar.church.manage', function () {
    actingAsUser();

    $this->postJson('/api/v1/templates', churchTemplate())->assertForbidden();
});

it('creates a weekly template with slots', function () {
    $ministry = ministryWithRoles();
    $vocalist = Role::query()->create(['scope' => 'ministry', 'ministry_id' => $ministry->id, 'name' => 'Вокалист']);
    actingAsUserWith([Permission::CalendarChurchManage]);

    $this->postJson('/api/v1/templates', churchTemplate(['slots' => [['role_id' => $vocalist->id, 'required_count' => 2]]]))
        ->assertCreated()
        ->assertJsonPath('data.recurrence.type', 'weekly')
        ->assertJsonPath('data.active', true)
        ->assertJsonPath('data.generated_until', null)
        ->assertJsonPath('data.slots.0.label', 'Вокалист');
});

it('creates a template without recurrence', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);

    $this->postJson('/api/v1/templates', churchTemplate(['recurrence' => null]))
        ->assertCreated()->assertJsonPath('data.recurrence', null);
});

it('validates the recurrence shape', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);

    $this->postJson('/api/v1/templates', churchTemplate(['recurrence' => ['type' => 'biweekly', 'weekday' => 7]]))
        ->assertStatus(422)->assertJsonValidationErrors('recurrence');
});

it('validates start_time and duration', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);

    $this->postJson('/api/v1/templates', churchTemplate(['start_time' => '25:00']))->assertStatus(422)->assertJsonValidationErrors('start_time');
    $this->postJson('/api/v1/templates', churchTemplate(['duration_minutes' => 0]))->assertStatus(422)->assertJsonValidationErrors('duration_minutes');
});

it('lets a leader manage templates of their ministry only', function () {
    $ministry = ministryWithRoles();
    $other = ministryWithRoles('Молодёжное');
    $user = actingAsUser();
    memberOf($ministry, $user->person, [$ministry->roles()->where('name', 'Лидер')->sole()->id]);

    $this->postJson('/api/v1/templates', churchTemplate(['owner_type' => 'ministry', 'ministry_id' => $ministry->id, 'visibility' => 'ministry']))->assertCreated();
    $this->postJson('/api/v1/templates', churchTemplate(['owner_type' => 'ministry', 'ministry_id' => $other->id]))->assertForbidden();
});

it('replaces slots wholesale on edit and toggles active', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $template = EventTemplate::factory()->weekly(7)->create();
    $this->patchJson("/api/v1/templates/{$template->id}", ['slots' => [['label' => 'Звук', 'required_count' => 1], ['label' => 'Свет', 'required_count' => 1]]])
        ->assertOk()->assertJsonCount(2, 'data.slots');

    $this->patchJson("/api/v1/templates/{$template->id}", ['slots' => [['label' => 'Звук', 'required_count' => 2]], 'active' => false])
        ->assertOk()->assertJsonCount(1, 'data.slots')->assertJsonPath('data.active', false);
});

it('archives a template, deactivates it and hides it from the list', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $template = EventTemplate::factory()->weekly(7)->create();

    $this->postJson("/api/v1/templates/{$template->id}/archive")->assertOk()->assertJsonPath('data.archived', true)->assertJsonPath('data.active', false);
    $this->getJson('/api/v1/templates')->assertOk()->assertJsonCount(0, 'data');
    $this->getJson('/api/v1/templates?archived=1')->assertOk()->assertJsonCount(1, 'data');
    $this->patchJson("/api/v1/templates/{$template->id}", ['title' => 'Х'])->assertStatus(422)->assertJsonPath('code', 'template.archived');
});

it('lists templates the viewer may manage or see', function () {
    $ministry = ministryWithRoles();
    $user = actingAsUser();
    memberOf($ministry, $user->person);
    EventTemplate::factory()->create();                       // церковный, видимость church
    EventTemplate::factory()->ministry($ministry)->create();  // своё служение
    EventTemplate::factory()->ministry(ministryWithRoles('Молодёжное'))->create();

    $this->getJson('/api/v1/templates')->assertOk()->assertJsonCount(2, 'data');
});
```

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Unit/Calendar/RecurrenceRuleTest.php tests/Feature/Calendar/TemplateCrudTest.php`
Ожидается: FAIL.

- [ ] **Шаг 3: `RecurrenceRule`**

```php
final class RecurrenceRule
{
    private const TYPES = ['weekly', 'biweekly', 'monthly_nth_weekday'];

    private function __construct(
        public readonly string $type,
        public readonly int $weekday,
        public readonly ?int $nth,
        public readonly ?CarbonImmutable $anchorDate,
    ) {}

    /** @param array<string, mixed>|null $data */
    public static function fromArray(?array $data): ?self
    {
        if ($data === null) {
            return null;
        }

        $type = $data['type'] ?? null;
        $weekday = $data['weekday'] ?? null;

        if (! in_array($type, self::TYPES, true) || ! is_int($weekday) || $weekday < 1 || $weekday > 7) {
            throw new InvalidArgumentException('Неверное правило повторения.');
        }

        $nth = $data['nth'] ?? null;
        $anchor = isset($data['anchor_date']) ? CarbonImmutable::parse($data['anchor_date']) : null;

        if ($type === 'biweekly' && $anchor === null) {
            throw new InvalidArgumentException('Для правила «раз в две недели» нужна опорная дата.');
        }

        if ($type === 'monthly_nth_weekday' && (! is_int($nth) || $nth === 0 || $nth > 5 || $nth < -1)) {
            throw new InvalidArgumentException('Порядковый номер недели должен быть от 1 до 5 или −1.');
        }

        return new self($type, $weekday, $type === 'monthly_nth_weekday' ? $nth : null, $type === 'biweekly' ? $anchor : null);
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return array_filter([
            'type' => $this->type,
            'weekday' => $this->weekday,
            'nth' => $this->nth,
            'anchor_date' => $this->anchorDate?->toDateString(),
        ], fn ($v) => $v !== null);
    }
}
```

- [ ] **Шаг 4: Actions, политика, эндпоинты**

`TemplateRequest` повторяет правила `StoreEventRequest` для владельца, видимости и слотов; `start_time` — `date_format:H:i`; `duration_minutes` — `integer|min:15|max:1440`; `recurrence` — `nullable|array` с проверкой через `RecurrenceRule::fromArray` в `withValidator` (исключение → ошибка поля `recurrence`); `active` — `boolean`. Слоты шаблона создаются той же проверкой, что `AddSlot` (вынести общую проверку роли и подписи в `SlotRules::normalize(array $slot): array{label, role_id, required_count}` и использовать в обоих местах). `EventTemplatePolicy` делегирует `EventAccess::canManageTemplate`; `view` — управляющие, участники служения-владельца, `ministries.view_all`, и все для церковных шаблонов с видимостью `church`. Список фильтрует по тем же правилам и по умолчанию скрывает архивные.

- [ ] **Шаг 5: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Unit/Calendar tests/Feature/Calendar`
Ожидается: PASS.

- [ ] **Шаг 6: Коммит**

```bash
composer openapi && git add . && git commit -m "feat(calendar): event templates with slots and recurrence rules"
```

**Критерии готовности:**
- Три вида правила повторения из раздела 5.4 разбираются и проверяются одним классом; неверная форма отвергается на входе, а не при генерации.
- Шаблон без повторения допустим — из него создают разовые события (задача 9).
- Слоты шаблона живут отдельно от слотов событий: правка шаблона созданные события не трогает (ADR-0005; проверит задача 10).
- Архивный шаблон неактивен и не редактируется; права на шаблон совпадают с правами на события владельца (раздел 6.4).

---

### Задача 9: Создание события из шаблона на дату

**Файлы:**
- Создать: `app/Modules/Calendar/Actions/CreateEventFromTemplate.php`; `Http/Requests/CreateEventFromTemplateRequest.php`
- Изменить: `TemplateController` (`createEvent`), `routes.php`
- Тест: `tests/Feature/Calendar/TemplateInstantiateTest.php`

**Интерфейсы:**
- Отдаёт наружу: `POST /templates/{id}/create-event` с `{ date: 'YYYY-MM-DD' }` → `201 EventResource`.
- Отдаёт наружу: `CreateEventFromTemplate::handle(EventTemplate $template, CarbonImmutable $date, ?User $creator): Event` — копирует владельца, название, описание, место, видимость и слоты; `starts_at` = дата + `start_time` по календарю церкви в UTC, `ends_at` = `starts_at + duration_minutes`; заполняет `template_id` и `occurrence_date`; публикует `EventCreated(id, 'none')`. Используется генератором (задача 10).
- Коды ошибок: `event.occurrence_exists`, `template.archived`.

- [ ] **Шаг 1: Написать падающие тесты**

```php
<?php

declare(strict_types=1);

use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventTemplate;
use App\Modules\Calendar\Models\EventTemplateSlot;
use App\Modules\Settings\ChurchSettings;

it('copies the template fields and slots into an independent event', function () {
    app(ChurchSettings::class)->put(['church.timezone' => 'Europe/Moscow']);
    actingAsUserWith([Permission::CalendarChurchManage]);
    $ministry = ministryWithRoles();
    $vocalist = Role::query()->create(['scope' => 'ministry', 'ministry_id' => $ministry->id, 'name' => 'Вокалист']);
    $template = EventTemplate::factory()->create(['title' => 'Воскресное служение', 'location' => 'Зал', 'start_time' => '10:00', 'duration_minutes' => 120]);
    EventTemplateSlot::factory()->for($template, 'template')->create(['role_id' => $vocalist->id, 'label' => 'Вокалист', 'required_count' => 2]);

    $response = $this->postJson("/api/v1/templates/{$template->id}/create-event", ['date' => '2026-11-08'])
        ->assertCreated()
        ->assertJsonPath('data.title', 'Воскресное служение')
        ->assertJsonPath('data.template_id', $template->id)
        ->assertJsonPath('data.occurrence_date', '2026-11-08')
        ->assertJsonPath('data.starts_at', '2026-11-08T07:00:00.000000Z')
        ->assertJsonPath('data.ends_at', '2026-11-08T09:00:00.000000Z')
        ->assertJsonPath('data.slots.0.label', 'Вокалист')
        ->assertJsonPath('data.slots.0.required_count', 2);

    $template->update(['title' => 'Переименовано']);
    expect(Event::query()->find($response->json('data.id'))->title)->toBe('Воскресное служение');
});

it('refuses a second event on the same date', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $template = EventTemplate::factory()->create();
    $this->postJson("/api/v1/templates/{$template->id}/create-event", ['date' => '2026-11-08'])->assertCreated();

    $this->postJson("/api/v1/templates/{$template->id}/create-event", ['date' => '2026-11-08'])
        ->assertStatus(422)->assertJsonPath('code', 'event.occurrence_exists');
});

it('refuses an archived template and checks the owner permission', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $archived = EventTemplate::factory()->archived()->create();
    $this->postJson("/api/v1/templates/{$archived->id}/create-event", ['date' => '2026-11-08'])
        ->assertStatus(422)->assertJsonPath('code', 'template.archived');

    actingAsUser();
    $this->postJson('/api/v1/templates/'.EventTemplate::factory()->create()->id.'/create-event', ['date' => '2026-11-08'])->assertForbidden();
});

it('works for a template without recurrence', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $template = EventTemplate::factory()->create(['recurrence' => null]);

    $this->postJson("/api/v1/templates/{$template->id}/create-event", ['date' => '2026-12-24'])->assertCreated();
});
```

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Feature/Calendar/TemplateInstantiateTest.php`
Ожидается: FAIL.

- [ ] **Шаг 3: Реализовать**

```php
final class CreateEventFromTemplate
{
    public function __construct(private readonly ChurchSettings $settings) {}

    public function handle(EventTemplate $template, CarbonImmutable $date, ?User $creator): Event
    {
        if ($template->archived_at !== null) {
            throw DomainRuleException::because('template.archived', 'Шаблон архивирован.');
        }

        if (Event::query()->where('template_id', $template->id)->whereDate('occurrence_date', $date->toDateString())->exists()) {
            throw DomainRuleException::because('event.occurrence_exists', 'Событие на эту дату уже создано из шаблона.');
        }

        $startsAt = CarbonImmutable::createFromFormat('Y-m-d H:i', $date->toDateString().' '.substr($template->start_time, 0, 5), $this->settings->timezone())->utc();

        $event = DB::transaction(function () use ($template, $date, $creator, $startsAt) {
            $event = Event::query()->create([
                'owner_type' => $template->owner_type,
                'ministry_id' => $template->ministry_id,
                'template_id' => $template->id,
                'occurrence_date' => $date->toDateString(),
                'title' => $template->title,
                'description' => $template->description,
                'location' => $template->location,
                'starts_at' => $startsAt,
                'ends_at' => $startsAt->addMinutes($template->duration_minutes),
                'visibility' => $template->visibility,
                'status' => EventStatus::Scheduled,
                'created_by_user_id' => $creator?->id,
            ]);

            foreach ($template->slots as $slot) {
                $event->slots()->create($slot->only(['label', 'resource_type', 'role_id', 'required_count', 'sort_order']));
            }

            return $event;
        });

        EventCreated::dispatch($event->id, 'none');

        return $event->load('slots.role', 'slots.assignments.person');
    }
}
```

`CreateEventFromTemplateRequest`: `date` — `required|date_format:Y-m-d`. Политика — `canManageTemplate`.

- [ ] **Шаг 4: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Feature/Calendar`
Ожидается: PASS.

- [ ] **Шаг 5: Коммит**

```bash
composer openapi && git add . && git commit -m "feat(calendar): create an event from a template on a chosen date"
```

**Критерии готовности:**
- Событие из шаблона независимо: переименование шаблона его не меняет (ADR-0005).
- Локальное «10:00 по Москве» превращается в `07:00Z` — тест на пояс обязателен (риск 6).
- Повтор на ту же дату отвергается понятным кодом, а не ошибкой уникального индекса.
- Тот же Action без пользователя переиспользует генератор.

---
### Задача 10: Даты повторения и команда `calendar:materialize`

**Файлы:**
- Создать: `app/Modules/Calendar/Actions/MaterializeTemplate.php`; `Console/MaterializeCommand.php`
- Изменить: `RecurrenceRule` (`occurrencesBetween`), `routes/console.php` (расписание)
- Тест: `tests/Unit/Calendar/RecurrenceOccurrencesTest.php`, `tests/Feature/Calendar/MaterializeTest.php`

**Интерфейсы:**
- Отдаёт наружу: `RecurrenceRule::occurrencesBetween(CarbonImmutable $from, CarbonImmutable $to): list<CarbonImmutable>` — даты (без времени) в закрытом диапазоне `[from, to]`.
- Отдаёт наружу: `MaterializeTemplate::handle(EventTemplate $template, CarbonImmutable $today): int` — создаёт события от `max(generated_until + 1, today)` до `today + horizon_weeks * 7`, сдвигает `generated_until`, возвращает число созданных.
- Отдаёт наружу: `php artisan calendar:materialize` — обходит активные неархивные шаблоны с правилом повторения у неархивных служений; `dailyAt('03:00')`.
- Потребляет: `CreateEventFromTemplate` (задача 9), `ChurchSettings::all()['calendar.horizon_weeks']`.

- [ ] **Шаг 1: Написать падающие тесты**

`tests/Unit/Calendar/RecurrenceOccurrencesTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Calendar\RecurrenceRule;
use Carbon\CarbonImmutable;

function dates(array $rule, string $from, string $to): array
{
    return array_map(
        fn (CarbonImmutable $d) => $d->toDateString(),
        RecurrenceRule::fromArray($rule)->occurrencesBetween(CarbonImmutable::parse($from), CarbonImmutable::parse($to)),
    );
}

it('lists every sunday for a weekly rule', function () {
    expect(dates(['type' => 'weekly', 'weekday' => 7], '2026-11-01', '2026-11-30'))
        ->toBe(['2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29']);
});

it('lists every other saturday from the anchor for a biweekly rule', function () {
    expect(dates(['type' => 'biweekly', 'weekday' => 6, 'anchor_date' => '2026-10-03'], '2026-11-01', '2026-11-30'))
        ->toBe(['2026-11-14', '2026-11-28']);
});

it('keeps the biweekly phase when the anchor is far in the past', function () {
    expect(dates(['type' => 'biweekly', 'weekday' => 6, 'anchor_date' => '2020-01-04'], '2026-11-01', '2026-11-30'))
        ->toBe(['2026-11-07', '2026-11-21']);
});

it('finds the second tuesday of each month', function () {
    expect(dates(['type' => 'monthly_nth_weekday', 'weekday' => 2, 'nth' => 2], '2026-11-01', '2026-12-31'))
        ->toBe(['2026-11-10', '2026-12-08']);
});

it('finds the last friday of each month', function () {
    expect(dates(['type' => 'monthly_nth_weekday', 'weekday' => 5, 'nth' => -1], '2026-11-01', '2026-12-31'))
        ->toBe(['2026-11-27', '2026-12-25']);
});

it('skips months without a fifth occurrence', function () {
    expect(dates(['type' => 'monthly_nth_weekday', 'weekday' => 7, 'nth' => 5], '2026-11-01', '2026-12-31'))
        ->toBe(['2026-11-29']);
});

it('includes both range ends', function () {
    expect(dates(['type' => 'weekly', 'weekday' => 7], '2026-11-08', '2026-11-15'))->toBe(['2026-11-08', '2026-11-15']);
});
```

`tests/Feature/Calendar/MaterializeTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventTemplate;
use App\Modules\Calendar\Models\EventTemplateSlot;
use App\Modules\Settings\ChurchSettings;
use Carbon\CarbonImmutable;

beforeEach(function () {
    CarbonImmutable::setTestNow('2026-11-02 12:00:00'); // понедельник
    app(ChurchSettings::class)->put(['church.timezone' => 'Europe/Warsaw']);
});

it('creates events for eight weeks ahead with copied slots', function () {
    $template = EventTemplate::factory()->weekly(7)->create(['start_time' => '10:00', 'duration_minutes' => 120]);
    EventTemplateSlot::factory()->for($template, 'template')->create(['label' => 'Звук', 'required_count' => 1]);

    $this->artisan('calendar:materialize')->assertSuccessful();

    $events = Event::query()->where('template_id', $template->id)->orderBy('starts_at')->get();
    expect($events)->toHaveCount(8)
        ->and($events->first()->occurrence_date->toDateString())->toBe('2026-11-08')
        ->and($events->last()->occurrence_date->toDateString())->toBe('2026-12-27')
        ->and($events->first()->slots)->toHaveCount(1)
        ->and($template->fresh()->generated_until->toDateString())->toBe('2026-12-28');
});

it('is idempotent', function () {
    EventTemplate::factory()->weekly(7)->create();

    $this->artisan('calendar:materialize');
    $this->artisan('calendar:materialize');

    expect(Event::query()->count())->toBe(8);
});

it('catches up when the horizon moves', function () {
    EventTemplate::factory()->weekly(7)->create();
    $this->artisan('calendar:materialize');

    CarbonImmutable::setTestNow('2026-11-09 12:00:00');
    $this->artisan('calendar:materialize');

    expect(Event::query()->count())->toBe(9);
});

it('does not recreate a cancelled occurrence', function () {
    $template = EventTemplate::factory()->weekly(7)->create();
    $this->artisan('calendar:materialize');
    Event::query()->where('template_id', $template->id)->first()->update(['status' => 'cancelled', 'cancelled_at' => now()]);

    $template->update(['generated_until' => null]);
    $this->artisan('calendar:materialize');

    expect(Event::query()->where('template_id', $template->id)->count())->toBe(8)
        ->and(Event::query()->where('status', 'cancelled')->count())->toBe(1);
});

it('keeps the local start time across the daylight saving change', function () {
    CarbonImmutable::setTestNow('2026-10-19 12:00:00');
    EventTemplate::factory()->weekly(7)->create(['start_time' => '10:00']);

    $this->artisan('calendar:materialize');

    $before = Event::query()->whereDate('occurrence_date', '2026-10-25')->sole(); // последнее воскресенье октября, переход в 03:00
    $after = Event::query()->whereDate('occurrence_date', '2026-11-01')->sole();
    expect($before->starts_at->format('H:i'))->toBe('09:00')   // CET после перехода в эту ночь
        ->and(Event::query()->whereDate('occurrence_date', '2026-10-18')->exists())->toBeFalse()
        ->and($after->starts_at->format('H:i'))->toBe('09:00')
        ->and(Event::query()->whereDate('occurrence_date', '2026-11-08')->sole()->starts_at->setTimezone('Europe/Warsaw')->format('H:i'))->toBe('10:00');
});

it('uses the horizon from settings', function () {
    app(ChurchSettings::class)->put(['calendar.horizon_weeks' => 2]);
    EventTemplate::factory()->weekly(7)->create();

    $this->artisan('calendar:materialize');

    expect(Event::query()->count())->toBe(2);
});

it('skips inactive and archived templates, templates without recurrence and archived ministries', function () {
    EventTemplate::factory()->weekly(7)->inactive()->create();
    EventTemplate::factory()->weekly(7)->archived()->create();
    EventTemplate::factory()->create(['recurrence' => null]);
    $ministry = ministryWithRoles();
    EventTemplate::factory()->ministry($ministry)->weekly(7)->create();
    $ministry->update(['archived_at' => now()]);

    $this->artisan('calendar:materialize');

    expect(Event::query()->count())->toBe(0);
});

it('leaves already created events alone when the template changes', function () {
    $template = EventTemplate::factory()->weekly(7)->create(['title' => 'Старое']);
    $this->artisan('calendar:materialize');

    $template->update(['title' => 'Новое']);
    $this->artisan('calendar:materialize');

    expect(Event::query()->where('title', 'Новое')->count())->toBe(0);
});
```

Проверка дат: 25 октября 2026 — последнее воскресенье октября, переход на зимнее время в Варшаве происходит в 03:00 этого дня, так что 10:00 местного уже `09:00Z`; до перехода (например, 18 октября) было бы `08:00Z`. Тест начинается с понедельника 19 октября, поэтому первое созданное воскресенье — 25-е; отсутствие события 18-го подтверждает, что генерация не заходит в прошлое.

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Unit/Calendar/RecurrenceOccurrencesTest.php tests/Feature/Calendar/MaterializeTest.php`
Ожидается: FAIL.

- [ ] **Шаг 3: Даты повторения**

```php
/** @return list<CarbonImmutable> */
public function occurrencesBetween(CarbonImmutable $from, CarbonImmutable $to): array
{
    $from = $from->startOfDay();
    $to = $to->startOfDay();
    $dates = [];

    if ($this->type === 'monthly_nth_weekday') {
        for ($month = $from->startOfMonth(); $month <= $to; $month = $month->addMonth()) {
            $date = $this->nthWeekdayOf($month);
            if ($date !== null && $date >= $from && $date <= $to) {
                $dates[] = $date;
            }
        }

        return $dates;
    }

    $cursor = $from->isoWeekday() <= $this->weekday
        ? $from->isoWeekday($this->weekday)
        : $from->addWeek()->isoWeekday($this->weekday);

    for (; $cursor <= $to; $cursor = $cursor->addWeek()) {
        if ($this->type === 'biweekly' && $this->anchorDate->startOfDay()->diffInWeeks($cursor) % 2 !== 0) {
            continue;
        }
        $dates[] = $cursor;
    }

    return $dates;
}

private function nthWeekdayOf(CarbonImmutable $monthStart): ?CarbonImmutable
{
    if ($this->nth === -1) {
        $last = $monthStart->endOfMonth()->startOfDay();

        return $last->isoWeekday() >= $this->weekday
            ? $last->isoWeekday($this->weekday)
            : $last->subWeek()->isoWeekday($this->weekday);
    }

    $first = $monthStart->isoWeekday() <= $this->weekday
        ? $monthStart->isoWeekday($this->weekday)
        : $monthStart->addWeek()->isoWeekday($this->weekday);
    $date = $first->addWeeks($this->nth - 1);

    return $date->month === $monthStart->month ? $date : null;
}
```

Для `biweekly` опорная дата приводится к дню недели правила: фаза считается от ближайшего `weekday`, не раньше `anchor_date`.

- [ ] **Шаг 4: Генератор и команда**

```php
final class MaterializeTemplate
{
    public function __construct(private readonly ChurchSettings $settings, private readonly CreateEventFromTemplate $create) {}

    public function handle(EventTemplate $template, CarbonImmutable $today): int
    {
        $rule = RecurrenceRule::fromArray($template->recurrence);
        if ($rule === null) {
            return 0;
        }

        $horizon = $today->addWeeks((int) $this->settings->all()['calendar.horizon_weeks']);
        $from = $template->generated_until === null ? $today : max($today, $template->generated_until->addDay());
        $created = 0;

        foreach ($rule->occurrencesBetween($from, $horizon) as $date) {
            if (Event::query()->where('template_id', $template->id)->whereDate('occurrence_date', $date)->exists()) {
                continue;   // в том числе отменённые
            }
            $this->create->handle($template, $date, null);
            $created++;
        }

        $template->forceFill(['generated_until' => $horizon])->save();

        return $created;
    }
}
```

`MaterializeCommand`: `today = now(tz)->startOfDay()`; шаблоны — `active`, `archived_at IS NULL`, `recurrence IS NOT NULL`, `whereDoesntHave('ministry', archived)`; итог в вывод. `routes/console.php`: `Schedule::command('calendar:materialize')->dailyAt('03:00');`.

- [ ] **Шаг 5: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Unit/Calendar tests/Feature/Calendar`
Ожидается: PASS.

- [ ] **Шаг 6: Коммит**

```bash
git add . && git commit -m "feat(calendar): recurrence occurrences and daily materialization command"
```

**Критерии готовности:**
- Шесть тестов генерации из раздела 12 зелёные: еженедельно, раз в две недели, N-й день недели месяца, переход на летнее время, горизонт, идемпотентность.
- Отменённое событие не воскресает, правка шаблона не трогает созданные события (ADR-0005).
- Горизонт берётся из настроек, а не из константы.
- Команда стоит в расписании и безопасна при повторном запуске.

---

### Задача 11: Архивация служения в календаре

**Файлы:**
- Создать: `app/Modules/Calendar/Listeners/OnMinistryArchived.php`
- Изменить: `AppServiceProvider` (подписка на `MinistryArchived`)
- Тест: `tests/Feature/Calendar/MinistryArchiveCalendarTest.php`

**Интерфейсы:**
- Потребляет: `MinistryArchived(string $ministryId)` из фазы 1, `CancelEvent` (задача 6).
- Отдаёт наружу: реакция календаря на архивацию служения по разделу 7.3: шаблоны служения → `active = false`; будущие события служения `scheduled` → отменены с причиной «Служение архивировано».

- [ ] **Шаг 1: Написать падающие тесты**

```php
<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use App\Modules\Calendar\Events\EventCancelled;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventTemplate;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Event as EventBus;

it('cancels future scheduled events of the archived ministry and deactivates its templates', function () {
    EventBus::fake([EventCancelled::class]);
    $ministry = ministryWithRoles();
    $other = ministryWithRoles('Молодёжное');
    $future = Event::factory()->ministry($ministry)->create();
    $past = Event::factory()->ministry($ministry)->between(CarbonImmutable::now()->subDays(3), CarbonImmutable::now()->subDays(3)->addHour())->create();
    $foreign = Event::factory()->ministry($other)->create();
    $church = Event::factory()->create();
    $template = EventTemplate::factory()->ministry($ministry)->weekly(7)->create();
    actingAsUserWith([Permission::MinistriesCreate]);

    $this->postJson("/api/v1/ministries/{$ministry->id}/archive")->assertOk();

    expect($future->fresh()->status->value)->toBe('cancelled')
        ->and($future->fresh()->cancel_reason)->toBe('Служение архивировано')
        ->and($past->fresh()->status->value)->toBe('scheduled')
        ->and($foreign->fresh()->status->value)->toBe('scheduled')
        ->and($church->fresh()->status->value)->toBe('scheduled')
        ->and($template->fresh()->active)->toBeFalse();
    EventBus::assertDispatchedTimes(EventCancelled::class, 1);
});

it('writes the cancellation to the journal without an actor when run from the queue', function () {
    $ministry = ministryWithRoles();
    $event = Event::factory()->ministry($ministry)->create();

    (new \App\Modules\Calendar\Listeners\OnMinistryArchived())
        ->handle(new \App\Modules\Ministries\Events\MinistryArchived($ministry->id));

    expect(\App\Modules\Access\Models\AuditEntry::query()->where('action', 'event.cancelled')->where('subject_id', $event->id)->exists())->toBeTrue();
});
```

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Feature/Calendar/MinistryArchiveCalendarTest.php`
Ожидается: FAIL.

- [ ] **Шаг 3: Реализовать**

```php
final class OnMinistryArchived implements ShouldQueue
{
    public function handle(MinistryArchived $event): void
    {
        EventTemplate::query()->where('ministry_id', $event->ministryId)->update(['active' => false]);

        Event::query()
            ->where('ministry_id', $event->ministryId)
            ->where('status', EventStatus::Scheduled)
            ->where('ends_at', '>', now())
            ->each(fn (Event $e) => app(CancelEvent::class)->handle($e, 'Служение архивировано', null));
    }
}
```

- [ ] **Шаг 4: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Feature/Calendar tests/Feature/Ministries`
Ожидается: PASS.

- [ ] **Шаг 5: Коммит**

```bash
git add . && git commit -m "feat(calendar): react to ministry archiving by cancelling future events and deactivating templates"
```

**Критерии готовности:**
- Раздел 7.3 выполнен на стороне календаря: прошлое и чужое не тронуто, будущее отменено через общий `CancelEvent`, поэтому назначенные получат уведомление (задача 12).
- Ministries не знает о календаре: реакция — слушатель в очереди.

---

## Блок 3. Уведомления, напоминания, iCal

### Задача 12: Уведомления о назначениях, изменениях, отмене и новых событиях

**Файлы:**
- Создать: `app/Modules/Notifications/Notifications/AssignmentCreatedNotification.php`, `AssignmentRemovedNotification.php`, `EventChangedNotification.php`, `EventCancelledNotification.php`, `EventAnnouncedNotification.php`; `Listeners/NotifyAboutAssignment.php`, `NotifyAboutEventChange.php`, `NotifyAboutEventCancellation.php`, `NotifyAboutNewEvent.php`
- Изменить: `Recipients` (`assignedToEvent`), `AppServiceProvider` (подписки)
- Тест: `tests/Feature/Notifications/AssignmentNotificationTest.php`, `tests/Feature/Notifications/EventNotificationTest.php`

**Интерфейсы:**
- Отдаёт наружу: `Recipients::assignedToEvent(string $eventId): LazyCollection<User>` — активные аккаунты назначенных без дублей.
- Отдаёт наружу: пять уведомлений категории `assignments`, все с `url = /events/{id}` и `tag = event-{id}`; тексты: «Вас назначили: {название}, {дата и время по церкви}», «Назначение снято: …», «Событие изменено: …» (с перечнем: время, место), «Событие отменено: …» (с причиной), «Новое событие: …».
- Потребляет: `AssignmentCreated`, `AssignmentRemoved`, `EventChanged`, `EventCancelled`, `EventCreated` из задач 2, 5, 6; `Recipients::allActive`, `ministryMembers` из фазы 2; `useChurchDate` не нужен — дата форматируется на сервере в поясе церкви.

- [ ] **Шаг 1: Написать падающие тесты**

`tests/Feature/Notifications/AssignmentNotificationTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventAssignment;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use App\Modules\Notifications\Notifications\AssignmentCreatedNotification;
use App\Modules\Notifications\Notifications\AssignmentRemovedNotification;
use App\Modules\Settings\ChurchSettings;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Notification;

beforeEach(fn () => Notification::fake());

it('notifies the assigned person with the event time in church time', function () {
    app(ChurchSettings::class)->put(['church.timezone' => 'Europe/Moscow']);
    actingAsUserWith([Permission::CalendarChurchManage]);
    $event = Event::factory()->between(CarbonImmutable::parse('2026-11-08 07:00'), CarbonImmutable::parse('2026-11-08 09:00'))->create(['title' => 'Воскресное служение']);
    $slot = EventSlot::factory()->for($event)->create(['label' => 'Звук']);
    $person = Person::factory()->has(User::factory())->create();

    $this->postJson("/api/v1/slots/{$slot->id}/assignments", ['person_id' => $person->id])->assertCreated();

    Notification::assertSentTo($person->user, AssignmentCreatedNotification::class, function (AssignmentCreatedNotification $n) use ($person, $event) {
        $data = $n->toArray($person->user);

        return $data['category'] === 'assignments'
            && $data['tag'] === "event-{$event->id}"
            && $data['url'] === "/events/{$event->id}"
            && str_contains($data['body'], '8 нояб.')
            && str_contains($data['body'], '10:00')
            && str_contains($data['body'], 'Звук');
    });
});

it('sends nothing for a person without an account', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $slot = EventSlot::factory()->create();

    $this->postJson("/api/v1/slots/{$slot->id}/assignments", ['person_id' => Person::factory()->create()->id]);

    Notification::assertNothingSent();
});

it('notifies about a removed assignment', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $person = Person::factory()->has(User::factory())->create();
    $assignment = EventAssignment::factory()->for(EventSlot::factory()->create())->for($person)->create();

    $this->deleteJson("/api/v1/assignments/{$assignment->id}")->assertNoContent();

    Notification::assertSentTo($person->user, AssignmentRemovedNotification::class);
});

it('does not notify the person who assigned themselves', function () {
    $user = actingAsUserWith([Permission::CalendarChurchManage]);
    $slot = EventSlot::factory()->create();

    $this->postJson("/api/v1/slots/{$slot->id}/assignments", ['person_id' => $user->person_id]);

    Notification::assertNotSentTo($user, AssignmentCreatedNotification::class);
});
```

`tests/Feature/Notifications/EventNotificationTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventAssignment;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use App\Modules\Notifications\Notifications\EventAnnouncedNotification;
use App\Modules\Notifications\Notifications\EventCancelledNotification;
use App\Modules\Notifications\Notifications\EventChangedNotification;
use Illuminate\Support\Facades\Notification;

beforeEach(fn () => Notification::fake());

function eventWithAssignees(int $count = 2): array
{
    $event = Event::factory()->create();
    $slot = EventSlot::factory()->for($event)->create(['required_count' => $count]);
    $users = collect(range(1, $count))->map(function () use ($slot) {
        $person = Person::factory()->has(User::factory())->create();
        EventAssignment::factory()->for($slot)->for($person)->create();

        return $person->user;
    });

    return [$event, $users];
}

it('notifies every assignee when the time or the place changes', function () {
    [$event, $users] = eventWithAssignees();
    actingAsUserWith([Permission::CalendarChurchManage]);

    $this->patchJson("/api/v1/events/{$event->id}", ['location' => 'Зал 2'])->assertOk();

    Notification::assertSentTo($users, EventChangedNotification::class);
    Notification::assertSentTo($users->first(), EventChangedNotification::class, fn ($n) => str_contains($n->toArray($users->first())['body'], 'место'));
});

it('does not notify when only the description changes', function () {
    [$event] = eventWithAssignees();
    actingAsUserWith([Permission::CalendarChurchManage]);

    $this->patchJson("/api/v1/events/{$event->id}", ['description' => 'Без изменений времени'])->assertOk();

    Notification::assertNothingSent();
});

it('notifies assignees about a cancellation with the reason', function () {
    [$event, $users] = eventWithAssignees();
    actingAsUserWith([Permission::CalendarChurchManage]);

    $this->postJson("/api/v1/events/{$event->id}/cancel", ['reason' => 'Ремонт зала'])->assertOk();

    Notification::assertSentTo($users->first(), EventCancelledNotification::class, fn ($n) => str_contains($n->toArray($users->first())['body'], 'Ремонт зала'));
});

it('skips disabled accounts and does not notify the same account twice', function () {
    $event = Event::factory()->create();
    $person = Person::factory()->has(User::factory())->create();
    $disabled = Person::factory()->has(User::factory(['disabled_at' => now()]))->create();
    EventAssignment::factory()->for(EventSlot::factory()->for($event)->create())->for($person)->create();
    EventAssignment::factory()->for(EventSlot::factory()->for($event)->create())->for($person)->create();
    EventAssignment::factory()->for(EventSlot::factory()->for($event)->create())->for($disabled)->create();
    actingAsUserWith([Permission::CalendarChurchManage]);

    $this->postJson("/api/v1/events/{$event->id}/cancel")->assertOk();

    Notification::assertSentToTimes($person->user, EventCancelledNotification::class, 1);
    Notification::assertNotSentTo($disabled->user, EventCancelledNotification::class);
});

it('announces a new church event to everyone only when asked', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $others = User::factory()->count(2)->create();
    $body = ['owner_type' => 'church', 'title' => 'Крещение', 'starts_at' => '2026-11-08T07:00:00Z', 'ends_at' => '2026-11-08T09:00:00Z', 'visibility' => 'church'];

    $this->postJson('/api/v1/events', $body)->assertCreated();
    Notification::assertNotSentTo($others, EventAnnouncedNotification::class);

    $this->postJson('/api/v1/events', [...$body, 'notify' => 'all'])->assertCreated();
    Notification::assertSentTo($others, EventAnnouncedNotification::class);
});

it('announces a new ministry event to its members', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::MinistriesManageAll]);
    $member = User::factory()->create();
    memberOf($ministry, $member->person);
    $stranger = User::factory()->create();

    $this->postJson('/api/v1/events', [
        'owner_type' => 'ministry', 'ministry_id' => $ministry->id, 'title' => 'Репетиция',
        'starts_at' => '2026-11-07T15:00:00Z', 'ends_at' => '2026-11-07T17:00:00Z', 'visibility' => 'ministry', 'notify' => 'ministry',
    ])->assertCreated();

    Notification::assertSentTo($member, EventAnnouncedNotification::class);
    Notification::assertNotSentTo($stranger, EventAnnouncedNotification::class);
});
```

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Feature/Notifications/AssignmentNotificationTest.php tests/Feature/Notifications/EventNotificationTest.php`
Ожидается: FAIL.

- [ ] **Шаг 3: Реализовать**

Общий помощник форматирования в Notifications: `EventText::when(Event $event): string` → `{d MMM}, {HH:mm}` в поясе церкви через `Carbon::isoFormat('D MMM, HH:mm')` с локалью `ru`.

```php
final class AssignmentCreatedNotification extends AppNotification
{
    public function __construct(private readonly Event $event, private readonly string $slotLabel) {}

    public function category(): NotificationCategory { return NotificationCategory::Assignments; }
    public function title(): string { return 'Вас назначили'; }
    public function body(): string { return "{$this->event->title}, ".EventText::when($this->event).", слот «{$this->slotLabel}»"; }
    public function url(): string { return "/events/{$this->event->id}"; }
    public function tag(): string { return "event-{$this->event->id}"; }
}
```

`NotifyAboutAssignment` слушает `AssignmentCreated` и `AssignmentRemoved`: `userId === null` → выход; `userId === actorUserId` (человек назначил себя сам) → выход; иначе `Notification::send` аккаунту назначенного. `NotifyAboutEventChange` — по `EventChanged` рассылает `Recipients::assignedToEvent` текст с перечнем изменённого («время», «место»). `NotifyAboutEventCancellation` — по `EventCancelled`. `NotifyAboutNewEvent` — по `EventCreated` с `notify !== 'none'`: `all` → `allActive`, `ministry` → `ministryMembers`.

`Recipients::assignedToEvent`: `User` через `event_assignments → event_slots` с `distinct`, `whereNull('disabled_at')`.

- [ ] **Шаг 4: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Feature/Notifications tests/Feature/Calendar`
Ожидается: PASS.

- [ ] **Шаг 5: Коммит**

```bash
git add . && git commit -m "feat(notifications): assignment, event change, cancellation and new event notifications"
```

**Критерии готовности:**
- Строки категории `assignments` из таблицы 7.7 закрыты тестами: назначение, снятие, изменение времени или места, отмена, флаг при создании.
- Изменение одного описания тишину не нарушает; отключённые и повторно назначенные аккаунты не получают лишнего.
- Тексты содержат дату и время по календарю церкви, тег `event-{id}` сворачивает уведомления одного события.

---

### Задача 13: Напоминания за сутки и за два часа

**Файлы:**
- Создать: `app/Modules/Calendar/Actions/RecordReminder.php`; `Console/SendRemindersCommand.php`; `Events/EventReminderDue.php`; `app/Modules/Notifications/Notifications/EventReminderNotification.php`; `Listeners/NotifyAboutReminder.php`
- Изменить: `routes/console.php`, `AppServiceProvider`
- Тест: `tests/Feature/Calendar/ReminderCommandTest.php`, `tests/Feature/Notifications/ReminderNotificationTest.php`

**Интерфейсы:**
- Отдаёт наружу: `php artisan calendar:send-reminders` — для каждого `ReminderKind` из `calendar.reminder_offsets` выбирает `scheduled`-события с `starts_at` в `[now + offset, now + offset + 5 мин)` без строки в `event_reminders`, пишет строку, публикует `EventReminderDue(string $eventId, ReminderKind $kind)`; `everyFiveMinutes()->withoutOverlapping()`.
- Отдаёт наружу: `EventReminderNotification(Event $event, ReminderKind $kind)` — категория `reminders`, `tag = event-{id}-reminder`, `title` «Напоминание: {за сутки|за два часа}», `body` «{название}, {дата и время по церкви}, {место}».

- [ ] **Шаг 1: Написать падающие тесты**

`tests/Feature/Calendar/ReminderCommandTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Calendar\Events\EventReminderDue;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventReminder;
use App\Modules\Calendar\ReminderKind;
use App\Modules\Settings\ChurchSettings;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Event as EventBus;

beforeEach(function () {
    CarbonImmutable::setTestNow('2026-11-07 10:00:00');
    EventBus::fake([EventReminderDue::class]);
});

it('sends the day-before reminder once for an event starting in 24 hours', function () {
    $event = Event::factory()->between(CarbonImmutable::parse('2026-11-08 10:02'), CarbonImmutable::parse('2026-11-08 12:00'))->create();

    $this->artisan('calendar:send-reminders')->assertSuccessful();
    $this->artisan('calendar:send-reminders')->assertSuccessful();

    expect(EventReminder::query()->where('event_id', $event->id)->where('kind', 'h24')->count())->toBe(1);
    EventBus::assertDispatchedTimes(EventReminderDue::class, 1);
    EventBus::assertDispatched(EventReminderDue::class, fn (EventReminderDue $e) => $e->kind === ReminderKind::H24);
});

it('sends the two-hour reminder', function () {
    Event::factory()->between(CarbonImmutable::parse('2026-11-07 12:00'), CarbonImmutable::parse('2026-11-07 13:00'))->create();

    $this->artisan('calendar:send-reminders');

    EventBus::assertDispatched(EventReminderDue::class, fn (EventReminderDue $e) => $e->kind === ReminderKind::H2);
});

it('skips events outside the window, cancelled events and windows already passed', function () {
    Event::factory()->between(CarbonImmutable::parse('2026-11-08 10:06'), CarbonImmutable::parse('2026-11-08 12:00'))->create(); // на минуту позже окна
    Event::factory()->cancelled()->between(CarbonImmutable::parse('2026-11-08 10:02'), CarbonImmutable::parse('2026-11-08 12:00'))->create();
    Event::factory()->between(CarbonImmutable::parse('2026-11-08 09:58'), CarbonImmutable::parse('2026-11-08 12:00'))->create(); // окно прошло

    $this->artisan('calendar:send-reminders');

    EventBus::assertNotDispatched(EventReminderDue::class);
});

it('respects the configured offsets', function () {
    app(ChurchSettings::class)->put(['calendar.reminder_offsets' => ['h2']]);
    Event::factory()->between(CarbonImmutable::parse('2026-11-08 10:02'), CarbonImmutable::parse('2026-11-08 12:00'))->create();

    $this->artisan('calendar:send-reminders');

    EventBus::assertNotDispatched(EventReminderDue::class);
});
```

`tests/Feature/Notifications/ReminderNotificationTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Calendar\Events\EventReminderDue;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventAssignment;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Calendar\ReminderKind;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use App\Modules\Notifications\Listeners\NotifyAboutReminder;
use App\Modules\Notifications\Notifications\EventReminderNotification;
use App\Modules\Settings\ChurchSettings;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Notification;

beforeEach(fn () => Notification::fake());

it('reminds every assigned account and nobody else', function () {
    app(ChurchSettings::class)->put(['church.timezone' => 'Europe/Moscow']);
    $event = Event::factory()->between(CarbonImmutable::parse('2026-11-08 07:00'), CarbonImmutable::parse('2026-11-08 09:00'))->create(['title' => 'Служение', 'location' => 'Зал']);
    $assigned = Person::factory()->has(User::factory())->create();
    EventAssignment::factory()->for(EventSlot::factory()->for($event)->create())->for($assigned)->create();
    $stranger = User::factory()->create();

    (new NotifyAboutReminder())->handle(new EventReminderDue($event->id, ReminderKind::H24));

    Notification::assertSentTo($assigned->user, EventReminderNotification::class, function (EventReminderNotification $n) use ($assigned, $event) {
        $data = $n->toArray($assigned->user);

        return $data['category'] === 'reminders'
            && $data['tag'] === "event-{$event->id}-reminder"
            && $data['title'] === 'Напоминание: за сутки'
            && str_contains($data['body'], '10:00')
            && str_contains($data['body'], 'Зал');
    });
    Notification::assertNotSentTo($stranger, EventReminderNotification::class);
});

it('does nothing for an event that got cancelled between the command and the queue', function () {
    $event = Event::factory()->cancelled()->create();

    (new NotifyAboutReminder())->handle(new EventReminderDue($event->id, ReminderKind::H2));

    Notification::assertNothingSent();
});
```

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Feature/Calendar/ReminderCommandTest.php tests/Feature/Notifications/ReminderNotificationTest.php`
Ожидается: FAIL.

- [ ] **Шаг 3: Реализовать**

```php
final class SendRemindersCommand extends Command
{
    protected $signature = 'calendar:send-reminders';

    public function handle(ChurchSettings $settings, RecordReminder $record): int
    {
        $now = CarbonImmutable::now();

        foreach ((array) $settings->all()['calendar.reminder_offsets'] as $value) {
            $kind = ReminderKind::from($value);
            $from = $now->add($kind->offset());
            $to = $from->addMinutes(5);

            Event::query()
                ->where('status', EventStatus::Scheduled)
                ->whereNull('archived_at')
                ->where('starts_at', '>=', $from)
                ->where('starts_at', '<', $to)
                ->whereDoesntHave('reminders', fn ($q) => $q->where('kind', $kind->value))
                ->each(fn (Event $event) => $record->handle($event, $kind));
        }

        return self::SUCCESS;
    }
}
```

`RecordReminder::handle(Event $event, ReminderKind $kind): void` — `insertOrIgnore` в `event_reminders` и, если строка вставлена, `EventReminderDue::dispatch($event->id, $kind)`. `NotifyAboutReminder` (`ShouldQueue`): событие не найдено или отменено → выход; иначе `Notification::send(Recipients::assignedToEvent(...), new EventReminderNotification($event, $kind))`. Расписание: `Schedule::command('calendar:send-reminders')->everyFiveMinutes()->withoutOverlapping();`.

- [ ] **Шаг 4: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Feature/Calendar tests/Feature/Notifications`
Ожидается: PASS.

- [ ] **Шаг 5: Коммит**

```bash
git add . && git commit -m "feat(calendar,notifications): reminders 24h and 2h before events"
```

**Критерии готовности:**
- Окно `[now + offset, now + offset + 5 мин)` из раздела 7.4 закрыто тестами по обе границы; повторный запуск не дублирует.
- Назначенный после прохождения окна напоминание не получает — принято (раздел 7.4).
- Смещения читаются из настроек; отменённое между командой и очередью событие не напоминает о себе.

---

### Задача 14: Лента iCal и перевыпуск токена

**Файлы:**
- Создать: `app/Modules/Calendar/IcalFeedBuilder.php`; `Http/Controllers/IcalFeedController.php`; `app/Modules/Directory/Actions/RotateIcalToken.php`; `app/Modules/Directory/Http/Controllers/IcalTokenController.php`
- Изменить: `app/Modules/Calendar/routes.php`, `app/Modules/Directory/routes.php`, `MeResource` (`ical_url`), `composer.json` (`spatie/icalendar-generator`)
- Тест: `tests/Feature/Calendar/IcalFeedTest.php`

**Интерфейсы:**
- Отдаёт наружу: `GET /calendar/feed/{token}.ics` — без сессии, `text/calendar`, только события `scheduled`, куда назначен человек аккаунта, от 30 дней назад до 180 дней вперёд.
- Отдаёт наружу: `POST /me/ical-token/rotate` → `{ data: { ical_url } }`; `GET /auth/me` отдаёт `user.ical_url`.
- Отдаёт наружу: `IcalFeedBuilder::for(User $user): string`.

- [ ] **Шаг 1: Написать падающие тесты**

```php
<?php

declare(strict_types=1);

use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventAssignment;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Directory\Models\User;
use Carbon\CarbonImmutable;

function assign(User $user, Event $event, string $label = 'Звук'): void
{
    EventAssignment::factory()->for(EventSlot::factory()->for($event)->create(['label' => $label]))->for($user->person)->create();
}

it('returns 404 for an unknown token and for a disabled account', function () {
    $this->get('/api/v1/calendar/feed/nope.ics')->assertNotFound();

    $disabled = User::factory()->create(['disabled_at' => now()]);
    $this->get("/api/v1/calendar/feed/{$disabled->ical_token}.ics")->assertNotFound();
});

it('lists assigned scheduled events as vevents with slots in the description', function () {
    $user = User::factory()->create();
    $event = Event::factory()->between(CarbonImmutable::parse('2026-11-08 07:00'), CarbonImmutable::parse('2026-11-08 09:00'))->create(['title' => 'Воскресное служение', 'location' => 'Зал']);
    assign($user, $event, 'Звук');
    assign($user, $event, 'Свет');
    assign($user, Event::factory()->cancelled()->create());
    Event::factory()->create();

    $response = $this->get("/api/v1/calendar/feed/{$user->ical_token}.ics")
        ->assertOk()
        ->assertHeader('Content-Type', 'text/calendar; charset=UTF-8');

    $body = $response->getContent();
    expect(substr_count($body, 'BEGIN:VEVENT'))->toBe(1)
        ->and($body)->toContain('SUMMARY:Воскресное служение')
        ->and($body)->toContain('LOCATION:Зал')
        ->and($body)->toContain('DTSTART:20261108T070000Z')
        ->and($body)->toContain("UID:event-{$event->id}@")
        ->and($body)->toContain('Звук')
        ->and($body)->toContain('Свет');
});

it('rotates the token and invalidates the old link', function () {
    $user = actingAsUser();
    $old = $user->ical_token;

    $new = $this->postJson('/api/v1/me/ical-token/rotate')->assertOk()->json('data.ical_url');

    expect($new)->not->toContain($old);
    $this->get("/api/v1/calendar/feed/{$old}.ics")->assertNotFound();
    $this->get("/api/v1/calendar/feed/{$user->fresh()->ical_token}.ics")->assertOk();
});

it('exposes the feed url in me', function () {
    $user = actingAsUser();

    $this->getJson('/api/v1/auth/me')->assertJsonPath('user.ical_url', fn (string $url) => str_contains($url, $user->ical_token));
});
```

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Feature/Calendar/IcalFeedTest.php`
Ожидается: FAIL.

- [ ] **Шаг 3: Реализовать**

```bash
cd apps/api && composer require spatie/icalendar-generator
```

```php
final class IcalFeedBuilder
{
    public function for(User $user): string
    {
        $events = Event::query()
            ->where('status', EventStatus::Scheduled)
            ->whereNull('archived_at')
            ->whereBetween('starts_at', [now()->subDays(30), now()->addDays(180)])
            ->whereHas('slots.assignments', fn ($q) => $q->where('person_id', $user->person_id))
            ->with(['slots' => fn ($q) => $q->whereHas('assignments', fn ($a) => $a->where('person_id', $user->person_id))])
            ->orderBy('starts_at')
            ->get();

        $calendar = Calendar::create(app(ChurchSettings::class)->name())->refreshInterval(60);
        $host = parse_url((string) config('app.url'), PHP_URL_HOST) ?: 'church';

        foreach ($events as $event) {
            $calendar->event(
                SpatieEvent::create($event->title)
                    ->uniqueIdentifier("event-{$event->id}@{$host}")
                    ->startsAt($event->starts_at->toDateTime())
                    ->endsAt($event->ends_at->toDateTime())
                    ->address((string) $event->location)
                    ->description('Слоты: '.$event->slots->pluck('label')->implode(', '))
                    ->withoutTimezone()
            );
        }

        return $calendar->get();
    }
}
```

Контроллер: `User::where('ical_token', $token)->whereNull('disabled_at')->firstOrFail()`, ответ с `Content-Type: text/calendar; charset=UTF-8`, маршрут `calendar/feed/{token}.ics` без `auth`, с `throttle:60,1`. `RotateIcalToken::handle(User $user): User` — `Str::random(64)`, журнал не пишется (личное действие). `MeResource` добавляет `user.ical_url = url("/api/v1/calendar/feed/{$token}.ics")`.

- [ ] **Шаг 4: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Feature/Calendar tests/Feature/Directory/LoginTest.php`
Ожидается: PASS.

- [ ] **Шаг 5: Проверить в календаре телефона**

Добавить ссылку из `GET /auth/me` подпиской в календарь iPhone или Google Calendar.
Ожидается: события появляются с названием и местом, время совпадает с поясом церкви.

- [ ] **Шаг 6: Коммит**

```bash
composer openapi && git add . && git commit -m "feat(calendar): ical feed by account token and token rotation"
```

**Критерии готовности:**
- Лента отдаётся без сессии по токену, содержит только `scheduled`-события с назначениями человека, подписи слотов — в описании (раздел 7.4).
- Перевыпуск токена сразу ломает старую ссылку; отключённый аккаунт ленты не имеет.
- Ссылка доступна клиенту из `GET /auth/me`, отдельного запроса не нужно.

---
## Блок 4. Клиент

### Задача 15: Календарь, карточка события, личный календарь, главная

**Файлы:**
- Создать: `apps/web/app/pages/calendar.vue`, `app/pages/events/[id].vue`; `app/components/calendar/EventList.vue`, `EventCard.vue`, `SlotList.vue`, `UpcomingEvents.vue`; `app/composables/useEvents.ts`
- Изменить: `app/components/AppNav.vue` (пункт «Календарь»), `app/pages/index.vue` (блок ближайших событий)
- Тест: `tests/component/calendar.spec.ts`, `tests/unit/useEvents.spec.ts`

**Интерфейсы:**
- Отдаёт наружу: `useEvents()` → `{ load(range: {from: string, to: string}, scope: string): Promise<EventItem[]>, groupByChurchDay(events: EventItem[]): Array<{ day: string, events: EventItem[] }> }` — группировка по дню в поясе церкви через `useChurchDate().todayInChurch`-подобный форматтер даты.
- Отдаёт наружу: страница `/calendar` с переключателем недели, «Все / Мои» и списком по дням; `/events/{id}` — карточка со слотами, назначениями, `filled/required`, статусом отмены, вложениями, кнопками управления по `can_manage` и `can_fill`.
- Потребляет: `GET /events`, `GET /events/{id}`.

- [ ] **Шаг 1: Написать падающие тесты**

`tests/unit/useEvents.spec.ts`:

```ts
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { groupByChurchDay } from '~/app/composables/useEvents'

describe('groupByChurchDay', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('groups by the church day, not the utc day', () => {
    const groups = groupByChurchDay([
      { id: 'a', title: 'Поздний', starts_at: '2026-11-08T20:30:00Z', ends_at: '2026-11-08T21:30:00Z' },
      { id: 'b', title: 'Ранний', starts_at: '2026-11-08T01:00:00Z', ends_at: '2026-11-08T02:00:00Z' },
    ] as never, 'Asia/Vladivostok')

    expect(groups.map(g => g.day)).toEqual(['2026-11-08', '2026-11-09'])
    expect(groups[0]!.events[0]!.id).toBe('b')
  })
})
```

`tests/component/calendar.spec.ts`:

```ts
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CalendarPage from '~/app/pages/calendar.vue'
import EventPage from '~/app/pages/events/[id].vue'

const get = vi.fn()

mockNuxtImport('useApi', () => () => ({ get }))
mockNuxtImport('useRoute', () => () => ({ params: { id: 'e1' }, query: {} }))

const event = (over = {}) => ({
  id: 'e1', owner_type: 'church', ministry: null, title: 'Воскресное служение', location: 'Зал',
  starts_at: '2026-11-08T07:00:00Z', ends_at: '2026-11-08T09:00:00Z', visibility: 'church', status: 'scheduled',
  cancelled_at: null, cancel_reason: null, can_manage: false, attachments: [],
  slots: [{ id: 's1', label: 'Вокалист', role: { id: 'r1', name: 'Вокалист', ministry_id: 'm1' }, required_count: 2, filled_count: 3, can_fill: false, assignments: [] }],
  ...over,
})

beforeEach(() => get.mockReset())

describe('calendar page', () => {
  it('requests four weeks by default and switches to my events', async () => {
    get.mockResolvedValue({ data: [event()], meta: { current_page: 1, last_page: 1, total: 1 } })

    const page = await mountSuspended(CalendarPage)
    expect(get).toHaveBeenCalledWith('/events', expect.objectContaining({ scope: 'church' }))

    await page.find('[data-test="scope-mine"]').trigger('click')
    expect(get).toHaveBeenLastCalledWith('/events', expect.objectContaining({ scope: 'mine' }))
  })

  it('marks cancelled events', async () => {
    get.mockResolvedValue({ data: [event({ status: 'cancelled', cancel_reason: 'Погода' })], meta: { current_page: 1, last_page: 1, total: 1 } })

    const page = await mountSuspended(CalendarPage)

    expect(page.find('[data-test="cancelled-e1"]').text()).toContain('Отменено')
  })
})

describe('event page', () => {
  it('shows filled over required for each slot', async () => {
    get.mockResolvedValue({ data: event() })

    const page = await mountSuspended(EventPage)

    expect(page.find('[data-test="slot-s1-count"]').text()).toBe('3 из 2')
  })

  it('hides manage and fill actions without rights', async () => {
    get.mockResolvedValue({ data: event() })

    const page = await mountSuspended(EventPage)

    expect(page.find('[data-test="edit-event"]').exists()).toBe(false)
    expect(page.find('[data-test="assign-s1"]').exists()).toBe(false)
  })

  it('shows the fill action when the slot allows it', async () => {
    get.mockResolvedValue({ data: event({ slots: [{ ...event().slots[0], can_fill: true }] }) })

    const page = await mountSuspended(EventPage)

    expect(page.find('[data-test="assign-s1"]').exists()).toBe(true)
  })

  it('shows the cancellation reason', async () => {
    get.mockResolvedValue({ data: event({ status: 'cancelled', cancel_reason: 'Ремонт' }) })

    const page = await mountSuspended(EventPage)

    expect(page.text()).toContain('Ремонт')
  })
})
```

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `npm run test`
Ожидается: FAIL.

- [ ] **Шаг 3: Реализовать**

`groupByChurchDay(events, timeZone)` использует `Intl.DateTimeFormat('sv-SE', { timeZone, ... })` для ключа дня. Страница календаря: диапазон «текущая неделя + 3» по умолчанию, стрелки на неделю назад/вперёд (в пределах 93 дней — один запрос), переключатель `church|mine`, ссылка на служение в строке события. Карточка: заголовок, время (`useChurchDate().formatDateTime`), место, служение, описание, вложения (`AttachmentList` фазы 2), слоты с назначенными (фото + ФИО), счётчик `filled_count из required_count` с подсветкой при переполнении, кнопки «Изменить», «Отменить» по `can_manage` (задача 16), «Назначить» по `can_fill` (задача 17). `UpcomingEvents` на главной: `scope=mine`, 14 дней, до пяти карточек.

- [ ] **Шаг 4: Запустить тесты, убедиться что проходят**

Выполнить: `npm run test && npm run typecheck && npm run lint`
Ожидается: PASS.

- [ ] **Шаг 5: Коммит**

```bash
git add apps/web && git commit -m "feat(web): calendar page, event card, personal scope and upcoming events"
```

**Критерии готовности:**
- День события определяется по календарю церкви — тест с Владивостоком ловит группировку по UTC.
- Слот показывает «3 из 2», не пряча переполнение (раздел 5.4).
- Действия видны только по флагам `can_manage` и `can_fill` из ответа, а не по локальным проверкам прав.

---

### Задача 16: Редактор события и слотов, отмена

**Файлы:**
- Создать: `apps/web/app/components/calendar/EventEditor.vue`, `SlotEditor.vue`, `CancelEventDialog.vue`; `app/pages/events/new.vue`
- Изменить: `app/pages/events/[id].vue` (кнопки «Изменить», «Отменить»), `app/pages/calendar.vue` (кнопка «Создать событие» при наличии хоть одного права управления), `app/pages/ministries/[id]/events.vue` (создаётся в задаче 18, кнопка там же)
- Тест: `tests/component/event-editor.spec.ts`

**Интерфейсы:**
- Отдаёт наружу: `EventEditor` с props `event?: EventItem`, `defaultOwner?: { type: 'church' | 'ministry', ministryId?: string }`; выбор владельца ограничен правами: «Церковь» при `can('calendar.church.manage')`, служения, где `canIn(id, 'events.manage')`; событие `saved`.
- Отдаёт наружу: `SlotEditor` — список слотов с ролью из `GET /ministries/{id}/roles` любого служения, подписью и количеством; `CancelEventDialog` — причина и подтверждение.
- Потребляет: `POST /events`, `PATCH /events/{id}`, `POST /events/{id}/cancel`, `POST /events/{id}/slots`, `PATCH /slots/{id}`, `DELETE /slots/{id}`, `GET /ministries`, `GET /ministries/{id}/roles`.

- [ ] **Шаг 1: Написать падающие тесты**

```ts
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CancelEventDialog from '~/app/components/calendar/CancelEventDialog.vue'
import EventEditor from '~/app/components/calendar/EventEditor.vue'
import { permissionChecker } from '~/app/composables/useCan'

const get = vi.fn()
const post = vi.fn()
const patch = vi.fn()
const permissions = { administrator: false, global: [] as string[], ministries: {} as Record<string, string[]> }

mockNuxtImport('useApi', () => () => ({ get, post, patch }))
mockNuxtImport('useCan', () => () => permissionChecker(permissions))

beforeEach(() => {
  [get, post, patch].forEach(fn => fn.mockReset())
  permissions.global = []
  permissions.ministries = {}
  get.mockImplementation((url: string) => {
    if (url === '/ministries') return Promise.resolve({ data: [{ id: 'm1', name: 'Прославление' }, { id: 'm2', name: 'Молодёжное' }] })
    if (url.endsWith('/roles')) return Promise.resolve({ data: [{ id: 'r1', name: 'Вокалист' }] })
    return Promise.resolve({ data: [] })
  })
})

describe('event editor', () => {
  it('offers only owners the person may manage', async () => {
    permissions.ministries = { m1: ['events.manage'] }

    const editor = await mountSuspended(EventEditor)
    const options = editor.findAll('[data-test="owner-option"]').map(o => o.text())

    expect(options).toEqual(['Прославление'])
  })

  it('offers the church owner with calendar.church.manage and hides ministry visibility for it', async () => {
    permissions.global = ['calendar.church.manage']

    const editor = await mountSuspended(EventEditor)
    await editor.find('[data-test="owner-church"]').trigger('click')

    expect(editor.find('[data-test="visibility-ministry"]').exists()).toBe(false)
    expect(editor.find('[data-test="notify"]').text()).toContain('всех')
  })

  it('requires a label for a free slot before sending', async () => {
    permissions.global = ['calendar.church.manage']

    const editor = await mountSuspended(EventEditor)
    await editor.find('[data-test="owner-church"]').trigger('click')
    await editor.find('[data-test="title"]').setValue('Собрание')
    await editor.find('[data-test="add-slot"]').trigger('click')
    await editor.find('form').trigger('submit')

    expect(post).not.toHaveBeenCalled()
    expect(editor.text()).toContain('Свободному слоту нужна подпись')
  })

  it('sends slots with roles and the notify flag', async () => {
    permissions.ministries = { m1: ['events.manage'] }
    post.mockResolvedValue({ data: { id: 'e1' } })

    const editor = await mountSuspended(EventEditor, { props: { defaultOwner: { type: 'ministry', ministryId: 'm1' } } })
    await editor.find('[data-test="title"]').setValue('Репетиция')
    await editor.find('[data-test="starts-at"]').setValue('2026-11-07T18:00')
    await editor.find('[data-test="ends-at"]').setValue('2026-11-07T20:00')
    await editor.find('[data-test="add-slot"]').trigger('click')
    await editor.find('[data-test="slot-0-role"]').setValue('r1')
    await editor.find('[data-test="slot-0-count"]').setValue('2')
    await editor.find('[data-test="notify"]').setValue(true)
    await editor.find('form').trigger('submit')
    await new Promise(resolve => setTimeout(resolve))

    expect(post).toHaveBeenCalledWith('/events', expect.objectContaining({
      owner_type: 'ministry', ministry_id: 'm1', notify: 'ministry',
      slots: [{ role_id: 'r1', label: null, required_count: 2 }],
    }))
  })

  it('shows the domain error text from the server', async () => {
    permissions.global = ['calendar.church.manage']
    post.mockRejectedValue(Object.assign(new Error('failed'), { statusCode: 422, data: { code: 'slot.role_archived_ministry', message: 'Служение этой роли архивировано.' } }))

    const editor = await mountSuspended(EventEditor)
    await editor.find('[data-test="owner-church"]').trigger('click')
    await editor.find('[data-test="title"]').setValue('Собрание')
    await editor.find('form').trigger('submit')
    await new Promise(resolve => setTimeout(resolve))

    expect(editor.text()).toContain('Служение этой роли архивировано')
  })
})

describe('cancel dialog', () => {
  it('sends the reason only after confirmation', async () => {
    post.mockResolvedValue({ data: { id: 'e1', status: 'cancelled' } })

    const dialog = await mountSuspended(CancelEventDialog, { props: { eventId: 'e1' } })
    await dialog.find('[data-test="reason"]').setValue('Погода')
    expect(post).not.toHaveBeenCalled()

    await dialog.find('[data-test="confirm-cancel"]').trigger('click')
    expect(post).toHaveBeenCalledWith('/events/e1/cancel', { reason: 'Погода' })
  })
})
```

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `npm run test tests/component/event-editor.spec.ts`
Ожидается: FAIL.

- [ ] **Шаг 3: Реализовать**

Редактор: владелец → видимость (без `ministry` для церкви) → название, описание, место → начало и конец (`datetime-local`, интерпретируются как время церкви и переводятся в ISO UTC через `useChurchDate().toUtcIso(local)` — добавить этот метод в composable) → слоты (`SlotEditor`: служение → роль или «свободный слот» с подписью, количество) → вложения (`MediaUploader multiple`, `purpose = event`) → «уведомить участников служения» или «уведомить всех» (только при создании, по умолчанию выключено). Правка события отправляет только изменённые поля; слоты правятся отдельными запросами со своей строки в карточке. Отмена — диалог с причиной.

- [ ] **Шаг 4: Запустить тесты, убедиться что проходят**

Выполнить: `npm run test && npm run typecheck && npm run lint`
Ожидается: PASS.

- [ ] **Шаг 5: Коммит**

```bash
git add apps/web && git commit -m "feat(web): event editor with slots, notify flag and cancellation dialog"
```

**Критерии готовности:**
- Владелец события выбирается только среди тех, кем человек управляет; церковное событие не предлагает видимость «служение».
- Время вводится по церкви и уходит в UTC (риск 6).
- Свободный слот без подписи не уезжает на сервер; доменные ошибки сервера показываются текстом.
- Галочка уведомления выключена по умолчанию (раздел 7.7).

---

### Задача 17: Назначения — диалог кандидатов, пересечения, предупреждения

**Файлы:**
- Создать: `apps/web/app/components/calendar/AssignDialog.vue`, `WarningList.vue`
- Изменить: `app/pages/events/[id].vue`, `SlotList.vue` (кнопка «Назначить», снятие назначения)
- Тест: `tests/component/assign-dialog.spec.ts`

**Интерфейсы:**
- Отдаёт наружу: `AssignDialog` с props `slot: SlotItem`; событие `assigned(assignment, warnings)`.
- Отдаёт наружу: `WarningList` — тексты по кодам `role_mismatch` («У человека нет роли «{label}»»), `time_conflict` («Пересекается с: {названия}»), `over_capacity` («Слот заполнен сверх нормы»).
- Потребляет: `GET /slots/{id}/candidates`, `POST /slots/{id}/assignments`, `DELETE /assignments/{id}`.

- [ ] **Шаг 1: Написать падающие тесты**

```ts
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AssignDialog from '~/app/components/calendar/AssignDialog.vue'

const get = vi.fn()
const post = vi.fn()

mockNuxtImport('useApi', () => () => ({ get, post }))

const roleSlot = { id: 's1', label: 'Вокалист', role: { id: 'r1', name: 'Вокалист', ministry_id: 'm1' }, required_count: 2, filled_count: 0, can_fill: true, assignments: [] }
const freeSlot = { ...roleSlot, id: 's2', label: 'Встречающий', role: null }

beforeEach(() => {
  get.mockReset()
  post.mockReset()
})

describe('assign dialog', () => {
  it('lists candidates immediately for a role slot and marks conflicts', async () => {
    get.mockResolvedValue({ data: [
      { person: { id: 'p1', full_name: 'Свободная Анна' }, has_role: true, conflicts: [] },
      { person: { id: 'p2', full_name: 'Занятая Мария' }, has_role: true, conflicts: [{ event_id: 'e9', title: 'Репетиция', starts_at: '2026-11-08T08:00:00Z', ends_at: '2026-11-08T09:00:00Z' }] },
    ] })

    const dialog = await mountSuspended(AssignDialog, { props: { slot: roleSlot } })

    expect(get).toHaveBeenCalledWith('/slots/s1/candidates', expect.anything())
    expect(dialog.find('[data-test="candidate-p2"]').text()).toContain('Репетиция')
    expect(dialog.find('[data-test="candidate-p1"] [data-test="conflict"]').exists()).toBe(false)
  })

  it('searches people for a free slot with a debounce', async () => {
    vi.useFakeTimers()
    get.mockResolvedValue({ data: [] })

    const dialog = await mountSuspended(AssignDialog, { props: { slot: freeSlot } })
    expect(get).not.toHaveBeenCalled()

    await dialog.find('[data-test="search"]').setValue('про')
    vi.advanceTimersByTime(300)

    expect(get).toHaveBeenCalledWith('/slots/s2/candidates', expect.objectContaining({ search: 'про' }))
    vi.useRealTimers()
  })

  it('assigns and shows warnings without closing', async () => {
    get.mockResolvedValue({ data: [{ person: { id: 'p1', full_name: 'Анна' }, has_role: true, conflicts: [] }] })
    post.mockResolvedValue({
      data: { id: 'a1', person: { id: 'p1', full_name: 'Анна' } },
      warnings: [{ code: 'over_capacity', message: 'Слот заполнен сверх нормы.' }, { code: 'time_conflict', message: 'Пересечение', event_ids: ['e9'] }],
    })

    const dialog = await mountSuspended(AssignDialog, { props: { slot: roleSlot } })
    await dialog.find('[data-test="candidate-p1"]').trigger('click')
    await new Promise(resolve => setTimeout(resolve))

    expect(post).toHaveBeenCalledWith('/slots/s1/assignments', { person_id: 'p1' })
    expect(dialog.find('[data-test="warnings"]').text()).toContain('сверх нормы')
    expect(dialog.emitted('assigned')).toHaveLength(1)
  })

  it('shows a domain error for a duplicate', async () => {
    get.mockResolvedValue({ data: [{ person: { id: 'p1', full_name: 'Анна' }, has_role: true, conflicts: [] }] })
    post.mockRejectedValue(Object.assign(new Error('failed'), { statusCode: 422, data: { code: 'assignment.duplicate', message: 'Человек уже назначен в этот слот.' } }))

    const dialog = await mountSuspended(AssignDialog, { props: { slot: roleSlot } })
    await dialog.find('[data-test="candidate-p1"]').trigger('click')
    await new Promise(resolve => setTimeout(resolve))

    expect(dialog.text()).toContain('уже назначен')
  })
})
```

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `npm run test tests/component/assign-dialog.spec.ts`
Ожидается: FAIL.

- [ ] **Шаг 3: Реализовать**

Диалог: для слота с ролью список кандидатов загружается сразу, с фильтром по имени на клиенте; для свободного — поиск с задержкой 300 мс от двух символов. Кандидат с пересечением показывает названия и время пересекающихся событий. Клик назначает; ответные `warnings` показываются в диалоге, список слотов в карточке обновляется через событие `assigned`. Снятие назначения — с подтверждением, из строки назначенного.

- [ ] **Шаг 4: Запустить тесты, убедиться что проходят**

Выполнить: `npm run test && npm run typecheck`
Ожидается: PASS.

- [ ] **Шаг 5: Коммит**

```bash
git add apps/web && git commit -m "feat(web): assignment dialog with candidates, conflicts and warnings"
```

**Критерии готовности:**
- Лидер видит пересечения до выбора — прямо в списке кандидатов (раздел 7.4).
- Предупреждения после назначения показываются, но не мешают: назначение уже создано.
- Свободный слот ищет по справочнику, слот с ролью — по участникам с ролью.

---

### Задача 18: Шаблоны, вкладка «События» служения, iCal в настройках

**Файлы:**
- Создать: `apps/web/app/pages/templates/index.vue`, `templates/[id].vue`, `ministries/[id]/events.vue`, `settings/ical.vue`; `app/components/calendar/TemplateEditor.vue`, `RecurrenceEditor.vue`
- Изменить: `app/pages/ministries/[id]/index.vue` (вкладка), `app/components/AppNav.vue` (пункт «Шаблоны» в подменю календаря при праве управления), `app/pages/settings/index.vue` (ссылка «Календарь телефона»)
- Тест: `tests/unit/recurrence.spec.ts`, `tests/component/templates.spec.ts`

**Интерфейсы:**
- Отдаёт наружу: `recurrenceLabel(rule)` в `app/utils/recurrence.ts` — «Каждое воскресенье», «Раз в две недели по субботам», «Второй вторник месяца», «Последняя пятница месяца», «Без повторения».
- Отдаёт наружу: `RecurrenceEditor` с `v-model` формы `{type, weekday, nth, anchor_date} | null`.
- Потребляет: все эндпоинты `Templates`, `GET /events?scope=ministry:{id}`, `GET /auth/me` (`ical_url`), `POST /me/ical-token/rotate`.

- [ ] **Шаг 1: Написать падающие тесты**

`tests/unit/recurrence.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { recurrenceLabel } from '~/app/utils/recurrence'

describe('recurrenceLabel', () => {
  it('describes the rules in russian', () => {
    expect(recurrenceLabel(null)).toBe('Без повторения')
    expect(recurrenceLabel({ type: 'weekly', weekday: 7 })).toBe('Каждое воскресенье')
    expect(recurrenceLabel({ type: 'biweekly', weekday: 6, anchor_date: '2026-11-07' })).toBe('Раз в две недели по субботам')
    expect(recurrenceLabel({ type: 'monthly_nth_weekday', weekday: 2, nth: 2 })).toBe('Второй вторник месяца')
    expect(recurrenceLabel({ type: 'monthly_nth_weekday', weekday: 5, nth: -1 })).toBe('Последняя пятница месяца')
  })
})
```

`tests/component/templates.spec.ts`:

```ts
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RecurrenceEditor from '~/app/components/calendar/RecurrenceEditor.vue'
import TemplateEditor from '~/app/components/calendar/TemplateEditor.vue'
import IcalPage from '~/app/pages/settings/ical.vue'
import TemplatePage from '~/app/pages/templates/[id].vue'
import MinistryEvents from '~/app/pages/ministries/[id]/events.vue'
import { permissionChecker } from '~/app/composables/useCan'

const get = vi.fn()
const post = vi.fn()
const permissions = { administrator: false, global: ['calendar.church.manage'], ministries: {} as Record<string, string[]> }

mockNuxtImport('useApi', () => () => ({ get, post }))
mockNuxtImport('useCan', () => () => permissionChecker(permissions))
mockNuxtImport('useRoute', () => () => ({ params: { id: 't1' } }))
mockNuxtImport('useAuthStore', () => () => ({ user: { id: 'u1', ical_url: 'https://church.test/api/v1/calendar/feed/tok.ics' } }))

beforeEach(() => {
  get.mockReset()
  post.mockReset()
})

describe('recurrence editor', () => {
  it('emits null for no recurrence and a full rule for biweekly', async () => {
    const editor = await mountSuspended(RecurrenceEditor, { props: { modelValue: null } })
    await editor.find('[data-test="type"]').setValue('biweekly')
    await editor.find('[data-test="weekday"]').setValue('6')
    await editor.find('[data-test="anchor"]').setValue('2026-11-07')

    const emitted = editor.emitted('update:modelValue')!
    expect(emitted.at(-1)![0]).toEqual({ type: 'biweekly', weekday: 6, anchor_date: '2026-11-07' })

    await editor.find('[data-test="type"]').setValue('none')
    expect(editor.emitted('update:modelValue')!.at(-1)![0]).toBeNull()
  })

  it('offers «последний» for the monthly rule', async () => {
    const editor = await mountSuspended(RecurrenceEditor, { props: { modelValue: { type: 'monthly_nth_weekday', weekday: 5, nth: -1 } } })
    expect(editor.find('[data-test="nth"] option[value="-1"]').text()).toBe('Последний')
  })
})

describe('template editor', () => {
  it('sends start_time, duration and recurrence', async () => {
    get.mockResolvedValue({ data: [] })
    post.mockResolvedValue({ data: { id: 't1' } })

    const editor = await mountSuspended(TemplateEditor, { props: { defaultOwner: { type: 'church' } } })
    await editor.find('[data-test="title"]').setValue('Воскресное служение')
    await editor.find('[data-test="start-time"]').setValue('10:00')
    await editor.find('[data-test="duration"]').setValue('120')
    await editor.find('[data-test="recurrence-type"]').setValue('weekly')
    await editor.find('[data-test="recurrence-weekday"]').setValue('7')
    await editor.find('form').trigger('submit')
    await new Promise(resolve => setTimeout(resolve))

    expect(post).toHaveBeenCalledWith('/templates', expect.objectContaining({
      start_time: '10:00', duration_minutes: 120, recurrence: { type: 'weekly', weekday: 7 },
    }))
  })
})

describe('template page', () => {
  it('creates an event on a chosen date', async () => {
    get.mockResolvedValue({ data: { id: 't1', title: 'Т', recurrence: null, active: true, archived: false, can_manage: true, slots: [], owner_type: 'church', ministry: null, start_time: '10:00', duration_minutes: 120, visibility: 'church', generated_until: null } })
    post.mockResolvedValue({ data: { id: 'e1' } })

    const page = await mountSuspended(TemplatePage)
    await page.find('[data-test="event-date"]').setValue('2026-12-24')
    await page.find('[data-test="create-event"]').trigger('click')
    await new Promise(resolve => setTimeout(resolve))

    expect(post).toHaveBeenCalledWith('/templates/t1/create-event', { date: '2026-12-24' })
  })
})

describe('ministry events tab', () => {
  it('asks for events of this ministry and shows the create button with events.manage', async () => {
    permissions.ministries = { t1: ['events.manage'] }
    get.mockResolvedValue({ data: [], meta: { current_page: 1, last_page: 1, total: 0 } })

    const tab = await mountSuspended(MinistryEvents)

    expect(get).toHaveBeenCalledWith('/events', expect.objectContaining({ scope: 'ministry:t1' }))
    expect(tab.find('[data-test="create-event"]').exists()).toBe(true)
  })
})

describe('ical settings', () => {
  it('shows the feed url and rotates after confirmation', async () => {
    post.mockResolvedValue({ data: { ical_url: 'https://church.test/api/v1/calendar/feed/new.ics' } })

    const page = await mountSuspended(IcalPage)
    expect(page.find('[data-test="ical-url"]').text()).toContain('/feed/tok.ics')

    await page.find('[data-test="rotate"]').trigger('click')
    expect(post).not.toHaveBeenCalled()
    await page.find('[data-test="confirm-rotate"]').trigger('click')
    await new Promise(resolve => setTimeout(resolve))

    expect(post).toHaveBeenCalledWith('/me/ical-token/rotate')
    expect(page.find('[data-test="ical-url"]').text()).toContain('/feed/new.ics')
  })
})
```

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `npm run test`
Ожидается: FAIL.

- [ ] **Шаг 3: Реализовать**

Шаблоны: список с подписью правила (`recurrenceLabel`), пометками «неактивен» и «архив», фильтр по владельцу; карточка с слотами, «создать событие на дату», переключателем активности, архивацией; редактор с `RecurrenceEditor` (тип → день недели → для `biweekly` опорная дата, для `monthly_nth_weekday` порядковый номер с вариантом «Последний»). Вкладка «События» служения — список `EventList` со `scope=ministry:{id}` и кнопкой создания по `canIn(id, 'events.manage')`. Настройки → «Календарь телефона»: ссылка, кнопка копирования, подсказка «добавьте подпиской в календарь», перевыпуск с подтверждением.

- [ ] **Шаг 4: Запустить тесты, убедиться что проходят**

Выполнить: `npm run test && npm run typecheck && npm run lint`
Ожидается: PASS.

- [ ] **Шаг 5: Коммит**

```bash
git add apps/web && git commit -m "feat(web): templates with recurrence editor, ministry events tab, ical settings"
```

**Критерии готовности:**
- Правило повторения редактируется без знания JSON и читается по-русски.
- Событие из шаблона создаётся на выбранную дату одним нажатием.
- Лента iCal видна и перевыпускается только с подтверждением: старая ссылка перестаёт работать.

---

## Блок 5. Приёмка

### Задача 19: Сквозной сценарий и расписание в проде

**Файлы:**
- Создать: `apps/web/e2e/calendar.spec.ts`
- Изменить: `apps/web/e2e/fixtures.ts` (`runArtisan(command)` — выполняет `php artisan` в `apps/api` через `child_process.execFileSync`), `docs/deploy.md` (проверка `schedule:list`, ручной первый запуск `calendar:materialize`)
- Тест: сам сценарий

- [ ] **Шаг 1: Написать сценарий**

```ts
import { expect, test } from '@playwright/test'
import { createInvitedAccount, login, runArtisan } from './fixtures'

test('a template fills eight weeks, a leader fills a slot from a phone, the assignee is notified', async ({ page, browser }) => {
  test.setTimeout(120_000)
  await login(page, 'admin@example.com', 'secret123')

  await page.goto('/ministries')
  await page.getByRole('button', { name: 'Создать служение' }).click()
  await page.getByLabel('Название').fill('Прославление')
  await page.getByRole('button', { name: 'Сохранить' }).click()
  await page.getByRole('tab', { name: 'Роли' }).click()
  await page.getByRole('button', { name: 'Создать роль' }).click()
  await page.getByLabel('Название').fill('Вокалист')
  await page.getByRole('button', { name: 'Сохранить' }).click()

  const leader = await createInvitedAccount(page, browser, { lastName: 'Сидоров', firstName: 'Сергей' })
  const singer = await createInvitedAccount(page, browser, { lastName: 'Петрова', firstName: 'Анна' })

  await page.getByRole('tab', { name: 'Участники' }).click()
  for (const [name, role] of [['Сидоров', 'Лидер'], ['Петрова', 'Вокалист']] as const) {
    await page.getByRole('button', { name: 'Добавить участника' }).click()
    await page.getByPlaceholder('Поиск по справочнику').fill(name)
    await page.getByText(name).first().click()
    await page.getByLabel(role).check()
    await page.getByRole('button', { name: 'Добавить' }).click()
  }

  await page.goto('/templates')
  await page.getByRole('button', { name: 'Создать шаблон' }).click()
  await page.getByTestId('owner-church').click()
  await page.getByLabel('Название').fill('Воскресное служение')
  await page.getByLabel('Начало').fill('10:00')
  await page.getByLabel('Длительность').fill('120')
  await page.getByTestId('recurrence-type').selectOption('weekly')
  await page.getByTestId('recurrence-weekday').selectOption('7')
  await page.getByTestId('add-slot').click()
  await page.getByTestId('slot-0-ministry').selectOption({ label: 'Прославление' })
  await page.getByTestId('slot-0-role').selectOption({ label: 'Вокалист' })
  await page.getByTestId('slot-0-count').fill('2')
  await page.getByRole('button', { name: 'Сохранить' }).click()

  runArtisan('calendar:materialize')

  await page.goto('/calendar')
  await expect(page.getByText('Воскресное служение')).toHaveCount(4) // четыре недели на экране
  await page.getByTestId('next-range').click()
  await expect(page.getByText('Воскресное служение')).toHaveCount(4)

  await leader.setViewportSize({ width: 390, height: 844 })
  await leader.goto('/calendar')
  await leader.getByText('Воскресное служение').first().click()
  await leader.getByTestId(/^assign-/).first().click()
  await leader.getByText('Петрова Анна').click()
  await expect(leader.getByText('1 из 2')).toBeVisible()

  await singer.goto('/notifications')
  await expect(singer.getByText('Вас назначили')).toBeVisible({ timeout: 10_000 })
  await singer.getByText('Вас назначили').click()
  await expect(singer).toHaveURL(/\/events\//)
})
```

- [ ] **Шаг 2: Запустить сценарий**

Выполнить: `npm run e2e`
Ожидается: PASS.

- [ ] **Шаг 3: Расписание в проде**

`docs/deploy.md`: после деплоя фазы 3 выполнить в контейнере `app` `php artisan schedule:list` и убедиться, что `calendar:materialize` и `calendar:send-reminders` в списке; первый запуск `calendar:materialize` вручную, чтобы события появились сразу, не дожидаясь 03:00. Настройка часового пояса церкви должна быть выставлена до этого запуска (риск 6).

- [ ] **Шаг 4: Проверить напоминание на устройстве**

Создать событие с началом через 2 часа 3 минуты, назначить себя, дождаться ближайшего запуска команды.
Ожидается: пуш «Напоминание: за два часа» пришёл на телефон.

- [ ] **Шаг 5: Коммит**

```bash
git add apps/web docs/deploy.md && git commit -m "test(web): end-to-end template, slot filling and assignment notification scenario"
```

**Критерии готовности:**
- Сценарий из раздела 13 проходит в CI: шаблон → события на восемь недель → слот заполнен с телефонного вьюпорта → назначенный получил уведомление.
- Обе команды стоят в расписании продового `scheduler`; напоминание реально пришло на устройство.

---

## Фаза 3 готова, когда

Проверка по критерию из раздела 13 архитектуры, одним прогоном на продовом сервере:

1. Администратор создаёт шаблон воскресного служения со слотами; после `calendar:materialize` в календаре восемь воскресений с копиями слотов.
2. Лидер служения с телефона открывает ближайшее воскресенье, видит кандидатов с пометками пересечений и заполняет слоты; слот показывает «N из M».
3. Назначенный получает уведомление в центре и пушем; за сутки и за два часа до начала приходят напоминания.
4. Изменение времени события уведомляет всех назначенных; отмена оставляет событие в календаре с пометкой и попадает в журнал.
5. Событие с видимостью «только назначенные» видят назначенные, управляющие и носители `slots.assign` нужных служений; остальным его нет.
6. Роль, стоящая в слоте будущего события, не удаляется, редактор показывает, где она используется.
7. Лента iCal в календаре телефона показывает события человека в поясе церкви.

Не входит в фазу 3 и намеренно отсутствует: чат события и кнопка `POST /events/{id}/chat` (фаза 4), согласие и отказ по назначениям, недоступность людей, помещения и техника (после v1).

---

## Изменения в архитектуре, внесённые этим планом

- Раздел 5.4: колонка `events.chat_id` не создаётся; связь хранится в `chats.event_id` (решение 2). `events.created_by_user_id`, `event_templates.created_by_user_id`, `event_assignments.assigned_by_user_id` допускают `null` после стирания аккаунта (решение 15).
- Раздел 7.4: напоминание публикует доменное событие `EventReminderDue`, которое слушает Notifications (решение 7).
- Раздел 8: `POST /events/{id}/chat` переносится в строку модуля Chat (фаза 4).
