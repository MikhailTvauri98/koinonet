# Фаза 8. Эволюция ключевых экранов

> **Для исполнителей-агентов:** обязательный навык — `superpowers:subagent-driven-development` (рекомендуется) или `superpowers:executing-plans`, задача за задачей. Шаги отмечаются чекбоксами `- [ ]`.

**Цель:** закрыть пять проблем аудита — пустая главная, календарь прячет события, перегруженная карточка события, чат не похож на мессенджер, безликое служение — и ввести общие правила кнопок, дат, имён, цветов служений и состояния связи.

**Архитектура:** существующие Laravel-модули и Nuxt SPA. Сервер получает три небольших расширения: цвет и число участников служения, короткое имя в ответах, `.ics` одного события. Клиент сначала получает общие примитивы (токены цветов, уровни кнопок, аватар, форматтеры дат, индикатор связи), затем экраны переводятся вертикальными срезами.

**Стек:** зависимости из `apps/api/composer.json` и `apps/web/package.json`; Pest, PHPStan, Pint, Scramble; Vitest + Vue Test Utils, Playwright (визуальные фикстуры и real-API E2E), ESLint, Nuxt typecheck.

**Спецификация:** [docs/design/phase-8/spec.md](../design/phase-8/spec.md), утверждена 17.11.2026. Основание — [аудит](../design/phase-8/audit.html). Перед задачей читать спецификацию, затронутые разделы `docs/architecture.md` (5.3, 6, 7.4, 7.6, 8, 10), `CONTEXT.md` и ограничения фазы 7 ([spec](../design/phase-7/spec.md)).

**Статус:** план составлен 17.11.2026, исполнение не начато.

## Общие ограничения

- Минимумы фазы 7: основной текст 16 px, вторичный 14 px, области нажатия от 44 px, текст 200% без уменьшения обратно, обе темы, ширины 320–1920, короткое окно 375×390, клавиатура и фокус. Размеры в макетах аудита иллюстративны; где они меньше минимумов, побеждают минимумы.
- Без внешних шрифтов, CDN и новой UI-библиотеки. Только существующие Nuxt/Vue/Pinia и локальный CSS на токенах `--ui-*`.
- Права — ключи каталога и серверные `can_manage`/`can_fill`. Имя роли не участвует в условиях. Права и видимость не меняются.
- Время в UTC, показ в часовом поясе церкви. ULID. Архивация через `archived_at`. В таблицы модуля пишут только его Actions.
- Цвет никогда не единственный признак: рядом всегда текст (название служения, «Отменено», «Вы»).
- Ничто не доступно только по наведению или долгому нажатию: клавиатура и экранный диктор достигают каждого действия.
- Без градиентов, теней-«подушек», декоративных анимаций, эмодзи как значков.
- Клиент не дорисовывает скрытые API данные: `short_name` и `full_name` скрываются вместе.
- Тексты и понятия — `CONTEXT.md` («Полное имя», «Короткое имя», «Цвет служения» уже добавлены).
- Изменения API — в `apps/api/openapi.json` (`composer openapi`) и `apps/web/types/api.d.ts` (`npm run gen:api`); модели и контрактов — в `docs/architecture.md`.
- Ветки `phase-8/task-N-slug` от интеграционной ветки `phase-8`; принятые задачи вливаются в `phase-8` последовательно. В `main` (автовыкладка) — одна PR после задачи 18, squash.
- Пути клиента ниже — от `apps/web/`, сервера — от `apps/api/`, документов — от корня.

## Общий цикл проверки задачи

1. RED: записать падающий тест нового поведения, запустить, сохранить причину падения.
2. Минимальная реализация, GREEN, рефакторинг с повторным запуском профильных тестов.
3. Сервер (только в Docker): `docker compose -f infra/compose.yml exec -T app composer lint`, `composer types`, `composer test`; при изменении контракта `composer openapi`, затем в `apps/web` `npm run gen:api`.
4. Клиент из `apps/web`: `npm test`, `npm run lint`, `npm run typecheck`; при изменении CSS или клиента `npm run generate`, `npm run verify-sw`; профильный визуальный набор `npm run test:visual -- tests/visual/<файл>.pw.ts` (на Windows `$env:E2E_BROWSER_CHANNEL = 'msedge'`).
5. Просмотреть снимки затронутых экранов в обеих темах на 390 и 1440 px и 320 px с текстом 200%. Снимки не обновлять автоматически без просмотра отличий.
6. Саморевью дифа по `CLAUDE.md`: границы модулей, ключи прав, словарь, документы. Отметить чекбоксы после фактических проверок, коммит задачи.

## Особое внимание при ревью

1. Пояс устройства отличается от пояса церкви, событие около полуночи, переход года: «Сегодня/Вчера», заголовки дней, лента недели и разделители чата считают день по церкви — задачи 5, 9, 12.
2. Имя скрыто правами (`full_name` и `short_name` равны `null`): аватар показывает нейтральные инициалы, группировка сообщений идёт по id отправителя, а не по имени — задачи 2, 4, 12.
3. Служение без цвета, архивное служение, событие церкви: нейтральный цвет, без ошибок и без пустых меток — задачи 1, 4, 8, 14.
4. 320 px с текстом 200%: три события в клетке месяца, лента недели, компактные строки чатов и событий не обрезают действия и не расползаются по горизонтали — задачи 8, 9, 13, 18.
5. Человек только с `can_fill`, отзыв права или смена сессии при открытом окне слота: действия по флагам, окно закрывается, поздний ответ не применяется — задача 11.

## Порядок и покрытие

