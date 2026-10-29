# План фазы 2: объявления, уведомления, Web Push, realtime

> **Для агентов-исполнителей:** ОБЯЗАТЕЛЬНЫЙ СУБ-SKILL: используйте `superpowers:subagent-driven-development` (рекомендуется) или `superpowers:executing-plans`, чтобы выполнять план задача за задачей. Шаги размечены чекбоксами (`- [ ]`).

**Цель:** довести систему до состояния, в котором носитель права публикует объявление церкви или служения с вложениями, а все адресаты получают его в центре уведомлений, живым бейджем через WebSocket и пушем на установленную PWA на iOS и Android.

**Архитектура:** два новых модуля монолита. `Announcements` владеет объявлениями и просмотрами и публикует `AnnouncementPublished`. `Notifications` ничего не вызывает сам: слушает доменные события в очереди и рассылает классы `Notification` Laravel по каналам `database` (центр уведомлений), `broadcast` (канал `private-user.{id}` через Reverb) и собственному каналу `webpush` поверх `minishlink/web-push`. Категории уведомлений включаются и выключаются аккаунтом. Клиент подключает Laravel Echo, подписывается на свой канал, показывает центр уведомлений и по явному нажатию кнопки оформляет push-подписку; service worker показывает пуш и по клику открывает нужный маршрут.

**Стек:** к стеку фазы 1 добавляются `laravel/reverb`, `minishlink/web-push`, `league/commonmark` не нужен (Markdown хранится как текст и очищается регулярными выражениями), на клиенте `laravel-echo`, `pusher-js`, `marked`, `dompurify`.

**Спецификация:** [docs/architecture.md](../architecture.md) — разделы 2 (Realtime, Пуши), 5.5, 5.7, 6.1 (ключи `announcements.church.publish`, `announcements.publish`), 6.4 (объявления, медиафайлы), 6.5, 7.5, 7.7, 8 (Announcements, Notifications, Media, Settings, Realtime), 9, 10, 11 (сервис `reverb`, локация `/app/`), 12, 13 (фаза 2), 15 (риски 2, 4, 7); словарь [CONTEXT.md](../../CONTEXT.md) — «Объявление», «Закрепление», «Уведомление», «Пуш», «Категория уведомлений», «Вложение»; решения [docs/adr](../adr/) 0001 (пуши только в установленной PWA), 0003.

---

## Глобальные ограничения

Действуют все ограничения фазы 1 ([phase-1.md](./phase-1.md), раздел «Глобальные ограничения»). Дополнительно в фазе 2:

- Каждое уведомление — класс-наследник `App\Modules\Notifications\AppNotification`, реализует `ShouldQueue`. Прямая отправка пушей и запись в `notifications` в обход него запрещены.
- Модуль Notifications пишет только в свои таблицы (`notifications`, `notification_settings`, `push_subscriptions`) и только реагирует на события; ни один другой модуль не вызывает его классы напрямую.
- Все события broadcast (`ShouldBroadcast`) ставятся в очередь (`ShouldBroadcastNow` не используется).
- Полезная нагрузка пуша — JSON не более 3 КБ: `title`, `body` (обрезан до 140 символов), `icon`, `tag`, `url`. Ключи VAPID живут только в `.env` сервера, как остальные секреты (раздел 11 архитектуры): их нет ни в репозитории, ни в образах, ни в секретах GitHub; тесты подставляют свои значения через `config()`.
- Ответы push-сервиса `404` и `410` удаляют подписку; любая другая ошибка увеличивает `failures`, десятая подряд удаляет подписку; успех обнуляет счётчик.
- Markdown объявления очищается на сервере при каждом сохранении: HTML-теги удаляются, ссылки допускаются только со схемами `http`, `https`, `mailto`, `tel` и относительные. Клиент рендерит `marked` с отключённым HTML и пропускает результат через `DOMPurify`.
- Даты `hide_after` и все отображения дат на клиенте считаются в часовом поясе церкви (`church.timezone`), не устройства.
- Каталог прав расширяется ровно двумя ключами: `announcements.church.publish` (глобальный) и `announcements.publish` (служения). Ключи чатов (`chats.*`, `chat.moderate`) — фаза 4, календаря — фаза 3.

---

## Решения планирования

Принято при составлении плана. Каждый пункт — выбор из развилки, оставленной архитектурой, или уточнение, без которого фаза не самодостаточна.

1. **Выключенная категория останавливает только пуши.** Раздел 7.7 перечисляет каналы буквально: `database` и `broadcast` идут всегда, `webpush` — «если категория включена и есть подписки». Категория `chat` канал `database` не использует (фаза 4). Поэтому центр уведомлений показывает всё, что касается аккаунта, а переключатель категории управляет тем, что приходит на телефон.
2. **Собственный канал `webpush` поверх `minishlink/web-push`, без `laravel-notification-channels/webpush`.** Таблица пакета (`subscribable_type/id`, без `failures`, `last_success_at`, `user_agent`) не совпадает с разделом 5.7, а его обработка ошибок не считает десять неудач подряд. Канал занимает один класс; в том же изменении правится строка «Пуши» в таблице раздела 2 архитектуры.
3. **Контракт владельца медиафайла фиксируется здесь.** Фаза 1 (задача 22) объявила `Media\Contracts\MediaOwnerResolver` как точку расширения, не зафиксировав сигнатуру. С этой фазы контракт такой: `public function canView(User $viewer, Media $media): ?bool` — `null`, если медиафайл не принадлежит объекту этого модуля; реализации регистрируются тегом контейнера `media.owner_resolvers`, `MediaAccess::canView` опрашивает их после прямых ссылок (фото человека, обложка служения) и до правила «свой непривязанный файл». Если задача 22 реализовала контракт иначе, задача 7 этой фазы приводит его к этому виду; сигнатура `MediaAccess::canView(User, Media): bool` не меняется.
4. **Привязка вложений — один Action модуля Media.** `SyncAttachments::handle(Model $attachable, list<string> $mediaIds, User $uploader): void` привязывает новые файлы и отвязывает с физическим удалением те, что исчезли из списка. Его же используют события (фаза 3) и сообщения (фаза 4). Для новых ID правила те же, что у `AttachDirectMedia` фазы 1: файл загрузил тот же аккаунт, файл обработан (`media.not_ready` иначе), файл ещё никуда не привязан. Сохранённые ID доступны любому уполномоченному редактору. Все ID блокируются до изменения связей, удаление байтов происходит только после внешнего коммита (уточнения R2–R4 задачи 7).
5. **Стирание аккаунта расширяется контрактом.** `people:erase` фазы 1 удаляет строку `users`, но подписки и настройки уведомлений лежат в таблицах Notifications, куда Directory писать не может, а внешний ключ `RESTRICT` не даст удалить аккаунт. Контракт `Directory\Contracts\AccountEraser { public function eraseAccount(string $userId): void; }` и тег `directory.account_erasers` уже есть с фазы 1: команда вызывает все помеченные реализации в той же транзакции до удаления аккаунта, реализации Access, Ministries и Media там уже зарегистрированы. Notifications добавляет свою в задаче 4, Announcements — в задаче 5, Chat — в фазе 4. Колонка `announcements.author_user_id` по той же причине допускает `null`: автор стёрт, объявление осталось.
6. **Новое право служения не выдаётся существующим ролям «Лидер».** Роль «Лидер» получила все права служения в момент создания служения. `announcements.publish` появляется в каталоге позже; администратор или носитель `roles.manage` выдаёт его в редакторе роли. Автоматическая раздача противоречила бы ADR-0003 (никаких неявных выдач).
7. **`hide_after` — дата в часовом поясе церкви.** Список показывает объявление, пока `hide_after >= сегодня` по календарю церкви; по прямой ссылке скрытое по дате объявление открывается. Архивное объявление из списка исчезает для всех, по прямой ссылке открывается только тем, кто может его править; остальным — `404`.
8. **Просмотр фиксируется при `GET /announcements/{id}`,** одна строка на аккаунт, повторные открытия строку не дублируют. `views_count` отдаётся только тем, кто может править объявление.
9. **Публичный ключ VAPID отдаётся в `GET /settings`** полем `vapid_public_key`. Ключ не секрет и нужен клиенту до первого запроса подписки; отдельный эндпоинт не оправдан.
10. **Отписка при выходе делает клиент:** `DELETE /push-subscriptions` с `endpoint` устройства перед `POST /auth/logout`. Сервер не знает, с какого устройства пришёл выход. Отключение аккаунта (`UserDisabled`) удаляет все подписки слушателем в Notifications — это закрывает обещание задачи 14 фазы 1.
11. **Reverb разворачивается в этой фазе целиком:** сервис в `compose.yml` и `compose.prod.yml`, локация `/app/` в обоих конфигах nginx (фаза 1 её намеренно не добавляла), переменные `REVERB_*` в `.env.example`.
12. **Дата и время на клиенте — один composable `useChurchDate()`.** Фаза 1 требовала показывать даты в часовом поясе церкви, но имя помощника не фиксировала. Здесь оно фиксируется; если задача 30 фазы 1 завела помощник под другим именем, задача 9 переименовывает его в `useChurchDate` и переводит журнал на него.
13. **Отметка прочитанного — списком или всё сразу:** `POST /notifications/read` принимает либо `ids`, либо `all: true`. Отдельного эндпоинта «прочитать одно» нет: клиент шлёт список из одного.
14. **Миграции фазы нумеруются с `2026_10_01_000600`,** чтобы гарантированно идти после миграций фазы 1 (`2026_09_12_*`). Дата в имени — порядок, не срок.
15. **Адрес WebSocket — источник страницы, ключ Reverb — из `GET /settings`** (решение итогового ревью фазы 1, раздел 9 архитектуры). Echo подключается к хосту, порту и схеме из `window.location` по пути `/app`, как клиент ходит в API относительными путями; публичный ключ приложения Reverb приходит полем `reverb_key` в `GET /settings`, как `vapid_public_key` (решение 9). Переменных `NUXT_PUBLIC_REVERB_*` и build-args нет: образ `web` не зависит от домена. Поэтому `/app` на том же источнике везде: в проде его проксирует nginx, в dev — dev-сервер Nuxt (задача 1), в сквозных тестах — окружение задачи 13. `REVERB_HOST`, `REVERB_PORT`, `REVERB_SCHEME` в `.env` API — только адрес, по которому Laravel публикует события в Reverb внутри сети.

---

## Структура файлов

Что создаётся или меняется в фазе 2. Правила раскладки внутри модуля те же, что в фазе 1.

```text
apps/api/
├── app/Modules/Notifications/
│   ├── AppNotification.php                 базовый класс всех уведомлений
│   ├── NotificationCategory.php            перечисление категорий
│   ├── NotificationPreferences.php         «включена ли категория у аккаунта»
│   ├── PushGate.php                        решает, идёт ли канал webpush
│   ├── Channels/WebPushChannel.php         канал Laravel Notifications
│   ├── Push/PushTransport.php              контракт доставки одного пуша
│   ├── Push/PushResult.php
│   ├── Push/MinishlinkPushTransport.php    реализация поверх minishlink/web-push
│   ├── Push/WebPushSender.php              обход подписок, учёт ошибок
│   ├── Notifications/AnnouncementPublishedNotification.php
│   ├── Listeners/NotifyAboutAnnouncement.php
│   ├── Listeners/RemovePushSubscriptionsOnDisable.php
│   ├── NotificationsAccountEraser.php
│   ├── Actions/SetNotificationSettings.php, SavePushSubscription.php,
│   │           DeletePushSubscription.php, MarkNotificationsRead.php
│   ├── Console/GenerateVapidKeysCommand.php
│   ├── Models/NotificationSetting.php, PushSubscription.php
│   ├── Http/Controllers/NotificationCenterController.php,
│   │                    NotificationSettingsController.php, PushSubscriptionController.php
│   ├── Http/Requests/…, Http/Resources/NotificationResource.php
│   ├── Database/Migrations/2026_10_01_000600_create_notifications_tables.php
│   └── routes.php
├── app/Modules/Announcements/
│   ├── Models/Announcement.php, AnnouncementView.php
│   ├── AnnouncementScope.php
│   ├── MarkdownCleaner.php
│   ├── AnnouncementVisibility.php
│   ├── AnnouncementMediaOwnerResolver.php
│   ├── Actions/PublishAnnouncement.php, UpdateAnnouncement.php, PinAnnouncement.php,
│   │           UnpinAnnouncement.php, ArchiveAnnouncement.php, RecordAnnouncementView.php
│   ├── Events/AnnouncementPublished.php
│   ├── Policies/AnnouncementPolicy.php
│   ├── Http/Controllers/AnnouncementController.php
│   ├── Http/Queries/AnnouncementIndexQuery.php
│   ├── Http/Requests/StoreAnnouncementRequest.php, UpdateAnnouncementRequest.php
│   ├── Http/Resources/AnnouncementResource.php
│   ├── Database/Migrations/2026_10_01_000700_create_announcements_tables.php
│   └── routes.php
├── app/Modules/Media/Actions/SyncAttachments.php          новый Action
├── app/Modules/Media/Contracts/MediaOwnerResolver.php     контракт зафиксирован
├── app/Modules/Directory/Models/User.php                  receivesBroadcastNotificationsOn()
├── app/Modules/Access/Permission.php                      +2 ключа
├── config/broadcasting.php, config/reverb.php, config/webpush.php
├── routes/channels.php
└── tests/Feature/{Realtime,Notifications,Announcements}/…

apps/web/
├── app/composables/useChurchDate.ts, useEcho.ts, usePush.ts
├── app/plugins/echo.client.ts
├── app/stores/settings.ts, notifications.ts
├── app/pages/notifications.vue, settings/notifications.vue
├── app/pages/announcements/index.vue, announcements/[id].vue, ministries/[id]/announcements.vue
├── app/components/announcements/AnnouncementCard.vue, AnnouncementEditor.vue, MarkdownBody.vue,
│                                PinnedAnnouncements.vue
├── app/components/notifications/NotificationList.vue, EnableNotificationsButton.vue
├── app/sw.ts, app/sw/handlers.ts                          push и notificationclick
└── tests/unit/…, tests/component/…, e2e/announcements.spec.ts

infra/
├── compose.yml, compose.prod.yml                          сервис reverb
└── nginx/dev.conf, nginx/prod.conf                        локация /app/
```

---

## Блок 1. Realtime и центр уведомлений

Блок открывается Reverb: без канала `user.{id}` ни один тест на живой бейдж и на broadcast-канал уведомлений не имеет смысла. Таблицы и категории идут до базового класса уведомления, потому что `via()` зависит от настроек категорий.

### Задача 1: Reverb, авторизация каналов, канал `user.{id}`

**Файлы:**
- Дополнительно по решениям 11 и 15: `infra/compose.prod.yml`, `infra/nginx/prod.conf`, `infra/deploy.sh`, `README.md`, `docs/deploy.md`, `apps/web/package-lock.json`, OpenAPI и типы клиента.
- Создать: `apps/api/routes/channels.php`, `apps/api/config/broadcasting.php`, `apps/api/config/reverb.php` (публикуются установкой)
- Изменить: `apps/api/bootstrap/app.php` (`withBroadcasting`), `apps/api/.env.example`, `apps/api/phpunit.xml`, `apps/api/composer.json`, `apps/api/app/Modules/Settings/Http/Resources/SettingsResource.php` (`reverb_key`), `infra/compose.yml` (сервис `reverb`), `infra/nginx/dev.conf` (локация `/app/`), `apps/web/nuxt.config.ts` (прокси `/app` dev-сервера с WebSocket)
- Тест: `apps/api/tests/Feature/Realtime/ChannelAuthTest.php`, `apps/api/tests/Feature/Settings/SettingsEndpointTest.php` (`reverb_key`)

**Интерфейсы:**
- Отдаёт наружу: `POST /broadcasting/auth` по cookie-сессии; приватный канал `user.{userId}` доступен только аккаунту с этим `id` и только если он не отключён.
- Отдаёт наружу: `GET /settings` дополнительно отдаёт `reverb_key` — публичный ключ приложения Reverb (решение 15).
- Отдаёт наружу: сервис `reverb` в Compose на порту `8080` внутри сети; снаружи — `/app/{key}` на том же источнике, что и клиент: через nginx, а в dev — через прокси dev-сервера Nuxt (`http://localhost:3000/app/{key}`), который ведёт туда же, куда `/api` (`NUXT_API_PROXY_TARGET`).
- Отдаёт наружу: переменные окружения `BROADCAST_CONNECTION=reverb`, `REVERB_APP_ID`, `REVERB_APP_KEY`, `REVERB_APP_SECRET`, `REVERB_HOST`, `REVERB_PORT`, `REVERB_SCHEME`; в тестах `BROADCAST_CONNECTION=log`.
- Потребляет: `User::isDisabled()` и `actingAsUser()` из фазы 1.

- [x] **Шаг 1: Написать падающие тесты**

`apps/api/tests/Feature/Realtime/ChannelAuthTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Directory\Models\User;

beforeEach(fn () => config(['broadcasting.default' => 'reverb']));

it('requires a session to authorize a channel', function () {
    $this->postJson('/broadcasting/auth', [
        'channel_name' => 'private-user.01J000000000000000000000AA',
        'socket_id' => '1234.5678',
    ])->assertStatus(401);
});

it('authorizes an account for its own user channel', function () {
    $user = actingAsUser();

    $this->postJson('/broadcasting/auth', [
        'channel_name' => "private-user.{$user->id}",
        'socket_id' => '1234.5678',
    ])->assertOk()->assertJsonStructure(['auth']);
});

it('refuses the user channel of another account', function () {
    actingAsUser();
    $other = User::factory()->create();

    $this->postJson('/broadcasting/auth', [
        'channel_name' => "private-user.{$other->id}",
        'socket_id' => '1234.5678',
    ])->assertForbidden();
});

it('refuses a disabled account even on its own channel', function () {
    $user = actingAsUser(attributes: ['disabled_at' => now()]);

    $this->postJson('/broadcasting/auth', [
        'channel_name' => "private-user.{$user->id}",
        'socket_id' => '1234.5678',
    ])->assertForbidden();
});
```

В `apps/api/tests/Feature/Settings/SettingsEndpointTest.php` — тест того же вида, что `exposes the vapid public key in settings` задачи 4: `config(['broadcasting.connections.reverb.key' => 'local-key'])`, затем `GET /api/v1/settings` отдаёт `data.reverb_key = 'local-key'`.

- [x] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Feature/Realtime/ChannelAuthTest.php tests/Feature/Settings/SettingsEndpointTest.php`
Ожидается: FAIL, маршрут `/broadcasting/auth` не определён (404), в настройках нет `reverb_key`.

- [x] **Шаг 3: Установить Reverb и подключить каналы**

```bash
cd apps/api && composer require laravel/reverb && php artisan install:broadcasting --reverb --without-node
```

В `apps/api/bootstrap/app.php` после `withRouting(...)`:

```php
->withBroadcasting(
    __DIR__.'/../routes/channels.php',
    ['middleware' => ['web', 'auth']],
)
```

`apps/api/routes/channels.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Directory\Models\User;
use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('user.{userId}', function (User $user, string $userId): bool {
    return $user->id === $userId && ! $user->isDisabled();
});
```

Дополнения к `apps/api/.env.example`:

```dotenv
BROADCAST_CONNECTION=reverb
REVERB_APP_ID=church
REVERB_APP_KEY=local-key
REVERB_APP_SECRET=local-secret
REVERB_HOST=reverb
REVERB_PORT=8080
REVERB_SCHEME=http
```

В `apps/api/phpunit.xml` добавить `<env name="BROADCAST_CONNECTION" value="log"/>`: тесты, которые не проверяют канал явно, не должны ходить в Reverb. Тест авторизации переключает драйвер на `reverb` в `beforeEach` — драйвер считает подпись локально, без сети.

`SettingsResource` отдаёт `reverb_key` из `config('broadcasting.connections.reverb.key')` — публичную часть, как `vapid_public_key`; адреса сокета в ответе нет (решение 15). После правки — `composer openapi` и `npm run gen:api`.

- [x] **Шаг 4: Сервис в Compose, локация nginx и прокси dev-сервера Nuxt**

В `infra/compose.yml` рядом с `worker`:

```yaml
  reverb:
    build: { context: ./php }
    command: php artisan reverb:start --host=0.0.0.0 --port=8080
    environment: *app-environment
    volumes: ['../apps/api:/app']
    depends_on: [app]