| Этап | Задачи | Результат |
|---|---|---|
| Сервер | 1–3 | Цвет и число участников служения, короткое имя, `.ics` события |
| Общая основа клиента | 4–6 | Токены цветов, кнопки, аватар; форматтеры дат; индикатор связи |
| Главная и календарь | 7–9 | «Моя неделя», месяц с цветами и «Вы», мобильный список с лентой недели |
| Событие | 10–12 | Шапка и участие, строки слотов и окно слота, редактор |
| Общение | 13–14 | Сообщения по-мессенджерски, список чатов |
| Служение | 15–16 | Шапка на всех вкладках, цвет, обзор, участники |
| Остальное и приёмка | 17–18 | Объявления, люди, уведомления, навигация; полная приёмка и PR |

Сценарии приёмки спецификации: 1 → 7; 2, 3, 4 → 8, 9; 5 → 9; 6 → 11; 7 → 3, 10; 8 → 13; 9 → 6; 10 → 1, 15; 11 → 2; 12 → 15. Все повторно — задача 18.

---

## Задача 1. Цвет и число участников служения на сервере (2–3 часа)

**Цель:** управляющий выбирает цвет служения; ответы отдают цвет и число участников.
**Зависимости:** нет.
**Файлы:**
- Создать: `app/Modules/Ministries/MinistryColor.php`, `app/Modules/Ministries/Database/Migrations/2026_11_18_000100_add_color_to_ministries.php`.
- Изменить: `app/Modules/Ministries/Http/Requests/MinistryRequest.php`, `Actions/CreateMinistry.php`, `Actions/UpdateMinistry.php`, `Http/Controllers/MinistryController.php`, `Http/Resources/MinistryResource.php`, `Models/Ministry.php` (cast); вложенный `ministry` в `app/Modules/Calendar/Http/Resources/EventResource.php`, `EventTemplateResource.php`, `app/Modules/Announcements/Http/Resources/AnnouncementResource.php`; `openapi.json`; `apps/web/types/api.d.ts`; `docs/architecture.md` (5.3, 8).
- Тесты: `tests/Feature/Ministries/MinistryCrudTest.php`, `tests/Feature/Calendar/EventIndexTest.php`, `tests/Feature/Announcements/` (файл со списком объявлений).

**Интерфейсы:**
- Производит: `enum MinistryColor: string { Violet='violet'; Teal='teal'; Rose='rose'; Amber='amber'; Sky='sky'; Green='green' }`. `CreateMinistry::handle(string $name, MinistryColor $color, ?string $description = null): Ministry`. `UpdateMinistry::handle(Ministry, array{name?: string, description?: string|null, default_role_id?: string, color?: MinistryColor})`. `MinistryResource`: `color: 'violet'|…|null`, `members_count: int`. Вложенный `ministry`: `{id, name, color}`.

- [ ] RED: `it('requires a color when creating a ministry')` — `POST /ministries` без `color` → 422 с ошибкой `color`; с `color: 'teal'` → 201 и `data.color === 'teal'`.
- [ ] RED: `it('changes the color with ministry.edit and refuses to clear it')` — `PATCH {color:'rose'}` с правом → 200; без `ministry.edit` → 403; `{color:null}` → 422; неизвестный ключ → 422.
- [ ] RED: `it('returns null color for ministries created before the column')` — строка с `color = NULL` отдаёт `color: null`.
- [ ] RED: `it('counts members')` — служение с тремя участниками отдаёт `members_count === 3` в списке и карточке, то есть столько же строк, сколько возвращает `GET /ministries/{id}/members` для управляющего; запрос списка не делает N+1 (`withCount`).
- [ ] RED: `it('exposes the owner ministry color in events and announcements')` — `data[0].ministry.color` у события служения и объявления служения; у церковного `ministry === null`.
- [ ] Реализация: миграция `string('color', 16)->nullable()`; правило `Rule::enum(MinistryColor::class)` — `required` при создании, `sometimes` + `filled` при правке; право на `color` то же, что на название (существующая ветка `ministry.edit` в `update`); смена цвета в журнал не пишется.
- [ ] GREEN, `composer openapi`, `npm run gen:api`, раздел 5.3 и 8 архитектуры, общий цикл, коммит.

**Критерий готовности:** создание без цвета невозможно, правка не обнуляет; существующие служения отдают `null`; клиенту доступны `color` и `members_count`.

## Задача 2. Короткое имя в ответах (2–3 часа)

**Цель:** разговорные места получают «Имя Фамилия» с той же маскировкой, что полное имя.
**Зависимости:** нет.
**Файлы:**
- Изменить: `app/Modules/Directory/Models/Person.php`; ресурсы `Directory/Http/Resources/PersonResource.php`, `Ministries/Http/Resources/MemberResource.php`, `Calendar/Http/Resources/EventAssignmentResource.php`, `CandidateResource.php`, `Chat/Http/Resources/ChatMemberResource.php`, `MessageResource.php` (включая `reply_to.sender_name`), `Announcements/Http/Resources/AnnouncementResource.php`; `app/Modules/Chat/ChatTitle.php`; `app/Modules/Notifications/Notifications/ChatMessageNotification.php`; `openapi.json`; `apps/web/types/api.d.ts`; `docs/architecture.md` (7.6, 8).
- Тесты: `tests/Unit` или `tests/Feature/Directory` для `shortName`; `tests/Feature/Chat/MessageHistoryTest.php`, `DirectChatTest.php`, `tests/Feature/Calendar/AssignmentTest.php`, `tests/Feature/Ministries/MembershipTest.php`, `tests/Feature/Notifications` (уведомление о сообщении).

**Интерфейсы:**
- Производит: `Person::shortName(): string` — `trim("{$first_name} {$last_name}")`. Поле `short_name: string|null` рядом с каждым `full_name` перечисленных ресурсов; `null` тогда и только тогда, когда `full_name` равен `null`.

- [ ] RED: `it('builds the short name without patronymic')` — «Кузнецова Мария Игоревна» → «Мария Кузнецова»; без отчества — «Михаил Орлов».
- [ ] RED: `it('masks short_name together with full_name')` — для каждого перечисленного ресурса смотрящий без права видеть человека получает оба поля `null`; с правом — оба заполнены.
- [ ] RED: `it('uses the short name in reply previews and direct chat titles')` — `reply_to.sender_name === 'Мария Кузнецова'`; `GET /chats` для личного чата отдаёт `title` коротким именем собеседника.
- [ ] RED: `it('titles chat push notifications with the short name')` — заголовок пуша о сообщении содержит короткое имя; скрытое имя по-прежнему «Участник».
- [ ] Реализация; превью последнего сообщения в списке чатов не трогать (раздел 7.6).
- [ ] GREEN, `composer openapi`, `npm run gen:api`, архитектура, общий цикл, коммит.

**Критерий готовности:** везде, где есть `full_name`, рядом `short_name` с той же видимостью; личные чаты и пуши называются коротким именем.

## Задача 3. Файл `.ics` одного события (1–2 часа)

**Цель:** «В календарь» скачивает одно событие, лента по токену не меняется.
**Зависимости:** нет.
**Файлы:**
- Изменить: `app/Modules/Calendar/IcalFeedBuilder.php`, `Http/Controllers/EventController.php` (или новый `EventIcsController.php`), `routes.php`, `openapi.json`, `apps/web/types/api.d.ts`, `docs/architecture.md` (7.4, 8).
- Тесты: `tests/Feature/Calendar/EventIcsTest.php` (новый), `tests/Feature/Calendar/IcalFeedTest.php` (регрессия).

**Интерфейсы:**
- Производит: `GET /api/v1/events/{event}/ics` → `200 text/calendar; charset=UTF-8`, `Content-Disposition: attachment; filename="event-<id>.ics"`. `IcalFeedBuilder::forEvent(Event $event, Person $viewer): string`; общий приватный метод сборки `VEVENT` с флагом `includeDescription`.

- [ ] RED: `it('downloads a single event with description and own slots')` — один `VEVENT`, `DTSTART`/`DTEND` в UTC, `SUMMARY`, `LOCATION`, `DESCRIPTION` содержит описание и «Слоты: Учитель воскресной школы» для назначенного; чужих имён нет.
- [ ] RED: `it('refuses the file to someone who cannot view the event')` — тот же статус, что у `GET /events/{event}` для этого смотрящего.
- [ ] RED: `it('marks a cancelled event as cancelled')` — `STATUS:CANCELLED`.
- [ ] RED (регрессия): `IcalFeedTest` — описание события в ленту по токену не попадает.
- [ ] Реализация, GREEN, `composer openapi`, `npm run gen:api`, архитектура, общий цикл, коммит.

**Критерий готовности:** файл импортируется календарём телефона с верным временем; доступ — как у просмотра события.

## Задача 4. Токены цветов, уровни кнопок, аватар (2–3 часа)

**Цель:** общие примитивы, на которые опираются все экранные задачи.
**Зависимости:** 1, 2 (типы `color`, `short_name`).
**Файлы:**
- Создать: `app/components/ui/UiAvatar.vue`, `app/components/ui/MinistryMark.vue`, `app/utils/ministryColor.ts`, `tests/unit/ministry-color.spec.ts`, `tests/unit/assignments.spec.ts`, `tests/component/ui-avatar.spec.ts`.
- Изменить: `app/assets/css/tokens.css`, `app/assets/css/base.css`, `app/utils/assignments.ts`, `app/components/calendar/EventCard.vue`, `tests/visual/foundation.pw.ts`.

**Интерфейсы:**
- Производит: CSS-токены `--ui-ministry-violet|teal|rose|amber|sky|green|church` для обеих тем (значения тёмной темы из аудита: `#b9a4f5 #6fcfbf #f0a3b8 #e8c37a #8ccfe8 #9bd9b0`, церковь `#a8b2b5`; светлой: `#6a4fc4 #1f7a6d #a83a5e #94620a #1f6d8a #276344`, церковь `#6b778a`) и `--ui-ministry-tint` (доля подложки). Классы кнопок: базовый `button` и `.ui-button` — тональные без рамки; `.ui-button--primary` без изменений; новый `.ui-button--quiet`; `.ui-button--danger` только для окон подтверждения и меню.
- `type MinistryColorKey = 'violet' | 'teal' | 'rose' | 'amber' | 'sky' | 'green'`. `ministryColorVar(ministry: { color?: string | null } | null): string` → `var(--ui-ministry-<ключ>)`, для `null` и церкви — `var(--ui-ministry-church)`. `MINISTRY_COLORS: readonly { key: MinistryColorKey, label: string }[]` с подписями «Фиолетовый, Бирюзовый, Розовый, Янтарный, Голубой, Зелёный».
- В `app/utils/assignments.ts` (вынести из локального `computed` в `EventCard.vue`): `isAssigned(event: EventItem, personId: string | null | undefined): boolean`, `ownSlots(event: EventItem, personId: string | null | undefined): EventSlot[]`. `EventCard.vue` переходит на них.
- `UiAvatar { id: string, name: string | null, photoUrl?: string | null, size?: 'sm' | 'md' | 'lg' }` — инициалы из `name` (две первые буквы слов), при `name === null` — «?» и доступное имя «Участник»; цвет — детерминированный хэш `id` по шести токенам.
- `MinistryMark { ministry: { id: string, name: string, color?: string | null } | null }` — точка или метка цвета с названием («Церковь» для `null`).