```

В `infra/nginx/dev.conf` перед `location ~ \.php$`:

```nginx
    location /app/ {
        proxy_pass http://reverb:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }
```

В `apps/web/nuxt.config.ts` — прокси `/app` dev-сервера Nuxt на тот же адрес, что и `/api` (`apiProxyTarget`), с поддержкой WebSocket: `routeRules`-прокси запросы upgrade не пропускает, поэтому нужен прокси dev-сервера с `ws: true` (например, `nitro.devProxy`). Клиент в dev ходит в сокет так же, как в проде, — на свой источник (решение 15).

- [x] **Шаг 5: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Feature/Realtime/ChannelAuthTest.php tests/Feature/Settings/SettingsEndpointTest.php`
Ожидается: PASS.

- [x] **Шаг 6: Проверить рукопожатие вручную**

Выполнить: `make up`, `npm run dev` в `apps/web`, затем `curl -si -N -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" http://localhost:3000/app/local-key | head -1` — через прокси dev-сервера Nuxt, как ходит клиент: в адресе проверки порт dev-сервера, а куда прокси ведёт дальше, задаёт `NUXT_API_PROXY_TARGET`, как для `/api`.
Ожидается: `HTTP/1.1 101 Switching Protocols`.

- [x] **Шаг 7: Коммит**

```bash
git add apps/api apps/web infra && git commit -m "feat(realtime): reverb, channel authorization, user channel"
```

**Критерии готовности:**
- `/broadcasting/auth` работает по cookie-сессии: без сессии `401`, чужой канал `403`, свой — ответ с `auth`.
- Отключённый аккаунт не получает даже свой канал (инвариант 6.3.9 распространяется на realtime).
- WebSocket-рукопожатие проходит через nginx, а не только напрямую в Reverb; `proxy_read_timeout` не меньше 60 секунд (риск 7).
- Рукопожатие проходит и через прокси dev-сервера Nuxt на его собственном порту; `GET /settings` отдаёт `reverb_key`.
- Тесты не зависят от запущенного Reverb: драйвер по умолчанию `log`.

**Результат исполнения (29.10.2026):**
- Reverb 1.12, авторизация cookie-сессией, собственный канал и отказ отключённому аккаунту; публичный ключ в настройках. Дополнительные тесты: вход с cookie, неизвестный канал, JSON без Accept, точная подпись и отсутствие секретов в настройках.
- В тесте после переключения с log на reverb повторно загружается файл каналов: Laravel регистрирует callbacks на драйвере при старте приложения, до beforeEach. Конфигурации опубликованы из пакетов без генерации ненужного Echo-клиента внутри API.
- В dev проксируются и /broadcasting, и /app. Nitro обновлён с 2.13.4 до 2.13.5: старая версия игнорирует ws в devProxy (nitrojs/nitro#4269). Production также получил сервис и nginx-прокси; инструкции окружения обновлены.
- API: 422 passed (1097 assertions); Pint: PASS, 236 files; PHPStan: No errors. Клиент: 25 файлов, 229 тестов, ESLint и typecheck без ошибок (тесты с --maxWorkers=2 из-за нагрузки Windows).
- Рукопожатие через nginx :18080 и Nuxt :3000: HTTP 101, pusher:connection_established; POST /broadcasting/auth через Nuxt без сессии: 401 JSON. Порт 18080 использовался только в локальном override, поскольку 8080 занят другим проектом.
- Сборки `npm run build`, `npm run generate` и `npm run verify-sw` прошли; Compose production и конфигурация nginx проверены.
- Саморевью по AGENTS.md: границы модулей соблюдены, условий по именам ролей нет, термины словаря сохранены, архитектура и документы обновлены. Новые термины и ADR не требуются.
- OpenAPI и типы обновлены; генератор сохраняет прежнее предупреждение JR001 для SessionResource (не относится к этой задаче).

---

### Задача 2: Таблицы Notifications, категории, настройки категорий

**Файлы:**
- Создать: `app/Modules/Notifications/Database/Migrations/2026_10_01_000600_create_notifications_tables.php`; `Models/NotificationSetting.php`, `Models/PushSubscription.php`; `NotificationCategory.php`; `NotificationPreferences.php`; `Actions/SetNotificationSettings.php`; `Http/Controllers/NotificationSettingsController.php`, `Http/Requests/UpdateNotificationSettingsRequest.php`; `app/Modules/Notifications/routes.php`; `database/factories/PushSubscriptionFactory.php`
- Тест: `tests/Feature/Notifications/NotificationSettingsTest.php`

**Интерфейсы:**
- Отдаёт наружу: `enum NotificationCategory: string { Announcements = 'announcements'; Chat = 'chat'; Assignments = 'assignments'; Reminders = 'reminders'; }` с `label(): string`.
- Отдаёт наружу: `NotificationPreferences::isEnabled(User $user, NotificationCategory $category): bool` — отсутствие строки означает «включено».
- Отдаёт наружу: `GET /notification-settings` → `{ data: [{category, label, enabled}] }`; `PUT /notification-settings` с телом `{ "settings": { "announcements": false } }` — меняет только перечисленные категории.
- Отдаёт наружу: `PushSubscription::factory()->for($user)` — подписка с уникальным `endpoint`, `public_key`, `auth_token`, `content_encoding = 'aes128gcm'`.
- Отдаёт наружу: таблица `notifications` в формате Laravel с `notifiable_id char(26)` — базовый класс задачи 3 пишет в неё через канал `database`.

- [x] **Шаг 1: Написать падающие тесты**

`tests/Feature/Notifications/NotificationSettingsTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Notifications\Models\NotificationSetting;
use App\Modules\Notifications\NotificationCategory;
use App\Modules\Notifications\NotificationPreferences;

it('treats a missing row as enabled', function () {
    $user = actingAsUser();

    expect(app(NotificationPreferences::class)->isEnabled($user, NotificationCategory::Announcements))->toBeTrue();
});

it('lists every category with its state', function () {
    $user = actingAsUser();
    NotificationSetting::query()->create(['user_id' => $user->id, 'category' => 'chat', 'enabled' => false]);

    $this->getJson('/api/v1/notification-settings')
        ->assertOk()
        ->assertJsonCount(count(NotificationCategory::cases()), 'data')
        ->assertJsonFragment(['category' => 'chat', 'enabled' => false])
        ->assertJsonFragment(['category' => 'announcements', 'enabled' => true]);
});

it('disables a category and leaves the others alone', function () {
    $user = actingAsUser();

    $this->putJson('/api/v1/notification-settings', ['settings' => ['reminders' => false]])
        ->assertOk()
        ->assertJsonFragment(['category' => 'reminders', 'enabled' => false])
        ->assertJsonFragment(['category' => 'assignments', 'enabled' => true]);

    expect(app(NotificationPreferences::class)->isEnabled($user, NotificationCategory::Reminders))->toBeFalse()
        ->and(app(NotificationPreferences::class)->isEnabled($user, NotificationCategory::Assignments))->toBeTrue();
});

it('re-enables a category', function () {
    $user = actingAsUser();
    NotificationSetting::query()->create(['user_id' => $user->id, 'category' => 'chat', 'enabled' => false]);

    $this->putJson('/api/v1/notification-settings', ['settings' => ['chat' => true]])->assertOk();

    expect(app(NotificationPreferences::class)->isEnabled($user, NotificationCategory::Chat))->toBeTrue();
});

it('rejects an unknown category', function () {
    actingAsUser();

    $this->putJson('/api/v1/notification-settings', ['settings' => ['weather' => false]])
        ->assertStatus(422)
        ->assertJsonValidationErrors('settings.weather');
});

it('requires a session', function () {
    $this->getJson('/api/v1/notification-settings')->assertStatus(401);
});
```

- [x] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Feature/Notifications/NotificationSettingsTest.php`
Ожидается: FAIL, классов и таблиц нет.

- [x] **Шаг 3: Миграция**

```php
Schema::create('notifications', function (Blueprint $table) {
    $table->uuid('id')->primary();
    $table->string('type');
    $table->string('notifiable_type', 64);
    $table->char('notifiable_id', 26);
    $table->jsonb('data');
    $table->timestampTz('read_at')->nullable();
    $table->timestampsTz();

    $table->index(['notifiable_type', 'notifiable_id', 'created_at']);
});

DB::statement('CREATE INDEX notifications_unread_idx ON notifications (notifiable_id) WHERE read_at IS NULL');

Schema::create('notification_settings', function (Blueprint $table) {
    $table->char('user_id', 26);
    $table->string('category', 20);
    $table->boolean('enabled');
    $table->primary(['user_id', 'category']);
    $table->foreign('user_id')->references('id')->on('users')->restrictOnDelete();
});

DB::statement("ALTER TABLE notification_settings ADD CONSTRAINT notification_settings_category_check
    CHECK (category IN ('announcements', 'chat', 'assignments', 'reminders'))");

Schema::create('push_subscriptions', function (Blueprint $table) {
    $table->char('id', 26)->primary();
    $table->char('user_id', 26);
    $table->text('endpoint')->unique();
    $table->string('public_key', 255);
    $table->string('auth_token', 255);
    $table->string('content_encoding', 16)->default('aes128gcm');
    $table->string('user_agent', 255)->nullable();
    $table->timestampTz('created_at');
    $table->timestampTz('last_success_at')->nullable();
    $table->smallInteger('failures')->default(0);

    $table->foreign('user_id')->references('id')->on('users')->restrictOnDelete();
    $table->index('user_id');
});
```

- [x] **Шаг 4: Перечисление, сервис, Action, эндпоинты**

```php
<?php

declare(strict_types=1);

namespace App\Modules\Notifications;

enum NotificationCategory: string
{
    case Announcements = 'announcements';
    case Chat = 'chat';
    case Assignments = 'assignments';
    case Reminders = 'reminders';

    public function label(): string
    {
        return match ($this) {
            self::Announcements => 'Объявления',
            self::Chat => 'Чаты',
            self::Assignments => 'Назначения',
            self::Reminders => 'Напоминания',
        };
    }
}
```

```php
final class NotificationPreferences
{
    public function isEnabled(User $user, NotificationCategory $category): bool
    {
        $row = NotificationSetting::query()
            ->where('user_id', $user->id)
            ->where('category', $category->value)
            ->first();

        return $row === null || $row->enabled;
    }

    /** @return array<string, bool> категория → включена */
    public function all(User $user): array
    {
        $stored = NotificationSetting::query()->where('user_id', $user->id)->pluck('enabled', 'category');

        $result = [];
        foreach (NotificationCategory::cases() as $category) {
            $result[$category->value] = (bool) ($stored[$category->value] ?? true);
        }

        return $result;
    }
}
```

`SetNotificationSettings::handle(User $user, array<string, bool> $settings): void` — `updateOrCreate` по паре для необходимых сохранений: при `enabled=true` отсутствующая строка не создаётся, существующая строка обновляется. Регрессионный тест первого `PUT` с `chat=true` проверяет состояние «включено» и отсутствие строк. `UpdateNotificationSettingsRequest`: `settings` — `required|array`, `settings.*` — `boolean`, плюс проверка ключей по `NotificationCategory::tryFrom` в `withValidator` (ошибка на `settings.{key}`). Маршруты под `auth:sanctum`.

- [x] **Шаг 5: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Feature/Notifications/NotificationSettingsTest.php`
Ожидается: PASS, 22 теста с проверками первого явного включения, изоляции аккаунтов, схемы хранения и OpenAPI.

- [x] **Шаг 6: Коммит**

```bash
composer openapi && git add . && git commit -m "feat(notifications): tables, categories and per-account category settings"
```

**Критерии готовности:**
- Отсутствие строки в `notification_settings` читается как «включено» (раздел 5.7), лишние строки не создаются, пока аккаунт ничего не выключил.
- `PUT` меняет только перечисленные категории и отвергает неизвестную ключом валидации, а не молча игнорирует.
- Таблица `notifications` совместима с каналом `database` Laravel, но с `char(26)` в `notifiable_id` — стандартный `morphs()` не подходит для ULID.
- `push_subscriptions.endpoint` уникален: одно устройство не может числиться дважды.

---
### Задача 3: Базовый класс уведомления и центр уведомлений

**Файлы:**
- Создать: `app/Modules/Notifications/AppNotification.php`; `Actions/MarkNotificationsRead.php`; `Http/Controllers/NotificationCenterController.php`, `Http/Requests/MarkNotificationsReadRequest.php`, `Http/Resources/NotificationResource.php`, `OpenApi/MarkNotificationsReadSchema.php`, `Rules/NotificationCursor.php`
- Изменить: `app/Modules/Notifications/routes.php`; `app/Modules/Directory/Models/User.php` (`receivesBroadcastNotificationsOn()`), `app/Providers/AppServiceProvider.php` (уточнение OpenAPI), `lang/ru/validation.php`, `openapi.json`, `apps/web/types/api.d.ts`, `docs/architecture.md`
- Тест: `tests/Feature/Notifications/NotificationCenterTest.php`, `tests/Unit/Notifications/AppNotificationTest.php`

**Интерфейсы:**
- Отдаёт наружу: `abstract class AppNotification extends Illuminate\Notifications\Notification implements ShouldQueue` с абстрактными `category(): NotificationCategory`, `title(): string`, `body(): string`, `url(): string`, `tag(): string`; готовыми `via()`, `toArray()`, `toBroadcast()`, `broadcastType(): 'notification.created'`. Все уведомления фаз 2–4 наследуют его.
- Отдаёт наружу: `User::receivesBroadcastNotificationsOn(): string` → `user.{id}` (Laravel добавляет префикс `private-`).
- Отдаёт наружу: `GET /notifications?cursor` → `{ data: [{id, category, title, body, url, read_at, created_at}], next_cursor, meta: {unread_count} }`; `POST /notifications/read` с `{ ids: [...] }` или `{ all: true }` → `{ unread_count }`.
- Канал `webpush` в `via()` добавляет задача 4; в этой задаче `via()` отдаёт `broadcast` и, кроме категории `chat`, `database`.

- [x] **Шаг 1: Написать падающие тесты**

`tests/Unit/Notifications/AppNotificationTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Directory\Models\User;
use App\Modules\Notifications\AppNotification;
use App\Modules\Notifications\NotificationCategory;

final class SampleNotification extends AppNotification
{
    public function __construct(private readonly NotificationCategory $category) {}

    public function category(): NotificationCategory { return $this->category; }
    public function title(): string { return 'Заголовок'; }
    public function body(): string { return 'Текст'; }
    public function url(): string { return '/somewhere'; }
    public function tag(): string { return 'sample-1'; }
}

it('goes to the center and the live channel by default', function () {
    $user = new User;

    expect((new SampleNotification(NotificationCategory::Announcements))->via($user))
        ->toEqualCanonicalizing(['database', 'broadcast']);
});

it('skips the center for the chat category', function () {
    $user = new User;

    expect((new SampleNotification(NotificationCategory::Chat))->via($user))->toEqual(['broadcast']);
});

it('serialises category, title, body, url and tag', function () {
    $user = new User;

    expect((new SampleNotification(NotificationCategory::Reminders))->toArray($user))->toMatchArray([
        'category' => 'reminders',
        'title' => 'Заголовок',
        'body' => 'Текст',
        'url' => '/somewhere',
        'tag' => 'sample-1',
    ]);
});

it('broadcasts on the private user channel under a stable event name', function () {
    $user = new User;
    $notification = new SampleNotification(NotificationCategory::Assignments);

    expect($user->receivesBroadcastNotificationsOn())->toBe("user.{$user->id}")
        ->and($notification->broadcastType())->toBe('notification.created');
});
```

`tests/Feature/Notifications/NotificationCenterTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Directory\Models\User;
use App\Modules\Notifications\NotificationCategory;
use Illuminate\Notifications\DatabaseNotification;

function centerEntry(User $user, array $over = []): DatabaseNotification
{
    return DatabaseNotification::query()->create([
        'id' => (string) Str::uuid(),
        'type' => 'Sample',
        'notifiable_type' => $user->getMorphClass(),
        'notifiable_id' => $user->id,
        'data' => ['category' => 'announcements', 'title' => 'Т', 'body' => 'Б', 'url' => '/a/1', 'tag' => 'a-1'],
        'read_at' => null,
        'created_at' => now(),
        'updated_at' => now(),
        ...$over,
    ]);
}

it('requires a session', function () {
    $this->getJson('/api/v1/notifications')->assertStatus(401);
});

it('lists own notifications newest first with an unread count', function () {
    $user = actingAsUser();
    $old = centerEntry($user, ['created_at' => now()->subHour(), 'read_at' => now()]);
    $new = centerEntry($user);

    $this->getJson('/api/v1/notifications')
        ->assertOk()
        ->assertJsonPath('data.0.id', $new->id)
        ->assertJsonPath('data.1.id', $old->id)
        ->assertJsonPath('meta.unread_count', 1)
        ->assertJsonStructure(['data' => [['id', 'category', 'title', 'body', 'url', 'read_at', 'created_at']], 'next_cursor']);
});

it('does not show notifications of another account', function () {
    actingAsUser();
    centerEntry(User::factory()->create());

    $this->getJson('/api/v1/notifications')->assertOk()->assertJsonCount(0, 'data');
});

it('paginates by cursor', function () {
    $user = actingAsUser();
    foreach (range(1, 35) as $i) {
        centerEntry($user, ['created_at' => now()->subMinutes($i)]);
    }

    $first = $this->getJson('/api/v1/notifications')->assertOk()->assertJsonCount(30, 'data');
    $cursor = $first->json('next_cursor');

    $this->getJson("/api/v1/notifications?cursor={$cursor}")->assertOk()->assertJsonCount(5, 'data');
});

it('marks selected notifications read', function () {
    $user = actingAsUser();
    $a = centerEntry($user);
    $b = centerEntry($user);

    $this->postJson('/api/v1/notifications/read', ['ids' => [$a->id]])
        ->assertOk()
        ->assertJsonPath('unread_count', 1);

    expect($a->fresh()->read_at)->not->toBeNull()->and($b->fresh()->read_at)->toBeNull();
});

it('marks everything read', function () {
    $user = actingAsUser();
    centerEntry($user);
    centerEntry($user);

    $this->postJson('/api/v1/notifications/read', ['all' => true])
        ->assertOk()
        ->assertJsonPath('unread_count', 0);
});

it('does not mark notifications of another account', function () {
    actingAsUser();
    $foreign = centerEntry(User::factory()->create());

    $this->postJson('/api/v1/notifications/read', ['ids' => [$foreign->id]])->assertOk();

    expect($foreign->fresh()->read_at)->toBeNull();
});

it('requires either ids or all', function () {
    actingAsUser();

    $this->postJson('/api/v1/notifications/read', [])->assertStatus(422);
});
```

- [x] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Unit/Notifications tests/Feature/Notifications/NotificationCenterTest.php`
Ожидается: FAIL, класса `AppNotification` и маршрутов нет.

- [x] **Шаг 3: Базовый класс**

```php
<?php

declare(strict_types=1);

namespace App\Modules\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\BroadcastMessage;
use Illuminate\Notifications\Notification;

abstract class AppNotification extends Notification implements ShouldQueue
{
    use Queueable;

    abstract public function category(): NotificationCategory;

    abstract public function title(): string;

    abstract public function body(): string;

    abstract public function url(): string;

    abstract public function tag(): string;

    /** @return list<string> */
    public function via(object $notifiable): array
    {
        $channels = ['broadcast'];

        if ($this->category() !== NotificationCategory::Chat) {
            $channels[] = 'database';
        }

        return $channels;
    }

    /** @return array<string, mixed> */
    public function toArray(object $notifiable): array
    {
        return [
            'category' => $this->category()->value,
            'title' => $this->title(),
            'body' => mb_strimwidth($this->body(), 0, 140, '…'),
            'url' => $this->url(),
            'tag' => $this->tag(),
        ];
    }

    public function toBroadcast(object $notifiable): BroadcastMessage
    {
        return new BroadcastMessage([
            'id' => $this->id,
            ...$this->toArray($notifiable),
            'read_at' => null,
            'created_at' => now()->toISOString(),
        ]);
    }

    public function broadcastType(): string
    {
        return 'notification.created';
    }
}
```

В `User` (Directory):

```php
public function receivesBroadcastNotificationsOn(): string
{
    return "user.{$this->id}";
}
```

- [x] **Шаг 4: Центр уведомлений**

Контроллер `index`: `$request->user()->notifications()->reorder()->latest('created_at')->latest('id')->cursorPaginate(30)`; `meta.unread_count` — `unreadNotifications()->count()`. `MarkNotificationsReadRequest`: либо непустой последовательный список UUID `ids`, либо строго `all: true`. Оба поля вместе (включая `all: false`), пустой выбор, неверные UUID и не boolean `all` дают `422`. OpenAPI через `OpenApi/MarkNotificationsReadSchema.php` описывает взаимоисключающие варианты `oneOf`; схема и клиентские типы генерируются заново. `MarkNotificationsRead::handle(User $user, ?array $ids, bool $all): int` обновляет только непрочитанные строки этого аккаунта и возвращает свежий `unread_count`; прежняя дата прочтения сохраняется.

`NotificationResource`: `id`, `category`, `title`, `body`, `url` из `data`, `read_at`, `created_at`.

- [x] **Шаг 5: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Unit/Notifications tests/Feature/Notifications`
Ожидается: PASS.

- [x] **Шаг 6: Коммит**

```bash
composer openapi && git add . && git commit -m "feat(notifications): base notification class and notification center"
```

**Критерии готовности:**
- Все будущие уведомления наследуют один класс: категория, текст, ссылка и тег объявляются в одном месте, каналы выбираются централизованно.
- Категория `chat` не пишется в центр (раздел 5.7: «сообщения чатов сюда не пишутся»).
- Центр показывает только свои уведомления, курсорная пагинация по 30, счётчик непрочитанного в `meta`.
- Отметка чужого уведомления прочитанным молча не срабатывает — ни ошибки, ни изменения.
- Уведомление содержит `type: notification.created` и уходит в `private-user.{id}`; стандартное имя события Laravel `Illuminate\Notifications\Events\BroadcastNotificationCreated` сохраняется для Echo `.notification()` (раздел 9).

---

### Задача 4: Web Push — подписки, канал, ключи VAPID, обработка ошибок

**Файлы:**
- Создать: `app/Modules/Notifications/Channels/WebPushChannel.php`; `Push/PushTransport.php`, `Push/PushResult.php`, `Push/MinishlinkPushTransport.php`, `Push/WebPushSender.php`; `PushGate.php`; `Actions/SavePushSubscription.php`, `Actions/DeletePushSubscription.php`, `Actions/RecordPushDelivery.php`, `Actions/RemoveAccountPushSubscriptions.php`; `Http/Controllers/PushSubscriptionController.php`, `Http/Requests/StorePushSubscriptionRequest.php`, `Http/Requests/DeletePushSubscriptionRequest.php`; `Listeners/RemovePushSubscriptionsOnDisable.php`; `Actions/NotificationsAccountEraser.php`; `Console/GenerateVapidKeysCommand.php`; `config/webpush.php`; `tests/Support/FakePushTransport.php`
- Изменить: `AppNotification::via()` (канал `webpush`), `app/Modules/Notifications/routes.php`, `app/Modules/Settings/Http/Resources/SettingsResource.php` (`vapid_public_key`), `AppServiceProvider` (`NotificationsAccountEraser` в тег `directory.account_erasers`, привязка `PushTransport`), `.env.example`, `composer.json`
- Тест: `tests/Feature/Notifications/PushSubscriptionTest.php`, `tests/Feature/Notifications/WebPushChannelTest.php`

**Уточнения реализации (R5/Payload):**

- Сохранён внешний контракт Sender; счётчики и удаление по результатам доставки выполняет `Actions/RecordPushDelivery`, очистку при отключении — `Actions/RemoveAccountPushSubscriptions`, реализация `AccountEraser` живёт в `Actions`. Sender делегирует записи Action.
- Ключ VAPID добавляется в `SettingsResource`, общий для GET/PUT, и в сгенерированные OpenAPI/типы.
- Не-final пример `PushSample` вынесен в `Tests\Support` (его расширяет тест длинного тела), чтобы не создавать предупреждение PSR-4.
- Wire JSON содержит верхнеуровневый `url`; SW переносит его в `data.url`. `body` ≤140 символов Unicode, закодированный JSON ≤3072 байт. `LengthException` отклоняет всё ещё слишком большую нагрузку до транспорта без изменения подписок; URL и tag не обрезаются.

**Интерфейсы:**
- Отдаёт наружу: `POST /push-subscriptions` с телом `{ endpoint, keys: {p256dh, auth}, content_encoding? }` → `201`; `DELETE /push-subscriptions` с телом `{ endpoint }` → `204`.
- Отдаёт наружу: `GET /settings` дополнительно отдаёт `vapid_public_key`.
- Отдаёт наружу: `interface PushTransport { public function push(PushSubscription $subscription, string $payload): PushResult; }`, `final class PushResult { public function __construct(public readonly bool $success, public readonly ?int $status) {} }`. В тестах привязывается `Tests\Support\FakePushTransport` с методом `willRespond(string $endpoint, PushResult $result)` и списком `sent: list<array{endpoint: string, payload: array}>`.
- Отдаёт наружу: `WebPushSender::send(User $user, array<string, mixed> $payload): void` — обходит подписки аккаунта, применяет правило ошибок из глобальных ограничений.
- Отдаёт наружу: `PushGate::allows(User $user, AppNotification $notification): bool` — категория включена и есть хотя бы одна подписка.
- Пользуется: контракт `Directory\Contracts\AccountEraser` (`eraseAccount(string $userId): void`) и тег `directory.account_erasers` фазы 1; `people:erase` уже вызывает все помеченные реализации, `NotificationsAccountEraser` — ещё одна.
- Отдаёт наружу: `php artisan webpush:vapid` печатает пару ключей для `.env`.
- Коды ошибок: `push.subscription_not_found`.

- [x] **Шаг 1: Написать падающие тесты**

`tests/Feature/Notifications/PushSubscriptionTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use App\Modules\Directory\Events\UserDisabled;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use App\Modules\Notifications\Models\PushSubscription;

function subscriptionPayload(string $endpoint = 'https://push.example/abc'): array
{
    return ['endpoint' => $endpoint, 'keys' => ['p256dh' => 'BPUBLIC', 'auth' => 'AUTH'], 'content_encoding' => 'aes128gcm'];
}

it('stores a subscription for the current account', function () {
    $user = actingAsUser();

    $this->postJson('/api/v1/push-subscriptions', subscriptionPayload(), ['User-Agent' => 'iPhone Safari'])
        ->assertCreated();

    $row = PushSubscription::query()->sole();
    expect($row->user_id)->toBe($user->id)
        ->and($row->public_key)->toBe('BPUBLIC')
        ->and($row->auth_token)->toBe('AUTH')
        ->and($row->user_agent)->toBe('iPhone Safari');
});

it('moves an endpoint to the account that re-subscribed with it', function () {
    $previous = User::factory()->create();
    PushSubscription::factory()->for($previous)->create(['endpoint' => 'https://push.example/abc']);
    $user = actingAsUser();

    $this->postJson('/api/v1/push-subscriptions', subscriptionPayload())->assertCreated();

    expect(PushSubscription::query()->count())->toBe(1)
        ->and(PushSubscription::query()->sole()->user_id)->toBe($user->id);
});

it('validates the subscription shape', function () {
    actingAsUser();

    $this->postJson('/api/v1/push-subscriptions', ['endpoint' => 'not-a-url'])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['endpoint', 'keys.p256dh', 'keys.auth']);
});

it('deletes own subscription by endpoint', function () {
    $user = actingAsUser();
    PushSubscription::factory()->for($user)->create(['endpoint' => 'https://push.example/abc']);

    $this->deleteJson('/api/v1/push-subscriptions', ['endpoint' => 'https://push.example/abc'])->assertNoContent();

    expect(PushSubscription::query()->count())->toBe(0);
});

it('does not delete a subscription of another account', function () {
    PushSubscription::factory()->for(User::factory()->create())->create(['endpoint' => 'https://push.example/abc']);
    actingAsUser();

    $this->deleteJson('/api/v1/push-subscriptions', ['endpoint' => 'https://push.example/abc'])
        ->assertStatus(422)->assertJsonPath('code', 'push.subscription_not_found');

    expect(PushSubscription::query()->count())->toBe(1);
});

it('exposes the vapid public key in settings', function () {
    config(['webpush.vapid.public_key' => 'BPUBLICKEY']);
    actingAsUser();

    $this->getJson('/api/v1/settings')->assertOk()->assertJsonPath('data.vapid_public_key', 'BPUBLICKEY');
});

it('drops subscriptions when the account is disabled', function () {
    actingAsUserWith([Permission::PeopleInvite]);
    $person = Person::factory()->create();
    $victim = User::factory()->for($person)->create();
    PushSubscription::factory()->for($victim)->count(2)->create();

    $this->postJson("/api/v1/people/{$person->id}/disable")->assertOk();

    expect(PushSubscription::query()->where('user_id', $victim->id)->count())->toBe(0);
});

it('drops subscriptions and settings when the person is erased', function () {
    $person = Person::factory()->create();
    $user = User::factory()->for($person)->create();
    PushSubscription::factory()->for($user)->create();
    \App\Modules\Notifications\Models\NotificationSetting::query()->create([
        'user_id' => $user->id, 'category' => 'chat', 'enabled' => false,
    ]);

    $this->artisan('people:erase', ['id' => $person->id, '--force' => true])->assertSuccessful();

    expect(PushSubscription::query()->count())->toBe(0)
        ->and(\App\Modules\Notifications\Models\NotificationSetting::query()->count())->toBe(0)
        ->and(User::query()->find($user->id))->toBeNull();
});
```

`tests/Feature/Notifications/WebPushChannelTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Directory\Models\User;
use App\Modules\Notifications\AppNotification;
use App\Modules\Notifications\Channels\WebPushChannel;
use App\Modules\Notifications\Models\NotificationSetting;
use App\Modules\Notifications\Models\PushSubscription;
use App\Modules\Notifications\NotificationCategory;
use App\Modules\Notifications\Push\PushResult;
use App\Modules\Notifications\Push\PushTransport;
use Tests\Support\FakePushTransport;

class PushSample extends AppNotification
{
    public function category(): NotificationCategory { return NotificationCategory::Announcements; }
    public function title(): string { return 'Собрание'; }
    public function body(): string { return 'В воскресенье в 10:00'; }
    public function url(): string { return '/announcements/a1'; }
    public function tag(): string { return 'announcement-a1'; }
}

beforeEach(function () {
    $this->transport = new FakePushTransport();
    app()->instance(PushTransport::class, $this->transport);
});

it('sends the payload to every subscription of the account', function () {
    $user = User::factory()->create();
    PushSubscription::factory()->for($user)->create(['endpoint' => 'https://push.example/1']);
    PushSubscription::factory()->for($user)->create(['endpoint' => 'https://push.example/2']);

    app(WebPushChannel::class)->send($user, new PushSample());

    expect($this->transport->sent)->toHaveCount(2)
        ->and($this->transport->sent[0]['payload'])->toMatchArray([
            'title' => 'Собрание', 'tag' => 'announcement-a1', 'url' => '/announcements/a1',
        ])
        ->and($this->transport->sent[0]['payload'])->toHaveKey('icon');
});

it('records the success and resets the failure counter', function () {
    $user = User::factory()->create();
    $sub = PushSubscription::factory()->for($user)->create(['failures' => 4]);

    app(WebPushChannel::class)->send($user, new PushSample());

    expect($sub->fresh()->failures)->toBe(0)->and($sub->fresh()->last_success_at)->not->toBeNull();
});

it('deletes a subscription after 404 or 410', function (int $status) {
    $user = User::factory()->create();
    $sub = PushSubscription::factory()->for($user)->create(['endpoint' => "https://push.example/{$status}"]);
    $this->transport->willRespond($sub->endpoint, new PushResult(false, $status));

    app(WebPushChannel::class)->send($user, new PushSample());

    expect(PushSubscription::query()->find($sub->id))->toBeNull();
})->with([404, 410]);

it('counts other failures and deletes on the tenth', function () {
    $user = User::factory()->create();
    $sub = PushSubscription::factory()->for($user)->create(['failures' => 8]);
    $this->transport->willRespond($sub->endpoint, new PushResult(false, 500));

    app(WebPushChannel::class)->send($user, new PushSample());
    expect($sub->fresh()->failures)->toBe(9);

    app(WebPushChannel::class)->send($user, new PushSample());
    expect(PushSubscription::query()->find($sub->id))->toBeNull();
});

it('includes webpush in via only when the category is on and a subscription exists', function () {
    $user = User::factory()->create();
    expect((new PushSample())->via($user))->not->toContain(WebPushChannel::class);

    PushSubscription::factory()->for($user)->create();
    expect((new PushSample())->via($user))->toContain(WebPushChannel::class);

    NotificationSetting::query()->create(['user_id' => $user->id, 'category' => 'announcements', 'enabled' => false]);
    expect((new PushSample())->via($user))->not->toContain(WebPushChannel::class);
});

it('keeps the payload under three kilobytes', function () {
    $user = User::factory()->create();
    PushSubscription::factory()->for($user)->create();
    $long = new class extends PushSample {
        public function body(): string { return str_repeat('очень длинный текст ', 500); }
    };

    app(WebPushChannel::class)->send($user, $long);

    expect(strlen(json_encode($this->transport->sent[0]['payload'], JSON_THROW_ON_ERROR)))->toBeLessThan(3072);
});
```

`tests/Support/FakePushTransport.php`:

```php
<?php

declare(strict_types=1);

namespace Tests\Support;

use App\Modules\Notifications\Models\PushSubscription;
use App\Modules\Notifications\Push\PushResult;
use App\Modules\Notifications\Push\PushTransport;

final class FakePushTransport implements PushTransport
{
    /** @var list<array{endpoint: string, payload: array<string, mixed>}> */
    public array $sent = [];

    /** @var array<string, PushResult> */
    private array $responses = [];

    public function willRespond(string $endpoint, PushResult $result): void
    {
        $this->responses[$endpoint] = $result;
    }

    public function push(PushSubscription $subscription, string $payload): PushResult
    {
        $this->sent[] = ['endpoint' => $subscription->endpoint, 'payload' => json_decode($payload, true, 512, JSON_THROW_ON_ERROR)];

        return $this->responses[$subscription->endpoint] ?? new PushResult(true, 201);
    }
}
```

- [x] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Feature/Notifications/PushSubscriptionTest.php tests/Feature/Notifications/WebPushChannelTest.php`
Ожидается: FAIL.

- [x] **Шаг 3: Транспорт и отправитель**

```bash
cd apps/api && composer require minishlink/web-push
```

`config/webpush.php`:

```php
return [
    'vapid' => [
        'subject' => env('VAPID_SUBJECT', 'mailto:admin@example.com'),
        'public_key' => env('VAPID_PUBLIC_KEY'),
        'private_key' => env('VAPID_PRIVATE_KEY'),
    ],
    'ttl' => 86400,
    'max_failures' => 10,
    'icon' => '/icons/icon-192.png',
];
```

`MinishlinkPushTransport`:

```php
final class MinishlinkPushTransport implements PushTransport
{
    private ?WebPush $client = null;

    public function push(PushSubscription $subscription, string $payload): PushResult
    {
        $report = $this->client()->sendOneNotification(
            Subscription::create([
                'endpoint' => $subscription->endpoint,
                'publicKey' => $subscription->public_key,
                'authToken' => $subscription->auth_token,
                'contentEncoding' => $subscription->content_encoding,
            ]),
            $payload,
            ['TTL' => (int) config('webpush.ttl')],
        );

        return new PushResult($report->isSuccess(), $report->getResponse()?->getStatusCode());
    }

    private function client(): WebPush
    {
        return $this->client ??= new WebPush(['VAPID' => [
            'subject' => config('webpush.vapid.subject'),
            'publicKey' => config('webpush.vapid.public_key'),
            'privateKey' => config('webpush.vapid.private_key'),
        ]]);
    }
}
```

`WebPushSender`:

```php
<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Push;

use App\Modules\Directory\Models\User;
use App\Modules\Notifications\Actions\RecordPushDelivery;
use App\Modules\Notifications\Models\PushSubscription;
use LengthException;

final readonly class WebPushSender
{
    public function __construct(private PushTransport $transport, private RecordPushDelivery $recordDelivery) {}

    /** @param array<string, mixed> $payload */
    public function send(User $user, array $payload): void
    {
        if (isset($payload['body']) && is_string($payload['body']) && mb_strlen($payload['body']) > 140) {
            $payload['body'] = mb_substr($payload['body'], 0, 139).'…';
        }

        $json = json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);

        if (strlen($json) > 3072) {
            throw new LengthException('Web Push payload exceeds 3 KiB.');
        }

        foreach (PushSubscription::query()->where('user_id', $user->id)->get() as $subscription) {
            $this->recordDelivery->handle($subscription, $this->transport->push($subscription, $json));
        }
    }
}
```

`WebPushChannel::send(User $notifiable, AppNotification $notification)` собирает `[...$notification->toArray($notifiable), 'icon' => config('webpush.icon')]` и вызывает `WebPushSender`. `PushGate::allows` — `NotificationPreferences::isEnabled` и `PushSubscription::where('user_id')->exists()`. В `AppNotification::via()` после существующих каналов:

```php
if ($notifiable instanceof User && app(PushGate::class)->allows($notifiable, $this)) {
    $channels[] = WebPushChannel::class;
}
```

- [x] **Шаг 4: Подписки, слушатель, стирание, ключи**

`SavePushSubscription::handle(User $user, string $endpoint, string $p256dh, string $auth, string $encoding, ?string $userAgent): PushSubscription` — `updateOrCreate(['endpoint' => ...], [...])`: чужая подписка с тем же `endpoint` переходит к текущему аккаунту, счётчик ошибок обнуляется. `DeletePushSubscription::handle(User $user, string $endpoint): void` — `push.subscription_not_found`, если строки нет или она не этого аккаунта.

`RemovePushSubscriptionsOnDisable` (`ShouldQueue`) слушает `UserDisabled` и удаляет все подписки аккаунта.

Контракт `Directory\Contracts\AccountEraser` и его вызов в `ErasePersonCommand` (перед удалением `User`, в той же транзакции) заведены в фазе 1; здесь добавляется только реализация. `NotificationsAccountEraser implements AccountEraser` удаляет `push_subscriptions`, `notification_settings` и `notifications` аккаунта. В `AppServiceProvider`: `$this->app->bind(PushTransport::class, MinishlinkPushTransport::class);` и `NotificationsAccountEraser::class` в существующий список `$this->app->tag([...], 'directory.account_erasers')`.

`GenerateVapidKeysCommand` (`webpush:vapid`) печатает результат `Minishlink\WebPush\VAPID::createVapidKeys()` в виде строк `VAPID_PUBLIC_KEY=…` и `VAPID_PRIVATE_KEY=…`. В `.env.example` — три пустые переменные `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` с комментарием про команду.

- [x] **Шаг 5: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Feature/Notifications tests/Feature/Directory/ErasePersonTest.php`
Ожидается: PASS, включая тесты стирания фазы 1.

- [x] **Шаг 6: Коммит**

```bash
composer openapi && git add . && git commit -m "feat(notifications): web push subscriptions, channel, vapid keys and failure handling"
```

**Критерии готовности:**
- Правило ошибок из раздела 7.7 закрыто тестами: `404` и `410` удаляют подписку сразу, десятая прочая ошибка подряд — тоже, успех обнуляет счётчик.
- Канал `webpush` подключается только при включённой категории и наличии подписки; отключение категории не мешает записи в центр (решение 1).
- Отключение аккаунта удаляет подписки (инвариант 6.3.9); стирание человека проходит при наличии подписок и настроек — контракт `AccountEraser` работает.
- Тесты не ходят в push-сервисы: транспорт подменяется фейком.
- Ключи VAPID генерируются командой и не попадают в репозиторий.

---

## Блок 2. Announcements

### Задача 5: Объявления — таблицы, публикация, правка, очистка Markdown, права

**Файлы:**
- Создать: `app/Modules/Announcements/Database/Migrations/2026_10_01_000700_create_announcements_tables.php`; `Models/Announcement.php`, `Models/AnnouncementView.php`; `AnnouncementScope.php`; `MarkdownCleaner.php`; `Actions/PublishAnnouncement.php`, `Actions/UpdateAnnouncement.php`, `Actions/AnnouncementsAccountEraser.php`; `Events/AnnouncementPublished.php`; `Policies/AnnouncementPolicy.php`; `Http/Controllers/AnnouncementController.php`, `Http/Requests/StoreAnnouncementRequest.php`, `Http/Requests/UpdateAnnouncementRequest.php`, `Http/Resources/AnnouncementResource.php`; `OpenApi/AnnouncementRequestSchema.php`; `app/Modules/Announcements/routes.php`; `database/factories/AnnouncementFactory.php`
- Изменить: `app/Modules/Access/Permission.php` (два ключа), `app/Providers/AppServiceProvider.php` (политика и eraser), `tests/Feature/Access/PermissionCoverageTest.php`, `tests/Unit/Access/PermissionCatalogTest.php`
- Тест: `tests/Feature/Announcements/AnnouncementPublishTest.php`, `tests/Feature/Announcements/AnnouncementCommitTest.php`, `tests/Unit/Announcements/MarkdownCleanerTest.php`

**Интерфейсы:**
- Отдаёт наружу: `Permission::AnnouncementsChurchPublish = 'announcements.church.publish'` (глобальное, «Публиковать объявления церкви») и `Permission::AnnouncementsPublish = 'announcements.publish'` (служения, «Объявления служения»).
- Отдаёт наружу: `enum AnnouncementScope: string { Church = 'church'; Ministry = 'ministry'; }`.
- Отдаёт наружу: `PublishAnnouncement::handle(User $author, array{scope: AnnouncementScope, ministry_id: ?string, title: string, body: string, pinned: bool, hide_after: ?string, notify_on_publish: bool} $attributes): Announcement`, `UpdateAnnouncement::handle(Announcement $announcement, array $attributes): Announcement`.
- Отдаёт наружу: `MarkdownCleaner::clean(string $markdown): string`.
- Отдаёт наружу: `AnnouncementPublished(string $announcementId)`.
- Отдаёт наружу: `POST /announcements`, `PATCH /announcements/{id}`; `AnnouncementResource` — `id`, `scope`, `ministry: {id, name}|null`, `author: {id, full_name}|null`, `title`, `body`, `pinned`, `hide_after`, `notify_on_publish`, `published_at`, `archived`, `attachments` (наполняет задача 7), условно `views_count` (задача 6).
- Отдаёт наружу: `Announcement::factory()` — церковное объявление; состояния `ministry(Ministry $ministry)`, `pinned()`, `archived()`, `hiddenAfter(string $date)`.
- Коды ошибок: `announcement.archived`.

- [x] **Шаг 1: Написать падающие тесты**

`tests/Unit/Announcements/MarkdownCleanerTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Announcements\MarkdownCleaner;

it('keeps the allowed markdown subset', function () {
    $md = "# Собрание\n\nВ **воскресенье** в *10:00*.\n\n- пункт\n- ещё\n\n[Карта](https://maps.example/x)";

    expect((new MarkdownCleaner())->clean($md))->toBe($md);
});

it('strips raw html', function () {
    expect((new MarkdownCleaner())->clean('Привет <script>alert(1)</script><b>мир</b>'))->toBe('Привет alert(1)мир');
});

it('neutralises unsafe link schemes', function () {
    expect((new MarkdownCleaner())->clean('[тык](javascript:alert(1))'))->toBe('[тык]()');
});

it('keeps mailto, tel and relative links', function () {
    $md = '[почта](mailto:a@b.c) [тел](tel:+79123456789) [внутри](/announcements/1)';

    expect((new MarkdownCleaner())->clean($md))->toBe($md);
});

it('turns images into their alt text', function () {
    expect((new MarkdownCleaner())->clean('![схема](https://x/y.png)'))->toBe('схема');
});
```

`tests/Feature/Announcements/AnnouncementPublishTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use App\Modules\Announcements\Events\AnnouncementPublished;
use App\Modules\Announcements\Models\Announcement;
use App\Modules\Directory\Models\Person;
use Illuminate\Support\Facades\Event;

function churchAnnouncement(array $over = []): array
{
    return ['scope' => 'church', 'title' => 'Собрание', 'body' => 'В воскресенье', ...$over];
}

it('denies publishing a church announcement without announcements.church.publish', function () {
    actingAsUserWith([Permission::PeopleView]);

    $this->postJson('/api/v1/announcements', churchAnnouncement())->assertForbidden();
});

it('publishes a church announcement', function () {
    $user = actingAsUserWith([Permission::AnnouncementsChurchPublish]);

    $this->postJson('/api/v1/announcements', churchAnnouncement())
        ->assertCreated()
        ->assertJsonPath('data.scope', 'church')
        ->assertJsonPath('data.pinned', false)
        ->assertJsonPath('data.notify_on_publish', true)
        ->assertJsonPath('data.author.id', $user->id);

    expect(Announcement::query()->sole()->published_at)->not->toBeNull();
});

it('denies publishing a ministry announcement without announcements.publish in it', function () {
    $ministry = ministryWithRoles();
    $user = actingAsUser();
    memberOf($ministry, $user->person);

    $this->postJson('/api/v1/announcements', churchAnnouncement(['scope' => 'ministry', 'ministry_id' => $ministry->id]))
        ->assertForbidden();
});

it('publishes a ministry announcement with announcements.publish in that ministry', function () {
    $ministry = ministryWithRoles();
    $user = actingAsUser();
    $leader = $ministry->roles()->where('name', 'Лидер')->sole();
    memberOf($ministry, $user->person, [$leader->id]);

    $this->postJson('/api/v1/announcements', churchAnnouncement(['scope' => 'ministry', 'ministry_id' => $ministry->id]))
        ->assertCreated()
        ->assertJsonPath('data.ministry.id', $ministry->id);
});

it('does not let a ministry publisher post a church announcement', function () {
    $ministry = ministryWithRoles();
    $user = actingAsUser();
    memberOf($ministry, $user->person, [$ministry->roles()->where('name', 'Лидер')->sole()->id]);

    $this->postJson('/api/v1/announcements', churchAnnouncement())->assertForbidden();
});

it('requires a ministry for the ministry scope', function () {
    actingAsUserWith([Permission::MinistriesManageAll]);

    $this->postJson('/api/v1/announcements', churchAnnouncement(['scope' => 'ministry']))
        ->assertStatus(422)->assertJsonValidationErrors('ministry_id');
});

it('cleans the body on save', function () {
    actingAsUserWith([Permission::AnnouncementsChurchPublish]);

    $this->postJson('/api/v1/announcements', churchAnnouncement(['body' => 'Привет <img src=x onerror=alert(1)> [x](javascript:1)']))
        ->assertCreated()
        ->assertJsonPath('data.body', 'Привет  [x]()');
});

it('stores pinned and hide_after', function () {
    actingAsUserWith([Permission::AnnouncementsChurchPublish]);

    $this->postJson('/api/v1/announcements', churchAnnouncement(['pinned' => true, 'hide_after' => '2026-12-31']))
        ->assertCreated()
        ->assertJsonPath('data.pinned', true)
        ->assertJsonPath('data.hide_after', '2026-12-31');
});

it('lets the author edit their own announcement even without the permission any more', function () {
    $person = Person::factory()->create();
    $user = actingAsUserWith([Permission::AnnouncementsChurchPublish], $person);
    $announcement = Announcement::factory()->create(['author_user_id' => $user->id]);
    $person->globalRoles()->detach();
    app(\App\Modules\Access\PermissionCache::class)->bump($user->id);

    $this->patchJson("/api/v1/announcements/{$announcement->id}", ['title' => 'Новое название'])
        ->assertOk()->assertJsonPath('data.title', 'Новое название');
});

it('lets a publisher edit someone elses announcement in scope', function () {
    actingAsUserWith([Permission::AnnouncementsChurchPublish]);
    $announcement = Announcement::factory()->create();

    $this->patchJson("/api/v1/announcements/{$announcement->id}", ['body' => 'Изменено'])->assertOk();
});

it('denies editing to a plain reader', function () {
    actingAsUser();
    $announcement = Announcement::factory()->create();

    $this->patchJson("/api/v1/announcements/{$announcement->id}", ['body' => 'Изменено'])->assertForbidden();
});

it('refuses to edit an archived announcement', function () {
    actingAsUserWith([Permission::AnnouncementsChurchPublish]);
    $announcement = Announcement::factory()->archived()->create();

    $this->patchJson("/api/v1/announcements/{$announcement->id}", ['body' => 'Изменено'])
        ->assertStatus(422)->assertJsonPath('code', 'announcement.archived');
});

it('publishes the domain event once and not on edit', function () {
    Event::fake([AnnouncementPublished::class]);
    actingAsUserWith([Permission::AnnouncementsChurchPublish]);

    $id = $this->postJson('/api/v1/announcements', churchAnnouncement())->json('data.id');
    $this->patchJson("/api/v1/announcements/{$id}", ['title' => 'Другое']);

    Event::assertDispatchedTimes(AnnouncementPublished::class, 1);
});
```

- [x] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Unit/Announcements tests/Feature/Announcements/AnnouncementPublishTest.php`
Ожидается: FAIL.

- [x] **Шаг 3: Ключи прав**

В `Permission` добавить два случая с областью, названием и описанием из раздела 6.1:

```php
case AnnouncementsChurchPublish = 'announcements.church.publish';
case AnnouncementsPublish = 'announcements.publish';
```

`scope()`: `AnnouncementsPublish` → `PermissionScope::Ministry`. `label()`: «Публиковать объявления церкви», «Объявления служения». `description()`: «Публикация, правка, закрепление и архивация церковных объявлений.», «Публикация, правка, закрепление и архивация объявлений служения.». `PermissionCoverageTest` перебирает каталог: для каждого нового ключа добавить отдельный сценарий запросов с правом и без права в соответствующей области. Обновить точный снимок каталога в `PermissionCatalogTest`. Существующим ролям новые права автоматически не выдаются.

- [x] **Шаг 4: Миграция**

```php
Schema::create('announcements', function (Blueprint $table) {
    $table->char('id', 26)->primary();
    $table->string('scope', 16);
    $table->char('ministry_id', 26)->nullable();
    $table->char('author_user_id', 26)->nullable();      // null после стирания автора
    $table->string('title', 200);
    $table->text('body');
    $table->timestampTz('pinned_at')->nullable();
    $table->date('hide_after')->nullable();
    $table->boolean('notify_on_publish')->default(true);
    $table->timestampTz('published_at');
    $table->timestampTz('archived_at')->nullable();
    $table->timestampsTz();

    $table->foreign('ministry_id')->references('id')->on('ministries')->restrictOnDelete();
    $table->foreign('author_user_id')->references('id')->on('users')->restrictOnDelete();
    $table->index(['scope', 'ministry_id', 'published_at']);
});

DB::statement("ALTER TABLE announcements ADD CONSTRAINT announcements_scope_check
    CHECK ((scope = 'church' AND ministry_id IS NULL) OR (scope = 'ministry' AND ministry_id IS NOT NULL))");

Schema::create('announcement_views', function (Blueprint $table) {
    $table->char('announcement_id', 26);
    $table->char('user_id', 26);
    $table->timestampTz('viewed_at');
    $table->primary(['announcement_id', 'user_id']);
    $table->foreign('announcement_id')->references('id')->on('announcements')->restrictOnDelete();
    $table->foreign('user_id')->references('id')->on('users')->restrictOnDelete();
});
```

Стирание автора: `AnnouncementsAccountEraser` (регистрируется тегом `directory.account_erasers`) ставит `author_user_id = null` и удаляет строки `announcement_views` аккаунта.

- [x] **Шаг 5: Очистка Markdown**

`MarkdownCleaner` сохраняет разрешённые Markdown-конструкции, удаляет HTML и изображения (оставляя alt-текст), очищает ссылки с учётом вложенных скобок и reference-ссылок. Допускаются `http`, `https`, `mailto`, `tel` и относительные пути, включая `../`; прочие схемы нейтрализуются. Простой шаблон до первой закрывающей скобки для этого недостаточен.

- [x] **Шаг 6: Actions, политика, эндпоинты**

`AnnouncementPublished` реализует Laravel `ShouldDispatchAfterCommit`: событие доставляется после commit внешней транзакции, при rollback не доставляется. Отдельный тест с `DatabaseMigrations` и реальным слушателем проверяет внешний commit/rollback без обёртки `RefreshDatabase`.

`PublishAnnouncement`:

```php
final class PublishAnnouncement
{
    public function __construct(private readonly MarkdownCleaner $cleaner) {}

    /** @param array<string, mixed> $attributes */
    public function handle(User $author, array $attributes): Announcement
    {
        $announcement = Announcement::query()->create([
            'scope' => $attributes['scope'],
            'ministry_id' => $attributes['ministry_id'] ?? null,
            'author_user_id' => $author->id,
            'title' => $attributes['title'],
            'body' => $this->cleaner->clean($attributes['body']),
            'pinned_at' => ($attributes['pinned'] ?? false) ? now() : null,
            'hide_after' => $attributes['hide_after'] ?? null,
            'notify_on_publish' => $attributes['notify_on_publish'] ?? true,
            'published_at' => now(),
        ]);

        AnnouncementPublished::dispatch($announcement->id);

        return $announcement;
    }
}
```

`UpdateAnnouncement` бросает `announcement.archived`, чистит `body`, переводит `pinned` в `pinned_at`, событий не публикует. `AnnouncementPolicy::create(User $user, AnnouncementScope $scope, ?string $ministryId)`: `church` → `can(AnnouncementsChurchPublish)`, `ministry` → `canInMinistry(AnnouncementsPublish, $ministryId)`. `update`: та же проверка по области объявления или `author_user_id === $user->id`. `OpenApi/AnnouncementRequestSchema` уточняет выведенную Scramble схему: условную обязательность `ministry_id` при публикации и запрет изменения области при правке; схема ресурса сохраняет enum области и форматы UTC/date. Регенерировать `openapi.json` и `apps/web/types/api.d.ts`.

`StoreAnnouncementRequest`: `scope` — `required|in:church,ministry`, `ministry_id` — `required_if:scope,ministry|prohibited_if:scope,church|ulid|exists:ministries,id`, `title` — `required|string|max:200`, `body` — `required|string|max:20000`, `pinned` — `boolean`, `hide_after` — `nullable|date_format:Y-m-d`, `notify_on_publish` — `boolean`, `media_ids` — `array` (обрабатывает задача 7).

- [x] **Шаг 7: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Unit/Announcements tests/Feature/Announcements tests/Feature/Access/PermissionCoverageTest.php`
Ожидается: PASS, покрытие ключей не нарушено.

- [x] **Шаг 8: Коммит**

```bash
composer openapi && git add . && git commit -m "feat(announcements): tables, publishing, editing, markdown cleaning and permissions"
```

**Критерии готовности:**
- Оба новых ключа права закрыты тестами «без права запрещено, с правом разрешено» в своей области; право служения не даёт публиковать церковные объявления.
- Автор правит своё объявление, даже потеряв право публикации (раздел 6.4).
- Тело очищается при сохранении: скрипты и опасные схемы не доживают до базы (раздел 7.5).
- `AnnouncementPublished` уходит один раз после внешнего commit при публикации, не уходит при rollback и никогда при правке — на это опираются задачи 7–8.
- Стирание автора не ломает объявления: `author_user_id` становится `null`.

---
### Задача 6: Список, видимость, просмотры, закрепление, архивация

**Файлы:**
- Создать: `app/Modules/Announcements/AnnouncementVisibility.php`; `Http/Queries/AnnouncementIndexQuery.php`; `Http/Requests/IndexAnnouncementRequest.php`; `Actions/PinAnnouncement.php`, `Actions/UnpinAnnouncement.php`, `Actions/ArchiveAnnouncement.php`, `Actions/RecordAnnouncementView.php`
- Изменить: `AnnouncementController` (`index`, `show`, `pin`, `unpin`, `archive`), `AnnouncementPolicy` (`view`), `AnnouncementResource` (`views_count`), `routes.php`
- Тест: `tests/Feature/Announcements/AnnouncementIndexTest.php`, `tests/Feature/Announcements/AnnouncementVisibilityTest.php`

**Интерфейсы:**
- Отдаёт наружу: `GET /announcements?scope=church|ministry&ministry={id}&page&per_page` — постраничная, закреплённые первыми, затем по `published_at` убыв.; скрыты архивные и с прошедшей `hide_after`.
- Отдаёт наружу: `GET /announcements/{id}` — фиксирует просмотр; `POST /announcements/{id}/pin`, `POST /announcements/{id}/unpin`, `POST /announcements/{id}/archive`.
- Отдаёт наружу: `AnnouncementVisibility::canSee(User $viewer, Announcement $announcement): bool` — `church` видят все; `ministry` — участники, `ministries.view_all`, автор и носители права публикации (в том числе `ministries.manage_all` через резолвер); архивное — только те, кто может править. Используется политикой и резолвером владельца медиафайла (задача 7).
- Отдаёт наружу: `AnnouncementResource` условно добавляет `views_count` для тех, кто может править.

- [x] **Шаг 1: Написать падающие тесты**

`tests/Feature/Announcements/AnnouncementIndexTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use App\Modules\Announcements\Models\Announcement;
use App\Modules\Settings\ChurchSettings;
use Illuminate\Support\Carbon;

it('shows church announcements to any account', function () {
    actingAsUser();
    Announcement::factory()->count(2)->create();

    $this->getJson('/api/v1/announcements')->assertOk()->assertJsonCount(2, 'data');
});

it('puts pinned announcements first, then newest', function () {
    actingAsUser();
    $old = Announcement::factory()->create(['published_at' => now()->subDays(2)]);
    $new = Announcement::factory()->create(['published_at' => now()->subDay()]);
    $pinned = Announcement::factory()->pinned()->create(['published_at' => now()->subDays(5)]);

    $ids = collect($this->getJson('/api/v1/announcements')->json('data'))->pluck('id')->all();

    expect($ids)->toBe([$pinned->id, $new->id, $old->id]);
});

it('hides announcements past hide_after', function () {
    actingAsUser();
    Announcement::factory()->hiddenAfter(now()->subDay()->toDateString())->create();
    $visible = Announcement::factory()->hiddenAfter(now()->addDay()->toDateString())->create();

    $ids = collect($this->getJson('/api/v1/announcements')->json('data'))->pluck('id')->all();

    expect($ids)->toEqual([$visible->id]);
});

it('judges hide_after by the church calendar, not utc', function () {
    app(ChurchSettings::class)->put(['church.timezone' => 'Pacific/Auckland']);
    Carbon::setTestNow('2026-10-01 11:30:00'); // в Окленде уже 2 октября
    actingAsUser();
    Announcement::factory()->hiddenAfter('2026-10-01')->create();

    $this->getJson('/api/v1/announcements')->assertOk()->assertJsonCount(0, 'data');
});

it('hides archived announcements from the list', function () {
    actingAsUser();
    Announcement::factory()->archived()->create();

    $this->getJson('/api/v1/announcements')->assertOk()->assertJsonCount(0, 'data');
});

it('filters by scope and ministry', function () {
    $ministry = ministryWithRoles();
    $other = ministryWithRoles('Молодёжное');
    actingAsUserWith([Permission::MinistriesViewAll]);
    Announcement::factory()->create();
    $mine = Announcement::factory()->ministry($ministry)->create();
    Announcement::factory()->ministry($other)->create();

    $ids = collect($this->getJson("/api/v1/announcements?scope=ministry&ministry={$ministry->id}")->json('data'))->pluck('id')->all();

    expect($ids)->toEqual([$mine->id]);
});

it('paginates', function () {
    actingAsUser();
    Announcement::factory()->count(25)->create();

    $this->getJson('/api/v1/announcements?per_page=10')
        ->assertOk()->assertJsonCount(10, 'data')->assertJsonPath('meta.total', 25);
});
```

`tests/Feature/Announcements/AnnouncementVisibilityTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use App\Modules\Announcements\Models\Announcement;
use App\Modules\Announcements\Models\AnnouncementView;

it('hides a ministry announcement from a non-member', function () {
    $ministry = ministryWithRoles();
    actingAsUser();
    $announcement = Announcement::factory()->ministry($ministry)->create();

    $this->getJson("/api/v1/announcements/{$announcement->id}")->assertForbidden();

    expect(collect($this->getJson('/api/v1/announcements')->json('data'))->pluck('id'))->not->toContain($announcement->id);
});

it('shows a ministry announcement to a member', function () {
    $ministry = ministryWithRoles();
    $user = actingAsUser();
    memberOf($ministry, $user->person);
    $announcement = Announcement::factory()->ministry($ministry)->create();

    $this->getJson("/api/v1/announcements/{$announcement->id}")->assertOk();
});

it('shows a ministry announcement to ministries.view_all', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::MinistriesViewAll]);
    $announcement = Announcement::factory()->ministry($ministry)->create();

    $this->getJson("/api/v1/announcements/{$announcement->id}")->assertOk();
});

it('opens an announcement hidden by date through a direct link', function () {
    actingAsUser();
    $announcement = Announcement::factory()->hiddenAfter('2020-01-01')->create();

    $this->getJson("/api/v1/announcements/{$announcement->id}")->assertOk();
});

it('returns 404 for an archived announcement to a plain reader and opens it to a publisher', function () {
    $announcement = Announcement::factory()->archived()->create();

    actingAsUser();
    $this->getJson("/api/v1/announcements/{$announcement->id}")->assertNotFound();

    actingAsUserWith([Permission::AnnouncementsChurchPublish]);
    $this->getJson("/api/v1/announcements/{$announcement->id}")->assertOk()->assertJsonPath('data.archived', true);
});

it('records a view once per account', function () {
    $user = actingAsUser();
    $announcement = Announcement::factory()->create();

    $this->getJson("/api/v1/announcements/{$announcement->id}");
    $this->getJson("/api/v1/announcements/{$announcement->id}");

    expect(AnnouncementView::query()->where('user_id', $user->id)->count())->toBe(1);
});

it('shows views_count to a publisher and hides it from a reader', function () {
    $announcement = Announcement::factory()->create();
    actingAsUser();
    $this->getJson("/api/v1/announcements/{$announcement->id}")->assertJsonMissingPath('data.views_count');

    actingAsUserWith([Permission::AnnouncementsChurchPublish]);
    $this->getJson("/api/v1/announcements/{$announcement->id}")->assertJsonPath('data.views_count', 2);
});

it('pins and unpins with the publish permission only', function () {
    $announcement = Announcement::factory()->create();

    actingAsUser();
    $this->postJson("/api/v1/announcements/{$announcement->id}/pin")->assertForbidden();

    actingAsUserWith([Permission::AnnouncementsChurchPublish]);
    $this->postJson("/api/v1/announcements/{$announcement->id}/pin")->assertOk()->assertJsonPath('data.pinned', true);
    $this->postJson("/api/v1/announcements/{$announcement->id}/unpin")->assertOk()->assertJsonPath('data.pinned', false);
});

it('archives and writes to the journal', function () {
    actingAsUserWith([Permission::AnnouncementsChurchPublish]);
    $announcement = Announcement::factory()->create();

    $this->postJson("/api/v1/announcements/{$announcement->id}/archive")->assertOk()->assertJsonPath('data.archived', true);

    expect(\App\Modules\Access\Models\AuditEntry::query()->where('action', 'announcement.archived')->exists())->toBeTrue();
});
```

- [x] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Feature/Announcements`
Ожидается: FAIL, маршрутов `index`, `show`, `pin` нет.

- [x] **Шаг 3: Видимость и список**

```php
final class AnnouncementVisibility
{
    public function __construct(private readonly PermissionResolver $permissions) {}

    public function canSee(User $viewer, Announcement $announcement): bool
    {
        if ($announcement->archived_at !== null) {
            return $this->canManage($viewer, $announcement);
        }

        if ($announcement->scope === AnnouncementScope::Church) {
            return true;
        }

        return $this->permissions->isMember($viewer, $announcement->ministry_id)
            || $this->permissions->can($viewer, Permission::MinistriesViewAll)
            || $this->canManage($viewer, $announcement);
    }

    public function canManage(User $viewer, Announcement $announcement): bool
    {
        if ($announcement->author_user_id === $viewer->id) {
            return true;
        }

        return $announcement->scope === AnnouncementScope::Church
            ? $this->permissions->can($viewer, Permission::AnnouncementsChurchPublish)
            : $this->permissions->canInMinistry($viewer, Permission::AnnouncementsPublish, $announcement->ministry_id);
    }
}
```

`AnnouncementIndexQuery::for(User $viewer, ?string $scope, ?string $ministryId)`:

```php
$today = now(app(ChurchSettings::class)->timezone())->toDateString();

$query = Announcement::query()
    ->whereNull('archived_at')
    ->where(fn ($q) => $q->whereNull('hide_after')->orWhere('hide_after', '>=', $today))
    ->where(function ($q) use ($viewer) {
        $q->where('scope', 'church')->orWhere('author_user_id', $viewer->id);
        $visibleMinistries = $this->visibleMinistryIds($viewer);   // все при view_all/manage_all/администраторе, иначе свои
        if ($visibleMinistries !== null) {
            $q->orWhereIn('ministry_id', $visibleMinistries);
        } else {
            $q->orWhere('scope', 'ministry');
        }
    })
    ->when($scope !== null, fn ($q) => $q->where('scope', $scope))
    ->when($ministryId !== null, fn ($q) => $q->where('ministry_id', $ministryId))
    ->orderByRaw('pinned_at IS NULL')
    ->orderByDesc('pinned_at')
    ->orderByDesc('published_at');
```

`show`: политика `view` → `canSee`; архивное и невидимое читателю → `404` (в `AnnouncementPolicy::view` для архивного возвращать `canManage` и в контроллере `abort_if($announcement->archived_at !== null && ! canManage, 404)`, для активного невидимого — `403`). Затем `RecordAnnouncementView::handle($announcement, $viewer)` — `insertOrIgnore`.

`PinAnnouncement`/`UnpinAnnouncement` ставят и снимают `pinned_at`; `ArchiveAnnouncement` ставит `archived_at` и пишет `AuditLogger::record('announcement.archived', $announcement)`. Все три под политикой `update`.

- [x] **Шаг 4: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Feature/Announcements`
Ожидается: PASS.

- [x] **Шаг 5: Коммит**

```bash
composer openapi && git add . && git commit -m "feat(announcements): list, visibility, views, pinning, archiving"
```

**Уточнения реализации:**

- R1: видимость активных объявлений одинакова в списке и по прямой ссылке; автор сохраняет доступ без участия. Архивные исключены из каждого списка, по прямой ссылке доступны управляющим; `404` читателю проверяется до общего запрета политики.
- Два разных аккаунта, открывшие карточку, дают счётчик 2. `views_count` условен во всех ответах ресурса; прежняя проверка PATCH из задачи 5 обновляется на 0 для управляющего.
- Параметры списка валидируются: scope enum, ministry ULID, page >= 1, per_page 1–100 (по умолчанию 20); несуществующее или невидимое служение даёт пустой список. Архивация и запись журнала атомарны, повторная архивация не дублирует журнал. Ссылки страниц сохраняют фильтры и размер страницы.

**Критерии готовности:**
- Правила видимости раздела 6.4 закрыты тестами: церковные видят все, объявления служения — участники, `ministries.view_all`, автор и носители права публикации; список и прямая ссылка используют одно правило.
- `hide_after` считается по календарю церкви — тест с Оклендом ловит вычисление по UTC.
- Закреплённые идут первыми, затем новые; просмотр фиксируется один раз на аккаунт.
- Архивация — единственная операция с объявлением, которая попадает в журнал (раздел 6.5).
- `views_count` не уходит рядовому читателю.

---

### Задача 7: Вложения объявлений и владелец медиафайла

**Файлы:**
- Создать: `app/Modules/Media/Actions/SyncAttachments.php`; `app/Modules/Announcements/AnnouncementMediaOwnerResolver.php`
- Изменить: `app/Modules/Media/Contracts/MediaOwnerResolver.php` (контракт из решения 3), `app/Modules/Media/MediaAccess.php` (опрос тегированных резолверов), `PublishAnnouncement`, `UpdateAnnouncement` (вызов `SyncAttachments`), `AnnouncementResource` (`attachments`), `Announcement` (`attachments(): MorphMany` через `media_attachments`), `AppServiceProvider` (тег `media.owner_resolvers`)
- Тесты: `tests/Feature/Announcements/AnnouncementAttachmentTest.php`, `AnnouncementAttachmentCommitTest.php`

**Интерфейсы:**
- Отдаёт наружу: `interface MediaOwnerResolver { public function canView(User $viewer, Media $media): ?bool; }` — `null`, если медиафайл не принадлежит объектам модуля.
- Отдаёт наружу: `SyncAttachments::handle(Model $attachable, list<string> $mediaIds, User $uploader): void` — привязывает новые (в порядке списка, `sort_order`), отвязывает и физически удаляет пропавшие. Коды: `media.not_owned`, `media.not_ready`, `media.already_attached`; проверка различности списка. Физическое удаление после внешнего коммита.
- Отдаёт наружу: `POST /announcements` и `PATCH /announcements/{id}` принимают `media_ids: list<ulid>`; `AnnouncementResource.attachments: list<MediaResource>`.
- Потребляет: `Media::factory()`, `MediaResource`, `MediaAccess::canView`, маршрут `media.show` из фазы 1.

- [x] **Шаг 1: Написать падающие тесты**

`tests/Feature/Announcements/AnnouncementAttachmentTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use App\Modules\Announcements\Models\Announcement;
use App\Modules\Directory\Models\User;
use App\Modules\Media\Models\Media;
use App\Modules\Media\Models\MediaAttachment;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;

beforeEach(fn () => Storage::fake('media'));

it('attaches uploaded media on publish in the given order', function () {
    $user = actingAsUserWith([Permission::AnnouncementsChurchPublish]);
    $a = Media::factory()->create(['uploader_user_id' => $user->id]);
    $b = Media::factory()->create(['uploader_user_id' => $user->id, 'kind' => 'file', 'mime' => 'application/pdf']);

    $this->postJson('/api/v1/announcements', [
        'scope' => 'church', 'title' => 'Т', 'body' => 'Б', 'media_ids' => [$b->id, $a->id],
    ])->assertCreated()
        ->assertJsonPath('data.attachments.0.id', $b->id)
        ->assertJsonPath('data.attachments.1.id', $a->id);

    expect(MediaAttachment::query()->count())->toBe(2);
});

it('refuses media uploaded by another account', function () {
    actingAsUserWith([Permission::AnnouncementsChurchPublish]);
    $foreign = Media::factory()->create(['uploader_user_id' => User::factory()->create()->id]);

    $this->postJson('/api/v1/announcements', [
        'scope' => 'church', 'title' => 'Т', 'body' => 'Б', 'media_ids' => [$foreign->id],
    ])->assertStatus(422)->assertJsonPath('code', 'media.not_owned');

    expect(Announcement::query()->count())->toBe(0);
});

it('refuses media already attached elsewhere', function () {
    $user = actingAsUserWith([Permission::AnnouncementsChurchPublish]);
    $media = Media::factory()->create(['uploader_user_id' => $user->id]);
    $this->postJson('/api/v1/announcements', ['scope' => 'church', 'title' => 'Т', 'body' => 'Б', 'media_ids' => [$media->id]]);

    $this->postJson('/api/v1/announcements', ['scope' => 'church', 'title' => 'Т2', 'body' => 'Б', 'media_ids' => [$media->id]])
        ->assertStatus(422)->assertJsonPath('code', 'media.already_attached');
});

it('replaces attachments on edit and deletes the removed files', function () {
    $user = actingAsUserWith([Permission::AnnouncementsChurchPublish]);
    $keep = Media::factory()->create(['uploader_user_id' => $user->id, 'path' => '2026/10/keep.jpg']);
    $drop = Media::factory()->create(['uploader_user_id' => $user->id, 'path' => '2026/10/drop.jpg']);
    Storage::disk('media')->put('2026/10/drop.jpg', 'bytes');
    $id = $this->postJson('/api/v1/announcements', [
        'scope' => 'church', 'title' => 'Т', 'body' => 'Б', 'media_ids' => [$keep->id, $drop->id],
    ])->json('data.id');

    $this->patchJson("/api/v1/announcements/{$id}", ['media_ids' => [$keep->id]])
        ->assertOk()->assertJsonCount(1, 'data.attachments');

    expect(Media::query()->find($drop->id))->toBeNull();
    Storage::disk('media')->assertMissing('2026/10/drop.jpg');
});

it('serves an attachment to someone who can see the announcement', function () {
    $publisher = actingAsUserWith([Permission::AnnouncementsChurchPublish]);
    $media = Media::factory()->create(['uploader_user_id' => $publisher->id]);
    $this->postJson('/api/v1/announcements', ['scope' => 'church', 'title' => 'Т', 'body' => 'Б', 'media_ids' => [$media->id]]);

    actingAsUser();
    $this->get(URL::temporarySignedRoute('media.show', now()->addHour(), ['media' => $media->id]))->assertOk();
});

it('hides an attachment of a ministry announcement from a non-member', function () {
    $ministry = ministryWithRoles();
    $publisher = actingAsUserWith([Permission::MinistriesManageAll]);
    $media = Media::factory()->create(['uploader_user_id' => $publisher->id]);
    $this->postJson('/api/v1/announcements', [
        'scope' => 'ministry', 'ministry_id' => $ministry->id, 'title' => 'Т', 'body' => 'Б', 'media_ids' => [$media->id],
    ])->assertCreated();

    actingAsUser();
    $this->get(URL::temporarySignedRoute('media.show', now()->addHour(), ['media' => $media->id]))->assertForbidden();
});
```

- [x] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Feature/Announcements/AnnouncementAttachmentTest.php`
Ожидается: FAIL.

- [x] **Шаг 3: Контракт владельца и `SyncAttachments`**

Существующий `MediaOwnerResolver::canView(User $user, Media $media): ?bool` и внедрение тега `media.owner_resolvers` сохраняются. `AnnouncementMediaOwnerResolver` возвращает `null`, если нет вложения типа `announcement`, иначе проверяет `AnnouncementVisibility::canSee`; отсутствующий владелец означает отказ. `MediaAccess` допускает возврат к загрузившему только при отсутствии вложений.

`SyncAttachments::handle(Model $attachable, list<string> $mediaIds, User $uploader): void` — единственный Action записи вложений. Порядок:

1. Транзакция и блокировка объекта-владельца, чтение текущих вложений.
2. Общий `Media::lockedFind` для объединения текущих и желаемых ID в стабильном порядке. Весь желаемый список проверяется до изменения связей; повторения запрещены. Новые файлы должны принадлежать загрузившему, иметь `ready` и не использоваться (`MediaUsage` учитывает прямые ссылки). Ошибки `media.not_owned`, `media.not_ready`, `media.already_attached`; сохранённые вложения может оставить и переставить другой уполномоченный редактор.
3. Исчезнувшие связи и строки медиафайлов удаляются внутри транзакции, оригиналы и варианты по `storedPaths()` удаляются через `DB::afterCommit` только после внешнего коммита. Откат не меняет байты.
4. Новые связи создаются, сохранённым обновляется `sort_order` по порядку списка. Конкурирующие прямые привязки/удаления используют ту же блокировку строки медиафайла.

`Announcement::attachments(): MorphMany` возвращает вложения в порядке `sort_order`; ресурс отдаёт `MediaResource` каждого медиафайла, запрос списка загружает `attachments.media`. Морф-имя регистрируется через **необязательную** `Relation::morphMap(['announcement' => Announcement::class])`; глобальный `enforceMorphMap` запрещён: существующие уведомления сохраняют `User` FQCN.

`PublishAnnouncement` и `UpdateAnnouncement` оборачивают сохранение объявления и синхронизацию в одну внешнюю транзакцию. На PATCH отсутствие `media_ids` сохраняет вложения, переданный список полностью заменяет их, пустой удаляет все. FormRequest проверяет `array|list`, а элементы — `ulid|distinct|exists:media,id`. `AnnouncementPublished` сохраняет `ShouldDispatchAfterCommit`: ошибка вложений не вызывает событие, успешная публикация доставляет его только после внешнего коммита.

Тесты дополняют исходные примеры: неготовые/занятые файлы, прямые ссылки, недопустимые списки, сохранение другим редактором, откат названия/связей/байтов, общая блокировка всех ID до записи, видимость скрытых по дате/архивных вложений без обхода для загрузившего. `AnnouncementAttachmentCommitTest` использует `DatabaseMigrations`, а не оборачивающий всё в транзакцию `RefreshDatabase`: доказывает отложенное удаление оригиналов/вариантов при коммите, сохранение при откате и отсутствие события при провале синхронизации.

- [x] **Шаг 4: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Feature/Announcements tests/Feature/Media`
Ожидается: PASS, тесты Media фазы 1 не сломаны.

- [x] **Шаг 5: Коммит**

```bash
composer openapi && git add . && git commit -m "feat(media,announcements): attachments sync and announcement media owner"
```

**Критерии готовности:**
- Файл привязывается только своим загрузчиком и только один раз (раздел 7.8); ошибка откатывает создание объявления целиком.
- Правка с новым списком удаляет пропавшие файлы физически — сироты не ждут ночной очистки.
- Доступ к вложению определяется видимостью объявления (раздел 6.4), через контракт `MediaOwnerResolver`, который фазы 3 и 4 переиспользуют без правки Media.
- `SyncAttachments` — единственная точка привязки вложений для всех модулей.

---

### Задача 8: Рассылка уведомления об объявлении

**Файлы:**
- Создать: `app/Modules/Notifications/Notifications/AnnouncementPublishedNotification.php`; `Listeners/NotifyAboutAnnouncement.php`; `Recipients.php` (выборки адресатов)
- Изменить: `AppServiceProvider` (подписка слушателя на `AnnouncementPublished`)
- Тест: `tests/Feature/Notifications/AnnouncementNotificationTest.php`

**Интерфейсы:**
- Отдаёт наружу: `Recipients::allActive(): LazyCollection<User>`, `Recipients::ministryMembers(string $ministryId): LazyCollection<User>` — активные аккаунты; фаза 3 добавит `Recipients::assignedToEvent(string $eventId)`.
- Отдаёт наружу: `AnnouncementPublishedNotification(Announcement $announcement)` — категория `announcements`, `title` = заголовок объявления, `body` = текст без Markdown-разметки, `url = /announcements/{id}`, `tag = announcement-{id}`.
- Потребляет: `AnnouncementPublished` из задачи 5, `AppNotification` из задачи 3.

- [x] **Шаг 1: Написать падающие тесты**

```php
<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use App\Modules\Announcements\Models\Announcement;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use App\Modules\Notifications\Notifications\AnnouncementPublishedNotification;
use Illuminate\Support\Facades\Notification;

beforeEach(fn () => Notification::fake());

it('notifies every active account about a church announcement', function () {
    $publisher = actingAsUserWith([Permission::AnnouncementsChurchPublish]);
    $others = User::factory()->count(3)->create();

    $this->postJson('/api/v1/announcements', ['scope' => 'church', 'title' => 'Собрание', 'body' => 'В **10:00**']);

    Notification::assertSentTo($others, AnnouncementPublishedNotification::class);
    Notification::assertSentTo($publisher, AnnouncementPublishedNotification::class);
});

it('notifies only members about a ministry announcement', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::MinistriesManageAll]);
    $member = User::factory()->create();
    memberOf($ministry, $member->person);
    $stranger = User::factory()->create();

    $this->postJson('/api/v1/announcements', [
        'scope' => 'ministry', 'ministry_id' => $ministry->id, 'title' => 'Репетиция', 'body' => 'В субботу',
    ]);

    Notification::assertSentTo($member, AnnouncementPublishedNotification::class);
    Notification::assertNotSentTo($stranger, AnnouncementPublishedNotification::class);
});

it('skips disabled accounts and people without accounts', function () {
    actingAsUserWith([Permission::AnnouncementsChurchPublish]);
    $disabled = User::factory()->create(['disabled_at' => now()]);
    Person::factory()->create();

    $this->postJson('/api/v1/announcements', ['scope' => 'church', 'title' => 'Т', 'body' => 'Б']);

    Notification::assertNotSentTo($disabled, AnnouncementPublishedNotification::class);
});

it('sends nothing when notify_on_publish is off', function () {
    actingAsUserWith([Permission::AnnouncementsChurchPublish]);
    User::factory()->create();

    $this->postJson('/api/v1/announcements', ['scope' => 'church', 'title' => 'Т', 'body' => 'Б', 'notify_on_publish' => false]);

    Notification::assertNothingSent();
});

it('does not notify again on edit', function () {
    actingAsUserWith([Permission::AnnouncementsChurchPublish]);
    User::factory()->create();
    $id = $this->postJson('/api/v1/announcements', ['scope' => 'church', 'title' => 'Т', 'body' => 'Б'])->json('data.id');

    $this->patchJson("/api/v1/announcements/{$id}", ['title' => 'Т2']);

    Notification::assertCount(2); // автор и ещё один аккаунт, по одному разу
});

it('carries the category, the tag, the url and a plain-text body', function () {
    $user = actingAsUserWith([Permission::AnnouncementsChurchPublish]);

    $id = $this->postJson('/api/v1/announcements', ['scope' => 'church', 'title' => 'Собрание', 'body' => "# Важно\n\nВ **10:00**"])
        ->json('data.id');

    Notification::assertSentTo($user, AnnouncementPublishedNotification::class, function (AnnouncementPublishedNotification $n) use ($user, $id) {
        $data = $n->toArray($user);

        return $data['category'] === 'announcements'
            && $data['tag'] === "announcement-{$id}"
            && $data['url'] === "/announcements/{$id}"
            && $data['title'] === 'Собрание'
            && $data['body'] === 'Важно В 10:00';
    });
});

it('still sends to an active recipient when the author was erased before the queue ran', function () {
    $recipient = User::factory()->create();
    $announcement = Announcement::factory()->create(['author_user_id' => null]);

    (new \App\Modules\Notifications\Listeners\NotifyAboutAnnouncement())
        ->handle(new \App\Modules\Announcements\Events\AnnouncementPublished($announcement->id));

    Notification::assertSentTo($recipient, AnnouncementPublishedNotification::class);
    Notification::assertCount(1);
});
```

- [x] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Feature/Notifications/AnnouncementNotificationTest.php`
Ожидается: FAIL.

- [x] **Шаг 3: Реализовать**

```php
final class AnnouncementPublishedNotification extends AppNotification
{
    public function __construct(private readonly Announcement $announcement) {}

    public function category(): NotificationCategory { return NotificationCategory::Announcements; }

    public function title(): string { return $this->announcement->title; }

    public function body(): string
    {
        $plain = preg_replace(['/[#*_`>]+/u', '/\[([^\]]*)\]\([^)]*\)/u', '/\s+/u'], ['', '$1', ' '], $this->announcement->body) ?? '';

        return trim($plain);
    }

    public function url(): string { return "/announcements/{$this->announcement->id}"; }

    public function tag(): string { return "announcement-{$this->announcement->id}"; }
}
```

```php
final class NotifyAboutAnnouncement implements ShouldQueue
{
    public function handle(AnnouncementPublished $event): void
    {
        $announcement = Announcement::query()->find($event->announcementId);

        if ($announcement === null || ! $announcement->notify_on_publish || $announcement->archived_at !== null) {
            return;
        }

        $recipients = $announcement->scope === AnnouncementScope::Church
            ? app(Recipients::class)->allActive()
            : app(Recipients::class)->ministryMembers($announcement->ministry_id);

        $recipients->chunk(200)->each(
            fn ($chunk) => Notification::send($chunk->all(), new AnnouncementPublishedNotification($announcement))
        );
    }
}
```

`Recipients::allActive()` — аккаунты без `users.disabled_at` со связанным неархивным человеком (`whereHas('person', ...)`), затем `lazy()`; `ministryMembers` добавляет `join ministry_members` по `person_id`, фильтр `ministry_id` и `select('users.*')`, чтобы идентификатор участия не подменял идентификатор аккаунта.

Уточнение реализации задачи 8: тело переводится из Markdown через существующий CommonMark (`Str::markdown`), затем из HTML в текст с декодированием сущностей и нормализацией пробелов. Это сохраняет подписи ссылок со вложенными скобками и убирает маркеры списков. Ленивый chunk материализуется через `all()` только для текущих 200 адресатов: Laravel Notification принимает массив или обычную Collection.

- [x] **Шаг 4: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Feature/Notifications tests/Feature/Announcements`
Ожидается: PASS.

- [x] **Шаг 5: Проверить очередь вручную**

Локальная воспроизводимая замена ручного шага: `./vendor/bin/pest tests/Feature/Notifications/AnnouncementNotificationQueueTest.php`. Тест публикует через API и обрабатывает настоящую Redis-очередь `task-8-{ULID}` ограниченным `queue:work --queue=... --stop-when-empty --max-time=20`, отдельно от очередей Horizon. Используются только тестовая база, тестовые аккаунты, log broadcast и FakePushTransport.
Ожидается: до внешнего commit очередь пуста, rollback не добавляет задачу; после commit слушатель и задачи каналов выполняются, центр и broadcast получают запись даже при выключенной категории, пуш отправляется только для включённой категории через локальный fake. Production и реальные устройства этим шагом не проверяются.

- [x] **Шаг 6: Коммит**

```bash
git add . && git commit -m "feat(notifications): announcement notifications to church or ministry"
```

**Критерии готовности:**
- Адресаты из таблицы 7.7: все активные аккаунты для `church`, аккаунты участников для `ministry`; отключённые и люди без аккаунта не получают ничего.
- Галочка «уведомить» по умолчанию включена и выключается за один запрос; правка повторной рассылки не даёт (раздел 7.5).
- Текст пуша — без Markdown-разметки, тег `announcement-{id}` сворачивает повторы.
- Рассылка идёт чанками через очередь: публикация церковного объявления на 300 аккаунтов не держит HTTP-запрос.

---
## Блок 3. Клиент

Правила фазы 1 сохраняются: Vitest через `@nuxt/test-utils/runtime`, `mountSuspended`, `mockNuxtImport`; права на клиенте только прячут кнопки.

### Задача 9: Дата церкви, Echo, store и центр уведомлений, настройки категорий

**Файлы:**
- Создать: `apps/web/app/composables/useChurchDate.ts`, `useEcho.ts`; `app/plugins/echo.client.ts`; `app/stores/settings.ts`, `app/stores/notifications.ts`; `app/pages/notifications.vue`, `app/pages/settings/notifications.vue`; `app/components/notifications/NotificationList.vue`
- Изменить: `app/components/AppNav.vue` (пункт «Уведомления» с бейджем), `app/stores/auth.ts` (после `fetchMe`/`login` — подписка на канал, при `logout` — отписка), `nuxt.config.ts` (`/broadcasting/**` в прокси `routeRules`, рядом с `/api/**` и `/sanctum/**`), `package.json` (`laravel-echo`, `pusher-js`)
- Тест: `tests/unit/useChurchDate.spec.ts`, `tests/unit/notifications.store.spec.ts`, `tests/component/notifications.spec.ts`

**Интерфейсы:**
- Отдаёт наружу: `useChurchDate()` → `{ formatDate(iso: string): string, formatTime(iso: string): string, formatDateTime(iso: string): string, todayInChurch(): string }` — форматирование через `Intl.DateTimeFormat('ru-RU', { timeZone })`, пояс из `useSettingsStore().timezone`.
- Отдаёт наружу: `useSettingsStore()` с `churchName`, `timezone`, `vapidPublicKey`, `reverbKey`, `fetch()` (`GET /settings`).
- Отдаёт наружу: `useEcho()` → экземпляр Laravel Echo (`broadcaster: 'reverb'`) на источнике страницы (решение 15), авторизация через `useApi().post('/broadcasting/auth')`, чтобы уходили cookie и CSRF.
- Отдаёт наружу: `useNotificationsStore()` с `items`, `unreadCount`, `nextCursor`, `fetch(reset?)`, `markRead(ids)`, `markAllRead()`, `subscribe(userId)`, `unsubscribe()`, `push(notification)` — последнее вызывается из события `notification.created`.
- Потребляет: `GET /notifications`, `POST /notifications/read`, `GET /notification-settings`, `PUT /notification-settings`, `GET /settings`.

- [ ] **Шаг 1: Написать падающие тесты**

`tests/unit/useChurchDate.spec.ts`:

```ts
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { churchDateFormatter } from '~/app/composables/useChurchDate'

describe('churchDateFormatter', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('formats in the church timezone, not the device one', () => {
    const f = churchDateFormatter('Asia/Vladivostok')
    expect(f.formatTime('2026-10-01T01:30:00Z')).toBe('11:30')
    expect(f.formatDate('2026-10-01T15:30:00Z')).toBe('2 окт. 2026 г.')
  })

  it('formats date and time together', () => {
    const f = churchDateFormatter('Europe/Moscow')
    expect(f.formatDateTime('2026-10-01T07:05:00Z')).toBe('1 окт. 2026 г., 10:05')
  })

  it('knows the church today', () => {
    const f = churchDateFormatter('Pacific/Auckland', () => new Date('2026-10-01T11:30:00Z'))
    expect(f.todayInChurch()).toBe('2026-10-02')
  })
})
```

`tests/unit/notifications.store.spec.ts`:

```ts
import { createPinia, setActivePinia } from 'pinia'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useNotificationsStore } from '~/app/stores/notifications'

const get = vi.fn()
const post = vi.fn()
const listen = vi.fn()
const notification = vi.fn()
const leave = vi.fn()

mockNuxtImport('useApi', () => () => ({ get, post }))
mockNuxtImport('useEcho', () => () => ({
  private: () => ({ notification, listen }),
  leave,
}))

const entry = (id: string, read: string | null = null) => ({
  id, category: 'announcements', title: 'Т', body: 'Б', url: `/announcements/${id}`, read_at: read, created_at: '2026-10-01T10:00:00Z',
})

beforeEach(() => {
  setActivePinia(createPinia())
  ;[get, post, listen, notification, leave].forEach(fn => fn.mockReset())
})

describe('notifications store', () => {
  it('loads the first page with the unread count', async () => {
    get.mockResolvedValue({ data: [entry('a'), entry('b', '2026-10-01T11:00:00Z')], next_cursor: 'c2', meta: { unread_count: 1 } })

    const store = useNotificationsStore()
    await store.fetch(true)

    expect(store.items).toHaveLength(2)
    expect(store.unreadCount).toBe(1)
    expect(store.nextCursor).toBe('c2')
  })

  it('appends the next page by cursor', async () => {
    get.mockResolvedValueOnce({ data: [entry('a')], next_cursor: 'c2', meta: { unread_count: 1 } })
      .mockResolvedValueOnce({ data: [entry('b')], next_cursor: null, meta: { unread_count: 1 } })

    const store = useNotificationsStore()
    await store.fetch(true)
    await store.fetch()

    expect(get).toHaveBeenLastCalledWith('/notifications', { cursor: 'c2' })
    expect(store.items.map(i => i.id)).toEqual(['a', 'b'])
  })

  it('marks read optimistically and takes the server count', async () => {
    get.mockResolvedValue({ data: [entry('a'), entry('b')], next_cursor: null, meta: { unread_count: 2 } })
    post.mockResolvedValue({ unread_count: 1 })

    const store = useNotificationsStore()
    await store.fetch(true)
    await store.markRead(['a'])

    expect(post).toHaveBeenCalledWith('/notifications/read', { ids: ['a'] })
    expect(store.items[0]!.read_at).not.toBeNull()
    expect(store.unreadCount).toBe(1)
  })

  it('prepends a live notification and bumps the counter', async () => {
    get.mockResolvedValue({ data: [entry('a')], next_cursor: null, meta: { unread_count: 0 } })

    const store = useNotificationsStore()
    await store.fetch(true)
    store.subscribe('u1')
    const handler = notification.mock.calls[0]![0] as (n: unknown) => void
    handler(entry('live'))

    expect(store.items[0]!.id).toBe('live')
    expect(store.unreadCount).toBe(1)
  })

  it('leaves the channel on unsubscribe', () => {
    const store = useNotificationsStore()
    store.subscribe('u1')
    store.unsubscribe()

    expect(leave).toHaveBeenCalledWith('user.u1')
  })
})
```

`tests/component/notifications.spec.ts`:

```ts
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import NotificationsPage from '~/app/pages/notifications.vue'
import NotificationSettingsPage from '~/app/pages/settings/notifications.vue'

const get = vi.fn()
const post = vi.fn()
const put = vi.fn()
const push = vi.fn()

mockNuxtImport('useApi', () => () => ({ get, post, put }))
mockNuxtImport('useRouter', () => () => ({ push }))

beforeEach(() => {
  [get, post, put, push].forEach(fn => fn.mockReset())
})

describe('notification center', () => {
  it('renders items and marks one read on click, then navigates', async () => {
    get.mockResolvedValue({
      data: [{ id: 'n1', category: 'announcements', title: 'Собрание', body: 'В 10:00', url: '/announcements/a1', read_at: null, created_at: '2026-10-01T10:00:00Z' }],
      next_cursor: null,
      meta: { unread_count: 1 },
    })
    post.mockResolvedValue({ unread_count: 0 })

    const page = await mountSuspended(NotificationsPage)
    expect(page.text()).toContain('Собрание')

    await page.find('[data-test="notification-n1"]').trigger('click')
    await new Promise(resolve => setTimeout(resolve))

    expect(post).toHaveBeenCalledWith('/notifications/read', { ids: ['n1'] })
    expect(push).toHaveBeenCalledWith('/announcements/a1')
  })

  it('offers to mark everything read only when something is unread', async () => {
    get.mockResolvedValue({ data: [], next_cursor: null, meta: { unread_count: 0 } })

    const page = await mountSuspended(NotificationsPage)

    expect(page.find('[data-test="mark-all-read"]').exists()).toBe(false)
  })

  it('shows an empty state', async () => {
    get.mockResolvedValue({ data: [], next_cursor: null, meta: { unread_count: 0 } })

    const page = await mountSuspended(NotificationsPage)

    expect(page.text()).toContain('Уведомлений пока нет')
  })
})

describe('notification settings', () => {
  it('lists categories and sends a single toggle', async () => {
    get.mockResolvedValue({ data: [
      { category: 'announcements', label: 'Объявления', enabled: true },
      { category: 'reminders', label: 'Напоминания', enabled: true },
    ] })
    put.mockResolvedValue({ data: [] })

    const page = await mountSuspended(NotificationSettingsPage)
    await page.find('[data-test="category-reminders"]').setValue(false)
    await new Promise(resolve => setTimeout(resolve))

    expect(put).toHaveBeenCalledWith('/notification-settings', { settings: { reminders: false } })
  })
})
```

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `npm run test`
Ожидается: FAIL.

- [ ] **Шаг 3: Дата церкви и настройки**

```ts
// app/composables/useChurchDate.ts
export function churchDateFormatter(timeZone: string, now: () => Date = () => new Date()) {
  const date = new Intl.DateTimeFormat('ru-RU', { timeZone, day: 'numeric', month: 'short', year: 'numeric' })
  const time = new Intl.DateTimeFormat('ru-RU', { timeZone, hour: '2-digit', minute: '2-digit' })
  const iso = new Intl.DateTimeFormat('sv-SE', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })

  return {
    formatDate: (value: string) => date.format(new Date(value)),
    formatTime: (value: string) => time.format(new Date(value)),
    formatDateTime: (value: string) => `${date.format(new Date(value))}, ${time.format(new Date(value))}`,
    todayInChurch: () => iso.format(now()),
  }
}

export function useChurchDate() {
  const settings = useSettingsStore()
  return churchDateFormatter(settings.timezone)
}
```

`useSettingsStore` загружается один раз после входа (в `auth.fetchMe` и `auth.login`) и держит `timezone` со значением по умолчанию `'UTC'` до ответа.

- [ ] **Шаг 4: Echo и store уведомлений**

```bash
cd apps/web && npm i laravel-echo pusher-js
```

`app/plugins/echo.client.ts` создаёт `new Echo({ broadcaster: 'reverb', key, wsHost, wsPort, wssPort, forceTLS: scheme === 'https', enabledTransports: ['ws', 'wss'], authorizer: (channel) => ({ authorize: (socketId, callback) => useApi().post('/broadcasting/auth', { socket_id: socketId, channel_name: channel.name }).then(r => callback(null, r)).catch(e => callback(e, null)) }) })` и отдаёт его через `provide('echo')`; `useEcho()` возвращает его. Адрес — источник страницы (решение 15): `wsHost = location.hostname`, `wsPort` и `wssPort` — `location.port` или порт схемы по умолчанию (80, 443), `scheme = location.protocol === 'https:' ? 'https' : 'http'`, путь Echo по умолчанию — `/app`. `key` — `useSettingsStore().reverbKey`, поэтому Echo создаётся после загрузки настроек. `runtimeConfig` и переменных `NUXT_PUBLIC_REVERB_*` нет. В `nuxt.config.ts` в `routeRules` добавляется `'/broadcasting/**': { proxy: \`${apiProxyTarget}/broadcasting/**\` }`: авторизация каналов в dev и в сквозных тестах идёт тем же прокси, что `/api`.

Store: `subscribe(userId)` — `echo.private(\`user.${userId}\`).notification(n => push(n))`; `unsubscribe()` — `echo.leave(\`user.${userId}\`)`. `push` добавляет в начало, увеличивает `unreadCount`, дубликаты по `id` отбрасывает. Auth store вызывает `subscribe` после успешного `fetchMe`/`login` и `unsubscribe` в `logout`.

`AppNav`: пункт «Уведомления» с бейджем `unreadCount` (скрыт при нуле). Даты в центре, в журнале и везде дальше — через `useChurchDate`.

- [ ] **Шаг 5: Запустить тесты, убедиться что проходят**

Выполнить: `npm run test && npm run typecheck && npm run lint`
Ожидается: PASS.

- [ ] **Шаг 6: Проверить вручную**

Выполнить: `make up`, `npm run dev`, войти в двух вкладках разными аккаунтами, опубликовать объявление из первой.
Ожидается: во второй вкладке бейдж увеличивается без перезагрузки, в центре появляется запись.

- [ ] **Шаг 7: Коммит**

```bash
git add apps/web && git commit -m "feat(web): church date formatter, echo, notification center and category settings"
```

**Критерии готовности:**
- Все даты форматируются в часовом поясе церкви одним composable, покрытым тестом с поясом, отличным от UTC.
- Бейдж непрочитанного обновляется по WebSocket без опроса; после выхода канал покидается.
- Клик по уведомлению отмечает его прочитанным и ведёт по `url`.
- Настройка категории отправляет ровно одну изменённую категорию.

---

### Задача 10: Пуши на клиенте — подписка, service worker, отписка при выходе

**Файлы:**
- Создать: `apps/web/app/composables/usePush.ts`; `app/sw/handlers.ts` (чистые функции для тестов); `app/components/notifications/EnableNotificationsButton.vue`
- Изменить: `apps/web/app/sw.ts` (обработчики `push` и `notificationclick`), `app/stores/auth.ts` (`logout` сначала отписывает устройство), `app/pages/notifications.vue` и `app/pages/settings/notifications.vue` (кнопка и подсказки)
- Тест: `tests/unit/usePush.spec.ts`, `tests/unit/sw-handlers.spec.ts`, `tests/component/enable-notifications.spec.ts`

**Интерфейсы:**
- Отдаёт наружу: `usePush()` → `{ supported: boolean, permission: Ref<NotificationPermission | 'unsupported'>, subscribed: Ref<boolean>, subscribe(): Promise<void>, unsubscribe(): Promise<void> }`; чистые `urlBase64ToUint8Array(key: string): Uint8Array` и `subscriptionPayload(sub: PushSubscriptionJSON)`.
- Отдаёт наружу: `app/sw/handlers.ts` — `notificationOptions(payload: PushPayload): NotificationOptions & { title: string }` и `pickWindow(clients: WindowLike[], url: string): WindowLike | null`.
- Потребляет: `POST /push-subscriptions`, `DELETE /push-subscriptions`, `useSettingsStore().vapidPublicKey`, `InstallPrompt` фазы 1 (определение standalone).

- [ ] **Шаг 1: Написать падающие тесты**

`tests/unit/usePush.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { subscriptionPayload, urlBase64ToUint8Array } from '~/app/composables/usePush'

describe('push helpers', () => {
  it('decodes a url-safe base64 vapid key', () => {
    expect(Array.from(urlBase64ToUint8Array('BAEC_-8'))).toEqual([4, 1, 2, 255, 239])
  })

  it('maps a browser subscription to the api body', () => {
    const payload = subscriptionPayload({
      endpoint: 'https://push.example/x',
      expirationTime: null,
      keys: { p256dh: 'P', auth: 'A' },
    })

    expect(payload).toEqual({ endpoint: 'https://push.example/x', keys: { p256dh: 'P', auth: 'A' }, content_encoding: 'aes128gcm' })
  })
})
```

`tests/unit/sw-handlers.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { notificationOptions, pickWindow } from '~/app/sw/handlers'

describe('service worker handlers', () => {
  it('builds notification options from the push payload', () => {
    const options = notificationOptions({ title: 'Собрание', body: 'В 10:00', tag: 'announcement-a1', url: '/announcements/a1', icon: '/icons/icon-192.png' })

    expect(options.title).toBe('Собрание')
    expect(options.tag).toBe('announcement-a1')
    expect(options.data).toEqual({ url: '/announcements/a1' })
    expect(options.renotify).toBe(true)
  })

  it('falls back to a generic title and the root url', () => {
    const options = notificationOptions({})
    expect(options.title).toBe('Церковь')
    expect(options.data).toEqual({ url: '/' })
  })

  it('prefers an open window over opening a new one', () => {
    const focused = { url: 'https://church.test/people', focus: vi.fn(), navigate: vi.fn() }
    expect(pickWindow([focused], '/announcements/a1')).toBe(focused)
    expect(pickWindow([], '/announcements/a1')).toBeNull()
  })
})
```

`tests/component/enable-notifications.spec.ts`:

```ts
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import EnableNotificationsButton from '~/app/components/notifications/EnableNotificationsButton.vue'

const subscribe = vi.fn()
const state = { supported: true, permission: ref<NotificationPermission | 'unsupported'>('default'), subscribed: ref(false), subscribe, unsubscribe: vi.fn() }
const platform = { isIos: false, isStandalone: true }

mockNuxtImport('usePush', () => () => state)
mockNuxtImport('usePlatform', () => () => platform)

beforeEach(() => {
  subscribe.mockReset()
  state.permission.value = 'default'
  state.subscribed.value = false
  platform.isIos = false
  platform.isStandalone = true
})

describe('enable notifications button', () => {
  it('asks for permission only on click', async () => {
    const button = await mountSuspended(EnableNotificationsButton)
    expect(subscribe).not.toHaveBeenCalled()

    await button.find('[data-test="enable-push"]').trigger('click')
    expect(subscribe).toHaveBeenCalled()
  })

  it('tells an ios user in safari to install the app first', async () => {
    platform.isIos = true
    platform.isStandalone = false

    const button = await mountSuspended(EnableNotificationsButton)

    expect(button.text()).toContain('экран «Домой»')
    expect(button.find('[data-test="enable-push"]').exists()).toBe(false)
  })

  it('explains a denied permission', async () => {
    state.permission.value = 'denied'

    const button = await mountSuspended(EnableNotificationsButton)

    expect(button.text()).toContain('запрещены в настройках')
  })

  it('shows the subscribed state', async () => {
    state.subscribed.value = true
    state.permission.value = 'granted'

    const button = await mountSuspended(EnableNotificationsButton)

    expect(button.text()).toContain('Уведомления включены')
  })
})
```

`usePlatform()` — маленький composable с `isIos`, `isStandalone`, выделенный из `InstallPrompt` фазы 1, чтобы оба компонента определяли платформу одинаково.

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `npm run test`
Ожидается: FAIL.

- [ ] **Шаг 3: Service worker**

`app/sw/handlers.ts`:

```ts
export interface PushPayload { title?: string, body?: string, icon?: string, tag?: string, url?: string }
export interface WindowLike { url: string, focus: () => unknown, navigate: (url: string) => unknown }

export function notificationOptions(payload: PushPayload) {
  return {
    title: payload.title ?? 'Церковь',
    body: payload.body ?? '',
    icon: payload.icon ?? '/icons/icon-192.png',
    tag: payload.tag,
    renotify: true,
    data: { url: payload.url ?? '/' },
  }
}

export function pickWindow(clients: WindowLike[], _url: string): WindowLike | null {
  return clients[0] ?? null
}
```

`app/sw.ts` (дополнение к предкешу фазы 1):

```ts
import { notificationOptions, pickWindow } from './sw/handlers'

declare const self: ServiceWorkerGlobalScope

self.addEventListener('push', (event) => {
  const payload = (() => { try { return event.data?.json() ?? {} } catch { return {} } })()
  const { title, ...options } = notificationOptions(payload)
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url: string = event.notification.data?.url ?? '/'
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    const existing = pickWindow(clients as unknown as WindowLike[], url)
    if (existing) {
      existing.navigate(url)
      return existing.focus()
    }
    return self.clients.openWindow(url)
  }))
})
```

- [ ] **Шаг 4: Подписка и отписка**

`usePush().subscribe()`: `Notification.requestPermission()` → при `granted` `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) })` → `POST /push-subscriptions` с `subscriptionPayload(sub.toJSON())`. `unsubscribe()`: берёт `pushManager.getSubscription()`, шлёт `DELETE /push-subscriptions` с `endpoint`, затем `sub.unsubscribe()`. `subscribed` инициализируется из `getSubscription()` при монтировании. `auth.logout()` вызывает `usePush().unsubscribe()` до `POST /auth/logout` и не падает, если пушей нет.

Кнопка живёт в центре уведомлений (вверху, пока не подписан) и в настройках уведомлений. Разрешение запрашивается только по клику (раздел 10).

- [ ] **Шаг 5: Запустить тесты, убедиться что проходят**

Выполнить: `npm run test && npm run typecheck && npm run build`
Ожидается: PASS; в сборке `sw.js` содержит обработчики `push` и `notificationclick`.

- [ ] **Шаг 6: Проверить на устройствах**

Открыть установленную PWA на iPhone и на Android, нажать «Включить уведомления», закрыть приложение, опубликовать объявление с другого аккаунта.
Ожидается: пуш приходит на оба устройства; нажатие открывает объявление; повторное объявление с тем же тегом не плодит карточки.

- [ ] **Шаг 7: Коммит**

```bash
git add apps/web && git commit -m "feat(web): push subscription flow and service worker notification handlers"
```

**Критерии готовности:**
- Разрешение на уведомления запрашивается только нажатием кнопки; на iOS вне standalone кнопки нет, есть инструкция по установке (риск 2).
- Выход с устройства удаляет его подписку на сервере до завершения сессии (раздел 10).
- Обработчики service worker — чистые функции с тестами; клик по пушу открывает или фокусирует нужный маршрут.
- Пуш реально доставлен на iOS и Android — главный критерий фазы (раздел 13).

---

### Задача 11: Объявления на клиенте — список, карточка, редактор, вкладка служения, главная

**Файлы:**
- Создать: `apps/web/app/pages/announcements/index.vue`, `announcements/[id].vue`, `ministries/[id]/announcements.vue`; `app/components/announcements/AnnouncementCard.vue`, `AnnouncementEditor.vue`, `MarkdownBody.vue`, `PinnedAnnouncements.vue`, `AttachmentList.vue`
- Изменить: `app/pages/index.vue` (блок закреплённых церковных объявлений), `app/components/AppNav.vue` (пункт «Объявления»), `app/pages/ministries/[id]/index.vue` (вкладка), `MediaUploader.vue` (режим «несколько файлов без немедленной привязки»: возвращает `media_id` списком), `package.json` (`marked`, `dompurify`)
- Тест: `tests/component/announcements.spec.ts`, `tests/unit/markdown.spec.ts`

**Интерфейсы:**
- Отдаёт наружу: `renderMarkdown(markdown: string): string` в `app/utils/markdown.ts` — `marked` без HTML + `DOMPurify` с белым списком тегов `p, br, strong, em, a, ul, ol, li, h1–h4, blockquote`.
- Отдаёт наружу: `AnnouncementEditor` с props `scope: 'church' | 'ministry'`, `ministryId?: string`, `announcement?: Announcement`; события `saved`.
- Отдаёт наружу: `MediaUploader` в режиме `multiple` с `v-model:mediaIds`.
- Потребляет: все эндпоинты `Announcements` из задач 5–7, `POST /media` с `purpose = announcement`.

- [ ] **Шаг 1: Написать падающие тесты**

`tests/unit/markdown.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '~/app/utils/markdown'

describe('renderMarkdown', () => {
  it('renders the allowed subset', () => {
    const html = renderMarkdown('# Заголовок\n\n**жирный** и *курсив*\n\n- пункт\n\n[ссылка](https://x.test)')
    expect(html).toContain('<h1>Заголовок</h1>')
    expect(html).toContain('<strong>жирный</strong>')
    expect(html).toContain('<li>пункт</li>')
    expect(html).toContain('href="https://x.test"')
  })

  it('drops scripts and event handlers even if the server missed them', () => {
    const html = renderMarkdown('<script>alert(1)</script><img src=x onerror=alert(1)> текст')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('onerror')
  })

  it('opens links in a new tab safely', () => {
    expect(renderMarkdown('[x](https://x.test)')).toContain('rel="noopener noreferrer"')
  })
})
```

`tests/component/announcements.spec.ts`:

```ts
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AnnouncementEditor from '~/app/components/announcements/AnnouncementEditor.vue'
import AnnouncementsIndex from '~/app/pages/announcements/index.vue'
import AnnouncementPage from '~/app/pages/announcements/[id].vue'
import MinistryAnnouncements from '~/app/pages/ministries/[id]/announcements.vue'
import { permissionChecker } from '~/app/composables/useCan'

const get = vi.fn()
const post = vi.fn()
const patch = vi.fn()
const permissions = { administrator: false, global: [] as string[], ministries: {} as Record<string, string[]> }

mockNuxtImport('useApi', () => () => ({ get, post, patch }))
mockNuxtImport('useCan', () => () => permissionChecker(permissions))
mockNuxtImport('useRoute', () => () => ({ params: { id: 'a1' } }))

const announcement = (over = {}) => ({
  id: 'a1', scope: 'church', ministry: null, author: { id: 'u1', full_name: 'Иванов Иван' },
  title: 'Собрание', body: 'В **10:00**', pinned: false, hide_after: null, notify_on_publish: true,
  published_at: '2026-10-01T07:00:00Z', archived: false, attachments: [], ...over,
})

beforeEach(() => {
  [get, post, patch].forEach(fn => fn.mockReset())
  permissions.global = []
  permissions.ministries = {}
})

describe('announcements list', () => {
  it('hides the publish button without the church permission', async () => {
    get.mockResolvedValue({ data: [], meta: { current_page: 1, last_page: 1, total: 0 } })
    const page = await mountSuspended(AnnouncementsIndex)
    expect(page.find('[data-test="publish"]').exists()).toBe(false)
  })

  it('shows the publish button with announcements.church.publish', async () => {
    permissions.global = ['announcements.church.publish']
    get.mockResolvedValue({ data: [], meta: { current_page: 1, last_page: 1, total: 0 } })
    const page = await mountSuspended(AnnouncementsIndex)
    expect(page.find('[data-test="publish"]').exists()).toBe(true)
  })

  it('marks pinned announcements', async () => {
    get.mockResolvedValue({ data: [announcement({ pinned: true })], meta: { current_page: 1, last_page: 1, total: 1 } })
    const page = await mountSuspended(AnnouncementsIndex)
    expect(page.find('[data-test="pinned-a1"]').exists()).toBe(true)
  })
})

describe('announcement page', () => {
  it('renders markdown as html', async () => {
    get.mockResolvedValue({ data: announcement() })
    const page = await mountSuspended(AnnouncementPage)
    expect(page.find('[data-test="body"]').html()).toContain('<strong>10:00</strong>')
  })

  it('shows views only when the api returned them', async () => {
    get.mockResolvedValue({ data: announcement({ views_count: 12 }) })
    const page = await mountSuspended(AnnouncementPage)
    expect(page.find('[data-test="views"]').text()).toContain('12')
  })

  it('hides edit actions from a reader', async () => {
    get.mockResolvedValue({ data: announcement() })
    const page = await mountSuspended(AnnouncementPage)
    expect(page.find('[data-test="edit"]').exists()).toBe(false)
    expect(page.find('[data-test="archive"]').exists()).toBe(false)
  })

  it('shows edit actions to the author', async () => {
    mockNuxtImport('useAuthStore', () => () => ({ user: { id: 'u1' } }))
    get.mockResolvedValue({ data: announcement() })
    const page = await mountSuspended(AnnouncementPage)
    expect(page.find('[data-test="edit"]').exists()).toBe(true)
  })
})

describe('announcement editor', () => {
  it('publishes with notify on by default', async () => {
    post.mockResolvedValue({ data: announcement() })
    const editor = await mountSuspended(AnnouncementEditor, { props: { scope: 'church' } })
    await editor.find('[data-test="title"]').setValue('Собрание')
    await editor.find('[data-test="body"]').setValue('Текст')
    await editor.find('form').trigger('submit')
    await new Promise(resolve => setTimeout(resolve))

    expect(post).toHaveBeenCalledWith('/announcements', expect.objectContaining({
      scope: 'church', title: 'Собрание', body: 'Текст', notify_on_publish: true, pinned: false, media_ids: [],
    }))
  })

  it('passes the ministry for a ministry announcement', async () => {
    post.mockResolvedValue({ data: announcement() })
    const editor = await mountSuspended(AnnouncementEditor, { props: { scope: 'ministry', ministryId: 'm1' } })
    await editor.find('[data-test="title"]').setValue('Репетиция')
    await editor.find('[data-test="body"]').setValue('В субботу')
    await editor.find('form').trigger('submit')
    await new Promise(resolve => setTimeout(resolve))

    expect(post).toHaveBeenCalledWith('/announcements', expect.objectContaining({ scope: 'ministry', ministry_id: 'm1' }))
  })

  it('edits without re-sending the notify flag', async () => {
    patch.mockResolvedValue({ data: announcement() })
    const editor = await mountSuspended(AnnouncementEditor, { props: { scope: 'church', announcement: announcement() } })
    await editor.find('[data-test="title"]').setValue('Новое')
    await editor.find('form').trigger('submit')
    await new Promise(resolve => setTimeout(resolve))

    expect(patch).toHaveBeenCalledWith('/announcements/a1', expect.not.objectContaining({ notify_on_publish: expect.anything() }))
  })
})

describe('ministry announcements tab', () => {
  it('asks the api for this ministry only and shows the publish button with announcements.publish', async () => {
    permissions.ministries = { a1: ['announcements.publish'] }
    get.mockResolvedValue({ data: [], meta: { current_page: 1, last_page: 1, total: 0 } })

    const tab = await mountSuspended(MinistryAnnouncements)

    expect(get).toHaveBeenCalledWith('/announcements', expect.objectContaining({ scope: 'ministry', ministry: 'a1' }))
    expect(tab.find('[data-test="publish"]').exists()).toBe(true)
  })
})
```

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `npm run test`
Ожидается: FAIL.

- [ ] **Шаг 3: Реализовать**

```bash
cd apps/web && npm i marked dompurify && npm i -D @types/dompurify
```

`app/utils/markdown.ts`:

```ts
import DOMPurify from 'dompurify'
import { marked } from 'marked'

marked.use({ gfm: true, breaks: true })

export function renderMarkdown(markdown: string): string {
  const raw = marked.parse(markdown, { async: false }) as string
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer')
    }
  })
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'blockquote'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|\/|#)/i,
  })
}
```

Список: карточки с заголовком, датой (`useChurchDate`), пометкой закрепления, служением; фильтр «церковь / мои служения»; постраничная подгрузка. Карточка: тело через `MarkdownBody`, вложения (`AttachmentList` с миниатюрами картинок и ссылками на файлы, ссылки берутся из `MediaResource`), кнопки «Изменить», «Закрепить/Открепить», «Архивировать» (с подтверждением) для автора и носителей права. Редактор: заголовок, тело (`textarea` с подсказкой по Markdown), вложения через `MediaUploader multiple`, «закрепить», «скрыть после» (дата), «уведомить» (только при создании). Главная: `PinnedAnnouncements` — до трёх закреплённых церковных. Вкладка служения: тот же список с фильтром и кнопкой по `canIn(ministryId, 'announcements.publish')`.

- [ ] **Шаг 4: Запустить тесты, убедиться что проходят**

Выполнить: `npm run test && npm run typecheck && npm run lint`
Ожидается: PASS.

- [ ] **Шаг 5: Коммит**

```bash
git add apps/web && git commit -m "feat(web): announcements list, card, editor, ministry tab and home block"
```

**Критерии готовности:**
- Markdown рендерится только из белого списка; скрипт, пропущенный сервером, всё равно не исполняется (двойная защита из раздела 7.5).
- Кнопка публикации видна ровно тем, у кого право нужного уровня; автор видит правку своего объявления.
- Галочка «уведомить» включена по умолчанию и не участвует в правке.
- Вложения показываются миниатюрами и ссылками, загружаются до публикации и уходят списком `media_ids`.

---
## Блок 4. Контур и приёмка

### Задача 12: Продовый контур — Reverb, VAPID, документация деплоя

**Файлы:**
- Изменить: `infra/compose.prod.yml` (сервис `reverb`), `infra/nginx/prod.conf` (локация `/app/`), `infra/deploy.sh` (журналы `reverb` при неудачной выкладке), `docs/deploy.md` (VAPID, Reverb, переменные, чек-лист)
- Не меняются: `infra/web/Dockerfile` и `.github/workflows/deploy.yml` — образ `web` не зависит от домена (решение 15), а новый сервис выкладывает тот же `deploy.sh`
- Тест: чек-лист в `docs/deploy.md`, ручная проверка на сервере

**Интерфейсы:**
- Отдаёт наружу: `wss://домен/app/{key}` через nginx; сервис `reverb` в проде под тем же образом `app`.
- Отдаёт наружу: переменные `.env` сервера: `BROADCAST_CONNECTION`, `REVERB_*`, `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`.

- [ ] **Шаг 1: Сервис в `compose.prod.yml`**

Как `worker` и `scheduler` — через якорь `x-php` (образ `${IMAGE_PREFIX}/app:${TAG}`, `.env`, зависимости от здоровых `postgres` и `redis`, перезапуск, журналы):

```yaml
  reverb:
    <<: *php
    command: ['php', 'artisan', 'reverb:start', '--host=0.0.0.0', '--port=8080']
```

- [ ] **Шаг 2: Локация в `prod.conf`**

```nginx
    location /app/ {
        proxy_pass http://reverb:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }
```

Своих `add_header` в локации нет: они отменили бы заголовки безопасности уровня `server` (раздел 11 архитектуры).

В `.env` сервера `REVERB_HOST=reverb`, `REVERB_PORT=8080`, `REVERB_SCHEME=http` — адрес, по которому Laravel публикует события в Reverb внутри сети; TLS терминирует nginx. Клиенту эти значения не нужны: он подключается к своему источнику (решение 15).

- [ ] **Шаг 3: Выкладка и журналы**

В `infra/deploy.sh` при неудачном `up --wait` журналы печатаются и для `reverb`: `compose logs --no-color --tail 40 web app worker scheduler reverb`. Отдельного перезапуска Reverb выкладка не требует: `up -d` пересоздаёт его с новым тегом, клиенты переподключаются (раздел 9). `horizon:terminate` не выполняется (раздел 11 архитектуры): воркер перезапускается пересозданием контейнера и получает новых слушателей на новом образе.

- [ ] **Шаг 4: Документация**

В `docs/deploy.md` добавить раздел «Фаза 2»: `docker compose -f compose.prod.yml exec app php artisan webpush:vapid`, вписать ключи и `VAPID_SUBJECT=mailto:…` в `.env`, добавить `BROADCAST_CONNECTION=reverb` и `REVERB_*`, затем `docker compose -f compose.prod.yml up -d --wait` — пересоздаёт контейнеры с новым окружением. В список сервисов, в пункт чек-листа про `compose ps` и в «Повседневные действия» (`logs`) добавить `reverb`. Проверка: `curl -si -N -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" https://домен/app/{key} | head -1` даёт `101`, где `{key}` — `REVERB_APP_KEY` из `.env`.

- [ ] **Шаг 5: Проверить деплой**

Выполнить: пуш в `main`, затем чек-лист из `docs/deploy.md`.
Ожидается: рукопожатие `101`; в установленной PWA бейдж обновляется живым; пуш доходит с закрытым приложением.

- [ ] **Шаг 6: Коммит**

```bash
git add infra docs/deploy.md && git commit -m "chore: reverb and vapid in production, deploy notes for phase 2"
```

**Критерии готовности:**
- Reverb работает за nginx по `wss` с таймаутами не меньше 60 секунд (раздел 11, риск 7).
- Ключи VAPID созданы на сервере и не покидают его `.env`.
- Образ `web` не зависит от домена: адрес сокета — источник страницы, ключ Reverb — из `GET /settings`; deploy остаётся одной командой.

---

### Задача 13: Сквозной сценарий и приёмка на устройствах

**Файлы:**
- Создать: `apps/web/e2e/announcements.spec.ts`
- Изменить: `apps/web/e2e/environment.ts` (роль `reverb` у `ApiRuntime.longRunning` в обоих способах запуска, порт Reverb сквозных тестов, переменные `BROADCAST_CONNECTION` и `REVERB_*` процессов API), `apps/web/e2e/global-setup.ts` (Reverb поднимается и останавливается вместе с API и воркером), `apps/web/playwright.config.ts` (WebSocket `/app` на источнике клиента, см. шаг 2)
- Не меняется: `.github/workflows/ci.yml` — Reverb, как API и воркер, поднимает сама обвязка; в CI это способ `native` (`E2E_API_RUNTIME`)
- Тест: сам сценарий

**Интерфейсы:**
- Потребляет обвязку фазы 1: `test` с фикстурой `openPhone`, `loginAsAdmin(page)`, `createGlobalRole(page, name, permissions)`, `createMinistry(page, name)`, `createInvitedAccount(adminPage, openPhone, person)` с `InvitedPerson` (`lastName`, `firstName`, `login`, `globalRole`), `openSection(page, section, heading)` из `e2e/fixtures.ts`; учётные данные и адреса — только из `e2e/environment.ts`; способ запуска PHP — `E2E_API_RUNTIME` и `ApiRuntime.longRunning`.

- [ ] **Шаг 1: Написать сценарий**

Разделы открываются через основную навигацию, как в сценариях фазы 1; имена данных — свои у этого файла, поэтому сценарии не зависят друг от друга и от порядка запуска (база сквозных тестов одна на прогон).

```ts
import { createGlobalRole, createInvitedAccount, createMinistry, expect, loginAsAdmin, openSection, test } from './fixtures'

const reader = { lastName: 'Смирнова', firstName: 'Анна', login: 'smirnova@e2e.test', globalRole: 'Читатель' }
const stranger = { lastName: 'Кузнецов', firstName: 'Олег', login: 'kuznetsov@e2e.test', globalRole: 'Посетитель' }

test('a published announcement reaches the notification center live', async ({ page, openPhone }) => {
  await loginAsAdmin(page)
  await createGlobalRole(page, reader.globalRole, ['Видеть справочник'])
  const readerPhone = await createInvitedAccount(page, openPhone, reader)
  await expect(readerPhone.getByTestId('nav-notifications-badge')).toHaveCount(0)

  await openSection(page, 'Объявления', 'Объявления')
  await page.getByTestId('publish').click()
  await page.getByLabel('Заголовок').fill('Общее собрание')
  await page.getByLabel('Текст').fill('В воскресенье в **10:00**')
  await page.getByRole('button', { name: 'Опубликовать' }).click()
  await expect(page.getByText('Общее собрание')).toBeVisible()

  // Без перезагрузки: бейдж обновляет канал user.{id} через Reverb.
  await expect(readerPhone.getByTestId('nav-notifications-badge')).toHaveText('1', { timeout: 10_000 })

  await openSection(readerPhone, 'Уведомления', 'Уведомления')
  await readerPhone.getByText('Общее собрание').click()
  await expect(readerPhone).toHaveURL(/\/announcements\//)
  await expect(readerPhone.locator('strong', { hasText: '10:00' })).toBeVisible()
})

test('a ministry announcement is not shown to a non-member', async ({ page, openPhone }) => {
  await loginAsAdmin(page)
  await createGlobalRole(page, stranger.globalRole, ['Видеть справочник'])
  const strangerPhone = await createInvitedAccount(page, openPhone, stranger)

  await createMinistry(page, 'Воскресная школа')
  await page.getByRole('link', { name: 'Воскресная школа' }).click()
  await page.getByRole('navigation', { name: 'Разделы служения' }).getByRole('link', { name: 'Объявления' }).click()
  await page.getByTestId('publish').click()
  await page.getByLabel('Заголовок').fill('Репетиция')
  await page.getByLabel('Текст').fill('В субботу')
  await page.getByRole('button', { name: 'Опубликовать' }).click()

  await openSection(strangerPhone, 'Объявления', 'Объявления')
  await expect(strangerPhone.getByText('Репетиция')).toHaveCount(0)
  await expect(strangerPhone.getByTestId('nav-notifications-badge')).toHaveCount(0)
})
```

- [ ] **Шаг 2: Поднять Reverb в обвязке e2e**

Reverb — третий долгоживущий процесс рядом с API и воркером: `LongRunningRole = 'api' | 'worker' | 'reverb'`. Способ `docker` — одноразовый контейнер сервиса `app` с меткой сквозных тестов (`php artisan reverb:start --host=0.0.0.0 --port=8080`), способ `native` — `php artisan reverb:start` на раннере; порт — в `e2e`, рядом с `apiPort` и `webPort`. Процессам API в `apiEnvironment` добавляются `BROADCAST_CONNECTION=reverb` и ключи приложения Reverb сквозных тестов; адрес, по которому API публикует события (`REVERB_HOST`, `REVERB_PORT`), различается по способу запуска: имя контейнера Reverb в сети Compose или `127.0.0.1`. Подготовка ждёт, пока Reverb примет соединение, и останавливает его вместе с остальными процессами. Очередь остаётся настоящей — воркер фазы 1, не `QUEUE_CONNECTION=sync`: broadcast и уведомления уходят в очередь, как в проде.

Клиент подключается к сокету на своём источнике (решение 15), поэтому `/app` должен проксироваться туда же, где браузер открывает предпросмотр, как это делает nginx в проде. Прокси `routeRules` сервера предпросмотра Nuxt запросы upgrade не пропускает; как пропустить WebSocket `/app` к Reverb сквозных тестов (например, небольшим прокси обвязки перед предпросмотром, который отдаёт `/app` в Reverb, а остальное — в предпросмотр), решает эта задача. Критерий — бейдж в первом сценарии обновляется без перезагрузки.

- [ ] **Шаг 3: Запустить сценарии**

Выполнить: `npm run e2e`
Ожидается: оба сценария проходят; бейдж появляется без перезагрузки страницы.

- [ ] **Шаг 4: Приёмка на устройствах**

Чек-лист (результат фиксируется в описании PR):

1. iPhone, Safari, приложение установлено на экран «Домой», уведомления включены кнопкой. Приложение закрыто. Опубликовано церковное объявление. Пуш пришёл, нажатие открыло объявление.
2. Android, Chrome, приложение установлено. То же.
3. iPhone, Safari без установки: кнопки «Включить уведомления» нет, есть инструкция по установке.
4. Категория «Объявления» выключена на одном устройстве: пуш не пришёл, запись в центре появилась.
5. Выход из приложения на устройстве: следующий пуш на это устройство не приходит.

- [ ] **Шаг 5: Коммит**

```bash
git add apps/web && git commit -m "test(web): end-to-end announcement and live notification scenarios"
```

**Критерии готовности:**
- Сценарий «публикация → живой бейдж → центр → объявление» проходит в CI с настоящим Reverb.
- Видимость объявления служения подтверждена сквозным сценарием.
- Все пять пунктов приёмки на устройствах выполнены — фаза закрыта только после реального пуша на iOS и Android (раздел 13; риск 4 проверен на первом же устройстве).

---

## Фаза 2 готова, когда

Проверка по критерию из раздела 13 архитектуры, одним прогоном на продовом сервере:

1. Носитель `announcements.church.publish` публикует объявление с картинкой и документом; все активные аккаунты видят его в списке и в центре уведомлений, бейдж обновляется без перезагрузки.
2. Лидер служения публикует объявление служения; участники видят его на вкладке служения и получают уведомление, остальные — нет.
3. Установленная PWA на iPhone и на Android получает пуш с закрытым приложением; нажатие открывает объявление.
4. Аккаунт выключает категорию «Объявления»: пуши прекращаются, центр продолжает пополняться.
5. Закреплённое объявление стоит первым и на главной; объявление с датой «скрыть после» исчезает из списка на следующий день по календарю церкви.
6. Архивация объявления попадает в журнал действий.

Не входит в фазу 2 и намеренно отсутствует: уведомления о назначениях и напоминания (фаза 3), пуши чата и канал `chat.{id}` (фаза 4).

---

## Изменения в архитектуре, внесённые этим планом

- Раздел 2, строка «Пуши»: собственный канал поверх `minishlink/web-push` вместо `laravel-notification-channels/webpush` (решение 2).
- Раздел 5.5: `announcements.author_user_id` допускает `null` после стирания автора (решение 5).
- Раздел 7.9 о вызове `AccountEraser` правок не требует: контракт и перечень реализаций, включая Notifications и Announcements, внесены в фазе 1 (решение 5).
- Раздел 9: адрес сокета — источник страницы, ключ Reverb — из `GET /settings` (решение 15); внесено в архитектуру при итоговом ревью фазы 1.