- [x] RED: `ministry-color.spec.ts` — `ministryColorVar(null)` и `{color:null}` → церковный токен; `{color:'teal'}` → `var(--ui-ministry-teal)`; неизвестный ключ → церковный.
- [x] RED: `tests/unit/assignments.spec.ts` (новый) — `isAssigned` истинно, если человек есть в любом слоте; ложно при `personId` `null`, пустых слотах и скрытых назначениях; `ownSlots` возвращает только свои слоты.
- [x] RED: `ui-avatar.spec.ts` — одинаковый `id` даёт одинаковый цвет; «Мария Кузнецова» → «МК»; `name: null` → «?» и `aria-label="Участник"`; фото показывается вместо инициалов, ошибка загрузки фото возвращает инициалы.
- [x] RED (visual): `foundation.pw.ts` — контраст текста метки служения на подложке не ниже 4.5:1 для всех семи цветов в обеих темах; высота кнопок не меньше 44 px на всех трёх уровнях.
- [x] Реализация; заменить локальные стили кнопок обзора служения на общие классы (`pages/ministries/[id]/index.vue`).
- [x] GREEN, общий цикл, коммит.

**Критерий готовности:** три уровня кнопок различимы в обеих темах; аватар и метка служения готовы для экранов.

## Задача 5. Человеческие даты (2–3 часа)

**Цель:** одна группа форматтеров по таблице спецификации; общие места переходят на неё.
**Зависимости:** нет.
**Файлы:**
- Изменить: `app/composables/useChurchDate.ts`, `tests/unit/useChurchDate.spec.ts`; применить в `app/components/notifications/NotificationList.vue`, `app/components/announcements/AnnouncementCard.vue`, `app/pages/announcements/[id].vue`, `app/pages/admin/audit.vue`, `app/pages/settings/devices.vue`, `app/components/chat/MuteMenu.vue`. Экранные задачи применяют форматтеры на своих экранах.

**Интерфейсы:**
- Производит в `churchDateFormatter(timeZone, now)` и `useChurchDate()`:
  - `formatMoment(iso): string` — `09:20` / `вчера, 21:40` / `пт, 21:40` (до 6 дней назад) / `13 ноября` / `13 ноября 2025`;
  - `formatEventWhen(startIso, endIso): string` — `Вс, 22 ноября · 11:00–13:00`; разные дни — `4–6 декабря · пт 18:00 – вс 16:00`; разные месяцы — `30 ноября – 2 декабря · …`; год добавляется, если не текущий;
  - `formatDuration(startIso, endIso): string` — `2 ч`, `1 ч 30 мин`, `45 мин`;
  - `formatDayHeading(dateOnly): string` — `Сегодня · вторник`, `Завтра · среда, 18 ноября`, `Вчера · …`, иначе `Четверг, 19 ноября`;
  - `deviceZoneDiffers(iso): boolean` — смещение устройства в этот момент не равно смещению церкви.

- [ ] RED: `useChurchDate.spec.ts` — таблица случаев со `now = 2026-11-17T06:20:00Z`, `timeZone = 'Europe/Moscow'`: `formatMoment` для сегодня (`09:20`), вчера, 6 дней назад (`ср, 21:40`), 7 дней назад (`10 ноября`), прошлый год (`13 ноября 2025`); событие в один день (`2026-11-22T08:00Z`–`10:00Z` → `Вс, 22 ноября · 11:00–13:00`); через полночь по церкви (`2026-11-21T20:00Z`–`22:30Z` → `21–22 ноября · сб 23:00 – вс 01:30`); многодневное (`2026-12-04T15:00Z`–`2026-12-06T13:00Z` → `4–6 декабря · пт 18:00 – вс 16:00`); переход года (`31 декабря 2026 – 1 января 2027 · …`); длительности `2 ч`, `1 ч 30 мин`, `45 мин`; заголовки дней `Сегодня · вторник`, `Завтра · среда, 18 ноября`, `Четверг, 19 ноября`.
- [ ] RED: те же ожидания при поясе процесса `America/Los_Angeles` (`process.env.TZ` в тесте) — результат не меняется.
- [ ] Реализация на `Intl.DateTimeFormat('ru-RU', { timeZone })`; сокращения дней недели «пн…вс» строчными, в начале строки с заглавной.
- [ ] Перевести перечисленные общие места на `formatMoment`; `<time datetime>` сохраняет точные значения.
- [ ] GREEN, общий цикл, коммит.

**Критерий готовности:** таблица спецификации воспроизводится тестами; ни одно общее место не показывает «г.» и год текущего года.

## Задача 6. Индикатор связи (1–3 часа)

**Цель:** обрыв соединения — одна спокойная полоса вместо красных ошибок в трёх местах.
**Зависимости:** нет.
**Файлы:**
- Создать: `app/components/ConnectionStatus.vue`, `app/composables/useRealtimeStatus.ts`, `tests/component/connection-status.spec.ts`.
- Изменить: `app/stores/chats.ts`, `app/stores/notifications.ts`, `app/layouts/default.vue`, `app/components/chat/UnreadChats.vue`, `app/components/chat/ChatWorkspace.vue`, `app/components/chat/ChatScreen.vue`, `app/pages/notifications.vue`; `tests/unit/chats.store.spec.ts`, `notifications.store.spec.ts`.

**Интерфейсы:**
- Производит: `useRealtimeStatus(): { state: Ref<'online' | 'reconnecting' | 'offline'>, failures: Ref<number>, retry(): void }` — объединяет `connectionError` двух stores и события Echo/`navigator.onLine`. Автоповтор с паузами 2, 5, 15, 30 с, затем каждые 30 с. `ConnectionStatus` — `role="status"`, текст «Нет связи. Переподключаемся…», кнопка «Повторить» при `failures >= 3`.

- [x] RED: `chats.store.spec.ts` — ошибка подписки выставляет состояние `reconnecting` и запускает повтор по таймеру (фейковые таймеры), успех сбрасывает `failures`.
- [x] RED: `connection-status.spec.ts` — при `reconnecting` один статус, без `role="alert"`; «Повторить» появляется после третьей неудачи; при `online` компонент пуст.
- [x] RED: `UnreadChats` и список чатов при ошибке связи показывают последние загруженные чаты без красного текста.
- [x] Реализация; ошибки конкретных действий (отправка, удаление) остаются у действия.
- [ ] GREEN, общий цикл, коммит.

**Критерий готовности:** при обрыве на главной, в списке чатов и в чате нет красных ошибок связи; полоса исчезает после восстановления.

## Задача 7. Главная «Моя неделя» (2–3 часа)

**Цель:** главная отвечает, что нужно знать на этой неделе, и у прихожанина без назначений не пуста.
**Зависимости:** 4, 5, 6.
**Файлы:**
- Создать: `app/components/home/MyNextAssignment.vue`, `app/components/home/WeekEvents.vue`, `app/utils/plainText.ts`, `tests/component/home.spec.ts`, `tests/unit/plain-text.spec.ts`.
- Изменить: `app/pages/index.vue`, `app/components/calendar/UpcomingEvents.vue` (заменяется `MyNextAssignment` или удаляется), `app/components/announcements/PinnedAnnouncements.vue`, `app/components/chat/UnreadChats.vue`, `tests/visual/pages.pw.ts`.

**Интерфейсы:**
- Потребляет: `useEvents().load(range, scope)`, `formatEventWhen`, `formatMoment`, `UiAvatar`, `MinistryMark`, `ministryColorVar`.
- Производит: `markdownToPlainText(markdown: string, maxLength?: number): string` — без разметки, ссылок-URL и переносов, обрезка по слову с «…». `WeekEvents { from: string }` — события `from … from+6` области `all`, метка «Вы» по `isAssigned`.

- [ ] RED: `home.spec.ts` — без назначений блока «Вы служите» нет, «На этой неделе» показывает события семи дней; с назначением блок идёт первым с «Открыть» и «Чат события» (если `chat_id`); пустая неделя — «На этой неделе событий нет»; ссылки «Справочник / Служения / Профиль» отсутствуют.
- [ ] RED: `plain-text.spec.ts` — `## Заголовок\n**жирный** [ссылка](https://x)` → «Заголовок жирный ссылка»; обрезка 140 символов по слову.
- [ ] RED (visual): `pages.pw.ts` — на 1440 px две колонки без пустой колонки; на 390 px порядок блоков: назначение, неделя, объявления, сообщения.
- [ ] Реализация; объявления — заголовок и две строки `markdownToPlainText`, закреплённые со значком; сообщения — компактные строки.
- [ ] GREEN, общий цикл, коммит.

**Критерий готовности:** сценарий 1 спецификации проходит; на компьютере нет пустой левой колонки.

## Задача 8. Календарь: месяц и панель управления (2–3 часа)

**Цель:** месяц показывает до трёх событий, цвета служений, «Вы» и отменённые; одна строка управления.
**Зависимости:** 4, 5.
**Файлы:**
- Изменить: `app/components/calendar/CalendarMonth.vue`, `CalendarBrowser.vue`, `app/pages/calendar.vue`, `app/composables/useCalendarView.ts`; `tests/component/calendar.spec.ts`, `tests/unit/calendar-view.spec.ts`, `tests/visual/calendar-redesign.pw.ts`.

**Интерфейсы:**
- Потребляет: `ministryColorVar`, `MinistryMark`, `deviceZoneDiffers`, `formatDayHeading`, `isAssigned`.
- Производит: `CalendarMonth` — прежние `events`, `date`, события `select(day)`, `open(event)`; константа `MONTH_CELL_LIMIT = 3`. Название месяца — кнопка, открывающая нативный `input[type=date]` (`showPicker()` с запасным фокусом поля).

- [ ] RED: `calendar.spec.ts` — день с тремя событиями показывает три; с четырьмя — три и «Ещё 1»; событие с моим назначением содержит текст «Вы»; отменённое имеет класс зачёркивания и доступное имя с «Отменено»; цвет берётся из `ministry.color`, у церкви — нейтральный; служение с `color: null` — нейтральный.
- [ ] RED: выбор даты через кнопку месяца переводит на выбранный месяц и день (критерий фазы 7 «одним выбором»); «Время церкви» скрыто, если пояс устройства совпадает.
- [ ] RED (visual): `calendar-redesign.pw.ts` — легенда цветов, строка управления в одну линию на 1440 px, три события в клетке читаемы на 1024 px и при 200% текста не ломают сетку.
- [ ] Реализация; панель выбранного дня дополняется «Дальше на неделе».
- [ ] GREEN, общий цикл, коммит.

**Критерий готовности:** сценарии 2–4 спецификации на компьютере проходят.

## Задача 9. Календарь на телефоне: лента недели и список с сегодня (2–3 часа)

**Цель:** выбор дня одним касанием, список начинается с сегодня, компактные строки.
**Зависимости:** 8.
**Файлы:**
- Создать: `app/components/calendar/CalendarWeekStrip.vue`, `tests/component/calendar-week-strip.spec.ts`.
- Изменить: `app/components/calendar/EventList.vue`, `EventCard.vue` (строка списка), `CalendarBrowser.vue`, `app/composables/useCalendarView.ts`; `tests/component/calendar.spec.ts`, `tests/visual/calendar-redesign.pw.ts`, `tests/visual/navigation-short-screen.pw.ts`.

**Интерфейсы:**
- Производит: `CalendarWeekStrip { date: string, events: EventItem[] }`, событие `select(day: string)`; неделя с понедельника по `calendarWeekStart`; точки — до трёх цветов событий дня; стрелки и горизонтальный свайп листают неделю. `EventList` получает `startFrom?: string` и кнопку «Показать прошедшие».

- [ ] RED: `calendar-week-strip.spec.ts` — семь кнопок дней с `aria-pressed` у выбранного, доступное имя «Вторник, 17 ноября, событий: 1»; переход недели через границу месяца и года.
- [ ] RED: `calendar.spec.ts` — список на телефоне начинается с сегодняшнего дня церкви; «Показать прошедшие» добавляет прошедшие дни месяца выше; выбор дня в ленте прокручивает к его заголовку; заголовки по `formatDayHeading`; возврат из события сохраняет `date/view/scope`.
- [ ] RED (visual): 390 px — до первого события не больше одной ленты и одного ряда чипов; 320 px при 200% — лента не вызывает горизонтальной прокрутки страницы; строки событий не ниже 56 px и не меньше 44 px зоны нажатия.
- [ ] Реализация; чипы «Все / Мои», служение (нативный select), «Месяц»; кнопка «+» с доступным именем «Создать событие» у создающих.
- [ ] GREEN, общий цикл, коммит.

**Критерий готовности:** сценарий 5 спецификации проходит на 390 px.

## Задача 10. Карточка события: шапка и моё участие (2–3 часа)

**Цель:** что, когда, где и моя роль — в первом экране; служебное убрано.
**Зависимости:** 3, 4, 5.
**Файлы:**
- Создать: `app/components/calendar/EventMenu.vue`, `app/utils/ics.ts` (ссылка на файл).
- Изменить: `app/pages/events/[id].vue`, `app/components/calendar/EventCard.vue`, `CancelEventDialog.vue`; `tests/component/calendar.spec.ts`, `tests/visual/calendar-redesign.pw.ts`.

**Интерфейсы:**
- Потребляет: `GET /events/{id}/ics`, `formatEventWhen`, `formatDuration`, `MinistryMark`.
- Производит: `eventIcsUrl(eventId: string): string` (`/api/v1/events/${id}/ics`). `EventMenu { event: EventItem }`, события `cancel`, `createChat`; пункты по `can_manage` и наличию `chat_id`.

- [ ] RED: шапка содержит метку владельца, название, «Вс, 22 ноября · 11:00–13:00 · 2 ч», место; «Владелец события», «Вложений нет» и «Видимость: вся церковь» отсутствуют; видимость «Только назначенные» показывается.
- [ ] RED: назначенный видит «Вы служите: <слоты>» с «Чат события» и «В календарь»; неназначенный видит «В календарь» под датой; у отменённого кнопки нет, причина вверху.
- [ ] RED: «Отменить событие» и «Создать чат» доступны только в «⋯» и только по праву; на экране нет `.ui-button--danger`.
- [ ] Реализация; режим редактирования фазы 7 не меняется.
- [ ] GREEN, общий цикл, коммит.

**Критерий готовности:** сценарий 7 (клиентская часть) и шапка сценария 6 проходят.

## Задача 11. Строки слотов и окно слота (2–3 часа)

**Цель:** слот — одна строка; управление в окне по прежним флагам прав.
**Зависимости:** 4, 10.
**Файлы:**
- Создать: `app/components/calendar/SlotDialog.vue`, `tests/component/slot-dialog.spec.ts`.
- Изменить: `app/components/calendar/SlotList.vue`, `EventSlotManager.vue`, `AssignDialog.vue` (вызов из окна), `EventCard.vue`; `tests/component/event-slot-manager.spec.ts`, `assign-dialog.spec.ts`, `tests/visual/calendar-redesign.pw.ts`, `tests/visual/acceptance-readability.pw.ts`.

**Интерфейсы:**
- Потребляет: `UiAvatar`, `short_name` назначений, `can_fill`/`can_manage`.
- Производит: `SlotDialog { event: EventItem, slot: EventSlot }`, события `assignmentsChanged`, `slotChanged`, `slotRemoved`, `close`. Строка `SlotList` — кнопка только при `slot.can_fill || event.can_manage`.

- [ ] RED: строка показывает название, «2 из 3», аватары и короткие имена; «+ Назначить» (тихая) при свободном месте и `can_fill`; «Никто не назначен» и переполнение подписаны текстом.
- [ ] RED: человек только с `can_fill` открывает окно и видит «Назначить» (в том числе при заполненном слоте) и «Снять назначение», но не «Изменить слот» и «Убрать слот»; с `can_manage` — все четыре; без флагов строка не нажимается.
- [ ] RED: «Снять назначение» и «Убрать слот» требуют подтверждения; успешная запись с ошибкой перечитывания не повторяет запись (поведение фазы 7 сохраняется).
- [ ] RED (обзор ревью, п. 5): отзыв права или смена `sessionVersion` при открытом окне закрывает его; поздний ответ назначения не применяется.
- [ ] Реализация; второй список управления под составом не появляется.
- [ ] GREEN, общий цикл, коммит.

**Критерий готовности:** сценарий 6 спецификации проходит полностью.

## Задача 12. Редактор события: время и длительность (1–2 часа)

**Цель:** быстрее задать время, без секунд и служебных подсказок.
**Зависимости:** 5.
**Файлы:**
- Изменить: `app/components/calendar/EventEditor.vue`, `app/utils/eventEditor.ts`, `app/pages/events/new.vue`; `tests/component/event-editor.spec.ts`, `tests/visual/content-overflow.pw.ts`.

**Интерфейсы:**
- Производит: `DURATION_PRESETS = [60, 90, 120, 180]` (минуты, подписи «1 ч · 1,5 ч · 2 ч · 3 ч»); `endFromPreset(startDate: string, startTime: string, minutes: number, timeZone: string): { date: string, time: string }`; `isAmbiguousChurchTime(date: string, time: string, timeZone: string): boolean`.

- [ ] RED: поля времени имеют `step="60"`; у редактируемого события с ненулевыми секундами `step="1"` и значение с секундами; PATCH неизменённой границы сохраняет исходный момент (регрессия фазы 7).
- [ ] RED: чип «1,5 ч» при начале 23:00 ставит окончание 00:30 следующего дня по церкви; ручное изменение окончания снимает выделение чипа.
- [ ] RED: подсказка о повторе часа видна только при `isAmbiguousChurchTime` (проверка на `Europe/Berlin` в ночь перевода часов; на `Europe/Moscow` не появляется никогда).
- [ ] RED: при создании одна основная кнопка «Создать событие» и «Отмена»; при правке «Сохранить» и «Отменить редактирование».
- [ ] Реализация, GREEN, общий цикл, коммит.

**Критерий готовности:** новое событие задаётся датой, временем начала и одним чипом длительности.

## Задача 13. Сообщения как в мессенджере (2–3 часа)

**Цель:** группы сообщений, разделители дней, время, короткие имена, тихие действия.
**Зависимости:** 2, 4, 5, 6.
**Файлы:**
- Создать: `app/utils/messageGroups.ts`, `tests/unit/message-groups.spec.ts`.
- Изменить: `app/components/chat/MessageList.vue`, `MessageItem.vue`, `MessageActions.vue`, `ReplyPreview.vue`, `ChatHeader.vue`, `ChatScreen.vue`; `tests/component/chat.spec.ts`, `tests/component/chat-scroll.spec.ts`, `tests/visual/chat-layout.pw.ts`, `tests/visual/acceptance-chat.pw.ts`.

**Интерфейсы:**
- Производит: `groupMessages(messages: Message[], timeZone: string, gapMinutes = 5): Array<{ kind: 'day', day: string } | { kind: 'group', senderId: string | null, own: boolean, messages: Message[] }>` — группа по `sender.id` (не по имени), разрыв по дню церкви или паузе больше `gapMinutes`.

- [ ] RED: `message-groups.spec.ts` — три сообщения одного отправителя подряд → одна группа; пауза 6 минут → две; полночь по церкви при другом поясе процесса → разделитель дня; скрытое имя (`full_name: null`) группируется по id; удалённый отправитель (`sender: null`) — отдельная группа.
- [ ] RED: `chat.spec.ts` — имя и аватар один раз на группу, `short_name`; у сообщения только `formatTime`; разделитель «Сегодня»/«Вчера»/«Пт, 13 ноября»; свои сообщения без имени и справа.
- [ ] RED: кнопка действий не видна в покое, видна при наведении и `:focus-within`, достижима Tab; долгое нажатие (500 мс, `pointerdown` с `pointerType: 'touch'`) открывает те же действия; набор действий по прежним флагам.
- [ ] RED: шапка группы и служения показывает «N участников»; личного — нет.
- [ ] Реализация; прокрутка и отметка прочтения фазы 7 не меняются (`chat-scroll.spec.ts` зелёный).
- [ ] GREEN, общий цикл, коммит.

**Критерий готовности:** сценарий 8 спецификации проходит.

## Задача 14. Список чатов (1–2 часа)

**Цель:** компактные строки и одна кнопка «Написать».
**Зависимости:** 4, 5, 6.
**Файлы:**
- Изменить: `app/components/chat/ChatList.vue`, `ChatListItem.vue`, `ChatWorkspace.vue`, `app/pages/chats/index.vue`; `tests/component/chat-list.spec.ts`, `new-direct-chat.spec.ts`, `chat-groups.spec.ts`, `tests/visual/chat-layout.pw.ts`.

**Интерфейсы:**
- Потребляет: `UiAvatar`, `formatMoment`, существующие `NewDirectChatDialog`, `NewGroupDialog`.
- Производит: меню «Написать» с пунктами «Личное сообщение» (`chats.dm` и `people.view`) и «Новая группа» (`chats.create_groups`); без обоих прав кнопки нет; при одном праве кнопка сразу открывает свой диалог.

- [ ] RED: строка — аватар, название в одну строку с многоточием и полным названием в доступном имени, превью без имени отправителя, `formatMoment`, счётчик; высота 64–72 px при 100% текста.
- [ ] RED: пункты «Написать» по правам, как описано выше.
- [ ] RED (visual): 320 px при 200% — строка растёт по высоте, счётчик и время не наезжают на название.
- [ ] Реализация, GREEN, общий цикл, коммит.

**Критерий готовности:** на 390 px помещается вдвое больше чатов, чем сейчас.

## Задача 15. Служение: шапка, цвет, список служений (2–3 часа)

**Цель:** название служения на всех вкладках, выбор цвета, лицо в списке.
**Зависимости:** 1, 4.
**Файлы:**
- Создать: `app/components/ministries/MinistryHeader.vue`, `app/components/ministries/MinistryColorField.vue`, `tests/component/ministry-header.spec.ts`.
- Изменить: `app/pages/ministries/index.vue`, `app/pages/ministries/[id]/index.vue`, `members.vue`, `roles.vue`, `events.vue`, `announcements.vue`, `chat.vue`, `app/components/ministries/MinistryTabs.vue`; `tests/component/ministries.spec.ts`, `tests/visual/members-redesign.pw.ts`.

**Интерфейсы:**
- Потребляет: `MinistryResource.color`, `members_count`, `MINISTRY_COLORS`, `ministryColorVar`.
- Производит: `MinistryHeader { ministry: Ministry }` со слотом `actions` и меню «⋯» (название и описание, обложка, цвет, архивировать — по существующим правам). `MinistryColorField { modelValue: MinistryColorKey | null, error?: string }` — радиогруппа из шести образцов с подписями, без предвыбора.

- [ ] RED: `ministry-header.spec.ts` — `h1` равен названию служения на всех семи маршрутах служения; «N участников» из `members_count`; плитка цвета при отсутствии обложки.
- [ ] RED: `ministries.spec.ts` — создание без цвета показывает «Выберите цвет» у поля и не отправляет запрос; правка меняет цвет; служение с `color: null` у управляющего показывает «Выберите цвет служения» со ссылкой на правку, у остальных подсказки нет.
- [ ] RED: список служений — обложка или плитка цвета, название, описание, «N участников».
- [ ] Реализация, GREEN, общий цикл, коммит.

**Критерий готовности:** сценарии 10 и 12 спецификации проходят.

## Задача 16. Обзор служения и участники (2–3 часа)

**Цель:** живая сводка вместо служебных блоков; участники без лишней роли по умолчанию.
**Зависимости:** 15.
**Файлы:**
- Изменить: `app/pages/ministries/[id]/index.vue`, `app/components/ministries/MemberRow.vue`, `app/pages/ministries/[id]/members.vue`; `tests/component/ministries.spec.ts`, `tests/visual/members-redesign.pw.ts`.

**Интерфейсы:**
- Потребляет: `useEvents().load` с `scope: 'ministry:<id>'`, `GET /ministries/{id}/members`, `GET /announcements?scope=ministry`, `UiAvatar`.

- [ ] RED: обзор показывает до трёх ближайших событий служения; пометка «N мест» видна только при `can_fill` или `can_manage` хотя бы одного слота события.
- [ ] RED: «Состав» — аватары и распределение по ролям (без условий по имени роли); последнее объявление служения; переход в чат.
- [ ] RED: `MemberRow` скрывает роль с id `ministry.default_role_id`, если у участника есть другие роли; если она единственная — показывает.
- [ ] RED: «Редактировать», «Обложка», «Архивировать» только в «⋯».
- [ ] Реализация, GREEN, общий цикл, коммит.

**Критерий готовности:** обзор отвечает «что у служения скоро и кто в нём» без служебных блоков на экране.

## Задача 17. Объявления, люди, уведомления, навигация компьютера (2–3 часа)

**Цель:** оставшиеся экраны по общим правилам.
**Зависимости:** 4, 5, 7.
**Файлы:**
- Изменить: `app/components/announcements/AnnouncementList.vue`, `AnnouncementCard.vue`; `app/pages/people/index.vue`, `app/components/people/PersonListItem.vue`; `app/pages/notifications.vue`, `app/components/notifications/EnableNotificationsButton.vue`; `app/components/AppNav.vue`, `app/components/navigation/MoreMenu.vue`; `tests/component/announcements.spec.ts`, `people.spec.ts`, `notifications.spec.ts`, `app-nav.spec.ts`, `tests/visual/navigation.pw.ts`.

**Интерфейсы:**
- Потребляет: `markdownToPlainText`, `formatMoment`, `UiAvatar`, `short_name` из `/auth/me` (если нет — склеить `first_name last_name` из `me.person`).

- [ ] RED: объявления — превью двух строк, закреплённые сверху со значком, переключатель «Церковь / Мои служения» (две кнопки с `aria-pressed`) вместо select; объявление служения несёт `MinistryMark`; заголовки без подчёркивания, строка кликабельна целиком.
- [ ] RED: люди — кнопка «Фильтры» со счётчиком активных фильтров открывает панель фильтров; пометки «без ролей» в строках нет, фильтр сохранён.
- [ ] RED: уведомления — строка «Получать уведомления на телефон» с «Включить»; настройки — значок с доступным именем «Настройки уведомлений».
- [ ] RED: навигация от 768 px — группа «Управление» с админ-пунктами по правам; блок пользователя внизу с меню «Профиль», «Оформление», «Календарь телефона», «Выйти»; «Профиль» и «Календарь телефона» не дублируются в основном списке; мобильная панель и «Ещё» без изменений состава.
- [ ] Реализация, GREEN, общий цикл, коммит.

**Критерий готовности:** все разделы достижимы по-прежнему, служебные пометки ушли.

## Задача 18. Полная приёмка и PR (2–3 часа)

**Цель:** фаза проверена целиком и готова к `main`.
**Зависимости:** 1–17.
**Файлы:** `tests/visual/acceptance-matrix.pw.ts`, `tests/visual/support/acceptance-api.ts` (фикстуры `color`, `members_count`, `short_name`), `e2e/` (real-API сценарии фазы 8), `docs/design-acceptance.md`, `docs/architecture.md` (раздел 10 — реализованное направление фазы 8), этот план.

- [ ] Обновить фикстуры приёмки под новые поля; матрица всех маршрутов в обеих темах, 320–1920 px, 200%, 375×390 — зелёная.
- [ ] Real-API E2E (`npm run e2e`): сценарии 1, 6, 7, 10, 11 спецификации против настоящего Laravel API, пояс браузера `America/Los_Angeles`, церкви `Europe/Moscow`.
- [ ] Просмотреть снимки всех шести экранов аудита в обеих темах на 390/1440 и сравнить с макетами аудита; расхождения по сути исправить или записать в отчёт.
- [ ] Полные проверки сервера и клиента из общего цикла; отчёт в `docs/design-acceptance.md` с фактическим выводом команд; физические iOS/Android отмечаются как непроверенные, если недоступны.
- [ ] `/code-review` дифа `phase-8` против `main` по архитектуре и словарю; исправления.
- [ ] PR `phase-8` → `main`, squash.

**Критерий готовности:** 12 сценариев спецификации проходят; CI зелёный; PR открыт.
