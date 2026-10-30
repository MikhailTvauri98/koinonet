# План фазы 4: чат — чаты служений и событий, группы, личные, сообщения, realtime, пуши

> **Для агентов-исполнителей:** ОБЯЗАТЕЛЬНЫЙ СУБ-SKILL: используйте `superpowers:subagent-driven-development` (рекомендуется) или `superpowers:executing-plans`, чтобы выполнять план задача за задачей. Шаги размечены чекбоксами (`- [ ]`).

**Цель:** довести систему до состояния, в котором одно пилотное служение переносит общение из мессенджера: чат служения появляется вместе со служением и повторяет его состав, чат события собирает назначенных, группы и личные чаты создаются людьми, сообщения с картинками и файлами приходят живьём и пушем с отключением звука по чату, модераторы удаляют лишнее и закрепляют важное.

**Архитектура:** последний модуль монолита `Chat` с таблицами `chats`, `chat_members`, `messages`, `chat_pinned_messages` (ADR-0006). Состав чатов служений и событий ведут слушатели событий Ministries, Calendar и Directory в очереди; группы и личные чаты создают аккаунты. Единственный сервис доступа `ChatAccess` отвечает на четыре вопроса: читать, писать, модерировать, управлять составом; на него опираются политики, авторизация канала `private-chat.{id}` и владелец медиафайлов. Домены событий `MessageSent`, `MessageEdited`, `MessageDeleted` слушают три подписчика: broadcast в каналы чата и участников, пуш категории `chat` через `AppNotification` фазы 2, и ничего больше. Непрочитанное считается запросом по паре `(created_at, id)`.

**Стек:** новых серверных зависимостей нет; на клиенте — `@vueuse/core` для `useIntersectionObserver` (отметка прочитанного и подгрузка истории).

**Спецификация:** [docs/architecture.md](../architecture.md) — разделы 5.3 (`chat_id`), 5.6, 6.1 (ключи `chats.create_groups`, `chats.dm`, `chats.moderate_all`, `chat.moderate`), 6.4 (чаты, медиафайлы), 6.5 (архивация чатов, удаление чужих сообщений), 7.2 (пункт 4), 7.3 (чат служения), 7.6, 7.7 (категория `chat`), 8 (Chat, Realtime), 9, 10, 12 (тесты синхронизации чатов), 13 (фаза 4), 15 (риск 7); словарь [CONTEXT.md](../../CONTEXT.md) — «Чат», «Чат служения», «Чат события», «Группа», «Личный чат», «Сообщение», «Без звука», «Закрепление»; решения [docs/adr](../adr/) 0006, 0002 (человек без аккаунта — норма: синхронизация догоняет его при создании аккаунта).

---

## Глобальные ограничения

Действуют ограничения фаз 1–3. Дополнительно в фазе 4:

- В таблицы Chat пишут только Actions Chat. Состав чатов служений и событий меняется только слушателями (`MemberAdded`, `MemberRemoved`, `UserCreated`, `AssignmentCreated`, `AssignmentRemoved`, `MinistryArchived`), эндпоинты состава работают только для групп.
- `chats.ministry_id` и `chats.event_id` уникальны: у служения и у события не больше одного чата. Колонок `ministries.chat_id` и `events.chat_id` нет (решение 1).
- Сообщение: текст до 4000 символов; без текста обязано иметь вложение. Идентификатор — ULID (монотонен по миллисекундам), курсор истории — пара `(created_at, id)`.
- Удалённое сообщение остаётся строкой с `deleted_at`, текст и `reply_to_id` обнуляются, вложения отвязываются и удаляются физически. Правка и удаление своих сообщений — без ограничения по времени.
- Непрочитанное чата = сообщения с `(created_at, id)` больше `last_read_message_id`, не удалённые и не свои. Денормализации нет.
- Все broadcast-события ставятся в очередь. Имена событий и каналов — строго по разделу 9: `private-user.{id}` → `chat.updated`, `unread.total`; `private-chat.{id}` → `message.sent`, `message.edited`, `message.deleted`, `chat.pinned`, `chat.members_changed`.
- Пуш о сообщении идёт всегда, кроме автора, участников с активным «без звука» и выключенной категорией `chat`; присутствие не отслеживается, гасит пуш клиент. Тег `chat-{id}`.
- Каталог прав расширяется ровно четырьмя ключами: `chats.create_groups`, `chats.dm`, `chats.moderate_all` (глобальные), `chat.moderate` (служения). Каждый вводится в задаче с первым тестом.
- Миграции фазы нумеруются с `2026_12_01_000900`.

---

## Решения планирования

1. **Связь «служение → чат» и «событие → чат» хранится только в `chats`.** Архитектура (5.3, 5.4) предусматривала колонки `ministries.chat_id` и `events.chat_id`, но заполнить их мог бы только модуль-владелец таблицы, а чат создаёт Chat. Вместо перекрёстной записи — уникальные `chats.ministry_id` и `chats.event_id`; `MinistryResource` и `EventResource` получают вычисляемое поле `chat_id` чтением модели `Chat`. Разделы 5.3, 5.4 и 7.3 архитектуры правятся этим планом (5.4 уже поправлен планом фазы 3).
2. **Чат служения создаёт слушатель `MinistryCreated` в очереди,** а не транзакция `CreateMinistry` (иначе Ministries зависел бы от Chat против графа раздела 4). Между созданием служения и появлением чата проходят миллисекунды очереди; клиент показывает вкладку «Чат» по наличию `chat_id`. Для служений, созданных до фазы 4, — команда `chat:backfill`, идемпотентная, выполняется один раз на деплое.
3. **Личный чат создаётся эндпоинтом, а не первым сообщением.** `POST /chats` с `type = direct` и `user_id` возвращает существующий чат (`200`) или создаёт новый (`201`): клиенту нужен `id`, чтобы отправить сообщение. Чтобы пустые личные чаты не засоряли список, `GET /chats` скрывает личные чаты без сообщений. Это сохраняет смысл раздела 7.6 («лениво первым сообщением») в интерфейсе.
4. **Владелец группы не может выйти** (`chat.owner_cannot_leave`): группа без хозяина некому управляема. Владелец архивирует группу; `chats.moderate_all` может архивировать группу и менять её состав. Чаты служений и событий архивируются только вместе с родителем; личные чаты не архивируются и не модерируются.
5. **Читатели с `ministries.view_all`** открывают чат служения, историю и канал без участия в `chat_members`; писать, закреплять и отмечать прочитанное не могут (`chat.read_only`). В `GET /chats` их чаты не попадают: они открывают чат со вкладки служения.
6. **`ChatAccess` — единственная точка правил:** `canRead(User, Chat)`, `canWrite(User, Chat)`, `canModerate(User, Chat)`, `canManageMembers(User, Chat)`. Модерация: `chat.moderate` в служении для его чата; `EventAccess::canManage` для чата события; владелец для группы; `chats.moderate_all` везде, кроме личных.
7. **Broadcast отделён от домена.** `MessageSent` и прочие — обычные события Laravel; слушатель `BroadcastChatChanges` в очереди рассылает классы `ShouldBroadcast` с `broadcastAs()` из раздела 9 и пересчитывает `chat.updated` и `unread.total` для каждого участника. Так тесты домена не зависят от драйвера вещания.
8. **Пуш о сообщении — `ChatMessageNotification extends AppNotification`** с переопределённым `via()`: только `webpush` (через `PushGate` фазы 2), без `database` (раздел 5.7) и без `broadcast` (живое обновление списка чатов идёт через `chat.updated`). Заглушённые участники отсекаются до `Notification::send`.
9. **Чат события создаёт управляющий событием** (`EventAccess::canManage`) эндпоинтом `POST /events/{id}/chat`, объявленным в маршрутах Chat. Состав — аккаунты назначенных плюс создатель чата; синхронизация по `AssignmentCreated`/`AssignmentRemoved` (снятие — только если у человека не осталось назначений в этом событии). Отмена события чат не трогает.
10. **Стирание аккаунта:** `ChatAccountEraser` удаляет строки `chat_members` аккаунта, обнуляет `messages.sender_user_id`, `chats.created_by_user_id`, `chat_pinned_messages.pinned_by_user_id`; сообщения остаются с подписью «Удалённый человек». Колонки объявляются `nullable` сразу; раздел 5.6 правится.
11. **Аватар группы** — прямая ссылка `chats.avatar_media_id` через `AttachDirectMedia` фазы 1; `Media::isDirectlyReferenced()` фазы 1 расширяется этой колонкой, доступ к аватару — участникам чата через `ChatMediaOwnerResolver`.
12. **Ответ на сообщение** допускается только внутри того же чата (`message.reply_other_chat`); ответ на удалённое сообщение показывает заглушку.
13. **Группа создаётся хотя бы с одним участником кроме владельца** (`member_ids` — `required|min:1`); чат из одного человека не нужен.
14. **История отдаётся страницами по 50 сообщений** в порядке «новые в конце»; `before` — курсор `created_at|id` последнего известного сообщения, `after` — для догона после переподключения (раздел 9).
15. **Синхронизация состава чата события при создании аккаунта** (`UserCreated`) добавляет человека во все чаты событий со статусом `scheduled`, куда он назначен, и в чаты всех его неархивных служений (раздел 7.2, пункт 4).

---

## Структура файлов

```text
apps/api/
├── app/Modules/Chat/
│   ├── Models/Chat.php, ChatMember.php, Message.php, ChatPinnedMessage.php
│   ├── ChatType.php
│   ├── ChatAccess.php                      читать / писать / модерировать / состав
│   ├── UnreadCounter.php                   непрочитанное по чату и всего
│   ├── MessageCursor.php                   разбор и сборка курсора (created_at|id)
│   ├── ChatAccountEraser.php
│   ├── ChatMediaOwnerResolver.php
│   ├── Actions/CreateMinistryChat.php, SyncMinistryChatMember.php, ArchiveChat.php,
│   │           CreateEventChat.php, SyncEventChatMember.php,
│   │           CreateGroupChat.php, UpdateGroupChat.php, AddGroupMembers.php,
│   │           RemoveGroupMember.php, LeaveGroup.php, OpenDirectChat.php,
│   │           SendMessage.php, EditMessage.php, DeleteMessage.php,
│   │           MarkChatRead.php, PinMessage.php, UnpinMessage.php, MuteChat.php, UnmuteChat.php
│   ├── Events/MessageSent.php, MessageEdited.php, MessageDeleted.php,
│   │          ChatPinsChanged.php, ChatMembersChanged.php, ChatRead.php
│   ├── Broadcasts/MessageSentBroadcast.php, MessageEditedBroadcast.php, MessageDeletedBroadcast.php,
│   │              ChatPinnedBroadcast.php, ChatMembersChangedBroadcast.php,
│   │              ChatUpdatedBroadcast.php, UnreadTotalBroadcast.php
│   ├── Listeners/CreateMinistryChatOnCreated.php, SyncMinistryChatOnMembership.php,
│   │             AddNewUserToChats.php, ArchiveChatOnMinistryArchived.php,
│   │             SyncEventChatOnAssignment.php, BroadcastChatChanges.php
│   ├── Console/BackfillChatsCommand.php
│   ├── Policies/ChatPolicy.php, MessagePolicy.php
│   ├── Http/Controllers/ChatController.php, ChatMemberController.php, MessageController.php,
│   │                    ChatReadController.php, PinController.php, MuteController.php,
│   │                    EventChatController.php
│   ├── Http/Requests/…, Http/Resources/ChatResource.php, ChatListItemResource.php,
│   │                    MessageResource.php, ChatMemberResource.php
│   ├── Database/Migrations/2026_12_01_000900_create_chat_tables.php
│   └── routes.php
├── app/Modules/Notifications/Notifications/ChatMessageNotification.php
├── app/Modules/Notifications/Listeners/NotifyAboutChatMessage.php
├── app/Modules/Media/Actions/DeleteAttachedMedia.php     новый Action
├── app/Modules/Media/Models/Media.php                    isDirectlyReferenced() + аватар чата
├── app/Modules/Ministries/Http/Resources/MinistryResource.php   +chat_id
├── app/Modules/Calendar/Http/Resources/EventResource.php        +chat_id
├── app/Modules/Access/Permission.php                     +4 ключа
├── routes/channels.php                                   канал chat.{id}
└── tests/Feature/Chat/…, tests/Unit/Chat/…

apps/web/
├── app/stores/chats.ts
├── app/pages/chats/index.vue, chats/[id].vue, ministries/[id]/chat.vue
├── app/components/chat/ChatList.vue, ChatListItem.vue, MessageList.vue, MessageItem.vue,
│       Composer.vue, ReplyPreview.vue, PinnedBar.vue, ChatHeader.vue, ChatMembersDialog.vue,
│       NewGroupDialog.vue, MuteMenu.vue
├── app/sw/handlers.ts                                    гашение пушей открытого чата
└── tests/unit/chats.store.spec.ts, tests/component/chat.spec.ts, chat-list.spec.ts,
    chat-groups.spec.ts, e2e/chat.spec.ts
```

---

## Блок 1. Схема и чаты служений

### Задача 1: Таблицы чата, модели, перечисления, фабрики, стирание

**Файлы:**
- Создать: `app/Modules/Chat/Database/Migrations/2026_12_01_000900_create_chat_tables.php`; `Models/Chat.php`, `ChatMember.php`, `Message.php`, `ChatPinnedMessage.php`; `ChatType.php`; `MessageCursor.php`; `Actions/ChatAccountEraser.php`; `database/factories/ChatFactory.php`, `MessageFactory.php`
- Изменить: `AppServiceProvider` (морф-имя `message`, тег `directory.account_erasers`), `app/Modules/Media/MediaUsage.php` (`isUsed()` учитывает `chats.avatar_media_id`)
- Тест: `tests/Feature/Chat/ChatSchemaTest.php`, `tests/Unit/Chat/MessageCursorTest.php`

**Интерфейсы:**
- Отдаёт наружу: `enum ChatType: string { Ministry = 'ministry'; Event = 'event'; Group = 'group'; Direct = 'direct'; }`.
- Отдаёт наружу: модели с отношениями `Chat::members()` (`HasMany ChatMember`), `Chat::messages()`, `Chat::pins()`, `Chat::lastMessage()`, `Message::sender()`, `Message::replyTo()`, `Message::attachments()`; `ChatMember` с составным ключом `(chat_id, user_id)` и методами `isMuted(): bool`.
- Отдаёт наружу: `MessageCursor::encode(Message $m): string` → `"{created_at ISO с микросекундами}|{id}"`, `MessageCursor::decode(string $cursor): array{created_at: CarbonImmutable, id: string}` (бросает `DomainRuleException` с `cursor.invalid`).
- Отдаёт наружу: `Chat::factory()` — группа с владельцем; состояния `ministry(Ministry $m)`, `event(Event $e)`, `direct(User $a, User $b)`, `archived()`, `withMembers(User ...$users)`. `Message::factory()->for($chat)->from($user)` — текстовое сообщение; состояния `deleted()`, `replyTo(Message $m)`, `at(CarbonImmutable $moment)`.
- Отдаёт наружу: `Chat::directKey(string $a, string $b): string` — два ULID через `:` в отсортированном порядке.

- [x] **Шаг 1: Написать падающие тесты**

`tests/Unit/Chat/MessageCursorTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Chat\MessageCursor;
use App\Modules\Chat\Models\Message;
use App\Support\DomainRuleException;
use Carbon\CarbonImmutable;

it('round-trips a cursor with microsecond precision', function () {
    $message = new Message(['id' => '01JC0000000000000000000001']);
    $message->created_at = CarbonImmutable::parse('2026-12-01 10:00:00.123456');

    $decoded = MessageCursor::decode(MessageCursor::encode($message));

    expect($decoded['id'])->toBe('01JC0000000000000000000001')
        ->and($decoded['created_at']->format('Y-m-d H:i:s.u'))->toBe('2026-12-01 10:00:00.123456');
});

it('rejects garbage', function () {
    expect(fn () => MessageCursor::decode('nope'))->toThrow(DomainRuleException::class);
});
```

`tests/Feature/Chat/ChatSchemaTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Calendar\Models\Event;
use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\Models\ChatMember;
use App\Modules\Chat\Models\ChatPinnedMessage;
use App\Modules\Chat\Models\Message;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use Illuminate\Database\QueryException;

it('allows one chat per ministry and one per event', function () {
    $ministry = ministryWithRoles();
    Chat::factory()->ministry($ministry)->create();
    expect(fn () => Chat::factory()->ministry($ministry)->create())->toThrow(QueryException::class);

    $event = Event::factory()->create();
    Chat::factory()->event($event)->create();
    expect(fn () => Chat::factory()->event($event)->create())->toThrow(QueryException::class);
});

it('keeps the direct key unique and order-independent', function () {
    [$a, $b] = User::factory()->count(2)->create();
    Chat::factory()->direct($a, $b)->create();

    expect(Chat::directKey($a->id, $b->id))->toBe(Chat::directKey($b->id, $a->id))
        ->and(fn () => Chat::factory()->direct($b, $a)->create())->toThrow(QueryException::class);
});

it('requires the matching link column for each type', function () {
    expect(fn () => Chat::query()->create(['type' => 'ministry', 'ministry_id' => null]))->toThrow(QueryException::class);
    expect(fn () => Chat::query()->create(['type' => 'group', 'ministry_id' => ministryWithRoles()->id, 'title' => 'Г']))->toThrow(QueryException::class);
});

it('has one membership row per account and chat', function () {
    $chat = Chat::factory()->create();
    $user = User::factory()->create();
    ChatMember::query()->create(['chat_id' => $chat->id, 'user_id' => $user->id, 'joined_at' => now()]);

    expect(fn () => ChatMember::query()->create(['chat_id' => $chat->id, 'user_id' => $user->id, 'joined_at' => now()]))
        ->toThrow(QueryException::class);
});

it('pins a message once', function () {
    $chat = Chat::factory()->create();
    $message = Message::factory()->for($chat)->create();
    ChatPinnedMessage::query()->create(['chat_id' => $chat->id, 'message_id' => $message->id, 'pinned_at' => now()]);

    expect(fn () => ChatPinnedMessage::query()->create(['chat_id' => $chat->id, 'message_id' => $message->id, 'pinned_at' => now()]))
        ->toThrow(QueryException::class);
});

it('gives messages monotonically increasing ulids', function () {
    $chat = Chat::factory()->create();
    $first = Message::factory()->for($chat)->create();
    usleep(2000);
    $second = Message::factory()->for($chat)->create();

    expect(strcmp($second->id, $first->id))->toBeGreaterThan(0);
});

it('erases an account from chats but keeps its messages', function () {
    $person = Person::factory()->create();
    $user = User::factory()->for($person)->create();
    $chat = Chat::factory()->withMembers($user)->create();
    $message = Message::factory()->for($chat)->from($user)->create(['body' => 'Привет']);

    $this->artisan('people:erase', ['id' => $person->id, '--force' => true])->assertSuccessful();

    expect(ChatMember::query()->where('user_id', $user->id)->exists())->toBeFalse()
        ->and($message->fresh()->sender_user_id)->toBeNull()
        ->and($message->fresh()->body)->toBe('Привет');
});
```

- [x] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Unit/Chat tests/Feature/Chat/ChatSchemaTest.php`
Ожидается: FAIL.

- [x] **Шаг 3: Миграция**

```php
Schema::create('chats', function (Blueprint $table) {
    $table->char('id', 26)->primary();
    $table->string('type', 16);
    $table->char('ministry_id', 26)->nullable()->unique();
    $table->char('event_id', 26)->nullable()->unique();
    $table->string('direct_key', 53)->nullable()->unique();
    $table->string('title', 100)->nullable();
    $table->char('avatar_media_id', 26)->nullable();
    $table->char('created_by_user_id', 26)->nullable();
    $table->char('last_message_id', 26)->nullable();
    $table->timestampTz('last_message_at')->nullable();
    $table->timestampTz('archived_at')->nullable();
    $table->timestampsTz();

    $table->foreign('ministry_id')->references('id')->on('ministries')->restrictOnDelete();
    $table->foreign('event_id')->references('id')->on('events')->restrictOnDelete();
    $table->foreign('avatar_media_id')->references('id')->on('media')->restrictOnDelete();
    $table->foreign('created_by_user_id')->references('id')->on('users')->restrictOnDelete();
    $table->index('last_message_at');
});

DB::statement("ALTER TABLE chats ADD CONSTRAINT chats_type_check CHECK (
    (type = 'ministry' AND ministry_id IS NOT NULL AND event_id IS NULL AND direct_key IS NULL)
 OR (type = 'event'    AND event_id IS NOT NULL AND ministry_id IS NULL AND direct_key IS NULL)
 OR (type = 'group'    AND ministry_id IS NULL AND event_id IS NULL AND direct_key IS NULL AND title IS NOT NULL)
 OR (type = 'direct'   AND direct_key IS NOT NULL AND ministry_id IS NULL AND event_id IS NULL))");

Schema::create('chat_members', function (Blueprint $table) {
    $table->char('chat_id', 26);
    $table->char('user_id', 26);
    $table->boolean('is_owner')->default(false);
    $table->timestampTz('muted_until')->nullable();
    $table->char('last_read_message_id', 26)->nullable();
    $table->timestampTz('joined_at');
    $table->primary(['chat_id', 'user_id']);
    $table->foreign('chat_id')->references('id')->on('chats')->restrictOnDelete();
    $table->foreign('user_id')->references('id')->on('users')->restrictOnDelete();
    $table->index('user_id');
});

Schema::create('messages', function (Blueprint $table) {
    $table->char('id', 26)->primary();
    $table->char('chat_id', 26);
    $table->char('sender_user_id', 26)->nullable();     // null после стирания отправителя
    $table->text('body')->nullable();
    $table->char('reply_to_id', 26)->nullable();
    $table->timestampTz('edited_at')->nullable();
    $table->timestampTz('deleted_at')->nullable();
    $table->timestampTz('created_at', 6);

    $table->foreign('chat_id')->references('id')->on('chats')->restrictOnDelete();
    $table->foreign('sender_user_id')->references('id')->on('users')->restrictOnDelete();
    $table->foreign('reply_to_id')->references('id')->on('messages')->restrictOnDelete();
    $table->index(['chat_id', 'created_at', 'id']);
});

DB::statement('ALTER TABLE messages ADD CONSTRAINT messages_body_length_check CHECK (body IS NULL OR char_length(body) <= 4000)');

Schema::table('chats', function (Blueprint $table) {
    $table->foreign('last_message_id')->references('id')->on('messages')->restrictOnDelete();
});

Schema::create('chat_pinned_messages', function (Blueprint $table) {
    $table->char('chat_id', 26);
    $table->char('message_id', 26)->unique();
    $table->char('pinned_by_user_id', 26)->nullable();
    $table->timestampTz('pinned_at');
    $table->primary(['chat_id', 'message_id']);
    $table->foreign('chat_id')->references('id')->on('chats')->restrictOnDelete();
    $table->foreign('message_id')->references('id')->on('messages')->restrictOnDelete();
    $table->foreign('pinned_by_user_id')->references('id')->on('users')->restrictOnDelete();
});
```

- [x] **Шаг 4: Модели, курсор, стирание**

`Message`: `HasUlids`, `$timestamps = false`, `created_at` заполняется в `creating` через `now()` с микросекундами (`CarbonImmutable::now()`), casts `created_at`, `edited_at`, `deleted_at` → `immutable_datetime`; `isDeleted(): bool`. `Chat::directKey` — `implode(':', [min($a, $b), max($a, $b)])`. `ChatMember::isMuted()` — `muted_until !== null && muted_until > now()`.

```php
final class MessageCursor
{
    public static function encode(Message $message): string
    {
        return $message->created_at->format('Y-m-d\TH:i:s.u\Z').'|'.$message->id;
    }

    /** @return array{created_at: CarbonImmutable, id: string} */
    public static function decode(string $cursor): array
    {
        $parts = explode('|', $cursor, 2);

        if (count($parts) !== 2 || ! preg_match('/^[0-9A-Z]{26}$/', $parts[1])) {
            throw DomainRuleException::because('cursor.invalid', 'Неверный курсор.');
        }

        try {
            $createdAt = CarbonImmutable::createFromFormat('Y-m-d\TH:i:s.u\Z', $parts[0], 'UTC');
        } catch (\Throwable) {
            throw DomainRuleException::because('cursor.invalid', 'Неверный курсор.');
        }

        return ['created_at' => $createdAt, 'id' => $parts[1]];
    }
}
```

`ChatAccountEraser::eraseAccount($userId)`: `ChatMember::where('user_id')->delete()`, `Message::where('sender_user_id')->update(['sender_user_id' => null])`, `Chat::where('created_by_user_id')->update([... => null])`, `ChatPinnedMessage::where('pinned_by_user_id')->update([... => null])`. В `Media::isDirectlyReferenced()` добавить `Chat::where('avatar_media_id', $this->id)->exists()`.

- [x] **Шаг 5: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Unit/Chat tests/Feature/Chat/ChatSchemaTest.php tests/Feature/Directory/ErasePersonTest.php`
Ожидается: PASS.

- [x] **Шаг 6: Коммит**

```bash
git add apps/api && git commit -m "feat(chat): tables, models, cursor and account erasure for chats"
```

**Критерии готовности:**
- Инварианты раздела 5.6 в базе: один чат на служение и на событие, уникальный `direct_key`, согласованность типа и ссылок, одно закрепление на сообщение, длина текста.
- Курсор истории кодирует пару `(created_at, id)` без потери микросекунд.
- Стирание аккаунта убирает его из чатов и обезличивает сообщения, не удаляя их (раздел 7.9).

---

### Задача 2: Чат служения — создание, синхронизация состава, архивация, backfill

**Файлы:**
- Создать: `app/Modules/Chat/Actions/CreateMinistryChat.php`, `SyncMinistryChatMember.php`, `ArchiveChat.php`; `Listeners/CreateMinistryChatOnCreated.php`, `SyncMinistryChatOnMembership.php`, `AddNewUserToChats.php`, `ArchiveChatOnMinistryArchived.php`; `Console/BackfillChatsCommand.php`; `Events/ChatMembersChanged.php`
- Изменить: `app/Modules/Ministries/Http/Resources/MinistryResource.php` (`chat_id`), `AppServiceProvider` (подписки)
- Тест: `tests/Feature/Chat/MinistryChatSyncTest.php`

**Интерфейсы:**
- Отдаёт наружу: `CreateMinistryChat::handle(Ministry $ministry): Chat` — идемпотентен: возвращает существующий чат; добавляет аккаунты всех текущих участников.
- Отдаёт наружу: `SyncMinistryChatMember::add(Chat $chat, User $user): void`, `remove(Chat $chat, User $user): void` — публикуют `ChatMembersChanged(string $chatId, list<string> $added, list<string> $removed)`.
- Отдаёт наружу: `ArchiveChat::handle(Chat $chat, ?User $actor): Chat` — `archived_at`, журнал `chat.archived`.
- Отдаёт наружу: `php artisan chat:backfill` — создаёт чаты служениям без чата и досоздаёт участие аккаунтам участников.
- Отдаёт наружу: `MinistryResource.chat_id: string|null`.
- Потребляет: `MinistryCreated`, `MinistryArchived`, `MemberAdded`, `MemberRemoved` (фаза 1), `UserCreated` (фаза 1), `AssignmentCreated` (фаза 3, для `AddNewUserToChats` — чаты событий, если уже есть).

- [x] **Шаг 1: Написать падающие тесты**

```php
<?php

declare(strict_types=1);

use App\Modules\Access\Models\AuditEntry;
use App\Modules\Access\Permission;
use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\Models\ChatMember;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use App\Modules\Ministries\Models\Ministry;

function ministryChat(Ministry $ministry): Chat
{
    return Chat::query()->where('ministry_id', $ministry->id)->sole();
}

it('creates a ministry chat when a ministry is created', function () {
    actingAsUserWith([Permission::MinistriesCreate]);

    $id = $this->postJson('/api/v1/ministries', ['name' => 'Прославление'])->json('data.id');

    $chat = Chat::query()->where('ministry_id', $id)->sole();
    expect($chat->type->value)->toBe('ministry')
        ->and($chat->title)->toBeNull()                    // название берётся от служения
        ->and($chat->ministry->name)->toBe('Прославление');
    $this->getJson("/api/v1/ministries/{$id}")->assertJsonPath('data.chat_id', $chat->id);
});

it('adds a member with an account to the chat and removes them on exclusion', function () {
    $ministry = ministryWithRoles();
    $person = Person::factory()->has(User::factory())->create();

    $member = memberOf($ministry, $person);
    expect(ChatMember::query()->where('chat_id', ministryChat($ministry)->id)->where('user_id', $person->user->id)->exists())->toBeTrue();

    app(\App\Modules\Ministries\Actions\RemoveMember::class)->handle($member);
    expect(ChatMember::query()->where('chat_id', ministryChat($ministry)->id)->where('user_id', $person->user->id)->exists())->toBeFalse();
});

it('ignores a member without an account and catches up when the account appears', function () {
    $ministry = ministryWithRoles();
    $person = Person::factory()->create();
    $person->globalRoles()->attach(\App\Modules\Access\Models\Role::factory()->global()->create());
    memberOf($ministry, $person);
    expect(ChatMember::query()->where('chat_id', ministryChat($ministry)->id)->count())->toBe(0);

    actingAsUserWith([Permission::PeopleInvite]);
    $token = str($this->postJson("/api/v1/people/{$person->id}/invite")->json('data.url'))->afterLast('/')->toString();
    auth()->logout();
    $this->postJson("/api/v1/access-links/{$token}/accept", ['login' => 'new@example.com', 'password' => 'secret123', 'password_confirmation' => 'secret123'])->assertCreated();

    expect(ChatMember::query()->where('chat_id', ministryChat($ministry)->id)->where('user_id', $person->fresh()->user->id)->exists())->toBeTrue();
});

it('archives the chat with the ministry and writes to the journal', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::MinistriesCreate]);

    $this->postJson("/api/v1/ministries/{$ministry->id}/archive")->assertOk();

    expect(ministryChat($ministry)->archived_at)->not->toBeNull()
        ->and(AuditEntry::query()->where('action', 'chat.archived')->exists())->toBeTrue();
});

it('backfills chats for ministries created before the chat module', function () {
    $ministry = ministryWithRoles();
    Chat::query()->where('ministry_id', $ministry->id)->delete();
    $person = Person::factory()->has(User::factory())->create();
    memberOf($ministry, $person);
    ChatMember::query()->delete();

    $this->artisan('chat:backfill')->assertSuccessful();
    $this->artisan('chat:backfill')->assertSuccessful();

    expect(Chat::query()->where('ministry_id', $ministry->id)->count())->toBe(1)
        ->and(ChatMember::query()->where('user_id', $person->user->id)->count())->toBe(1);
});

it('does not create chats for archived ministries during backfill', function () {
    $ministry = ministryWithRoles();
    Chat::query()->where('ministry_id', $ministry->id)->delete();
    $ministry->update(['archived_at' => now()]);

    $this->artisan('chat:backfill');

    expect(Chat::query()->where('ministry_id', $ministry->id)->exists())->toBeFalse();
});
```

- [x] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Feature/Chat/MinistryChatSyncTest.php`
Ожидается: FAIL.

- [x] **Шаг 3: Реализовать**

```php
final class CreateMinistryChat
{
    public function handle(Ministry $ministry): Chat
    {
        return DB::transaction(function () use ($ministry) {
            $chat = Chat::query()->firstOrCreate(
                ['ministry_id' => $ministry->id],
                ['type' => ChatType::Ministry],
            );

            $userIds = User::query()
                ->whereIn('person_id', $ministry->members()->select('person_id'))
                ->whereNull('disabled_at')
                ->pluck('id');

            foreach ($userIds as $userId) {
                ChatMember::query()->firstOrCreate(['chat_id' => $chat->id, 'user_id' => $userId], ['joined_at' => now()]);
            }

            return $chat;
        });
    }
}
```

`SyncMinistryChatOnMembership` слушает `MemberAdded` (при `userId !== null` — `SyncMinistryChatMember::add`) и `MemberRemoved` (`remove`). `AddNewUserToChats` слушает `UserCreated`: для каждого неархивного служения человека — `add`; для каждого `scheduled`-события с назначением человека, у которого есть чат — `SyncEventChatMember::add` (задача 12; в этой задаче ветка событий не пишется, тест на неё — там). `ArchiveChatOnMinistryArchived` — `ArchiveChat::handle($chat, null)`. Все слушатели `ShouldQueue`. Колонка `title` заполняется только у групп; у чатов служения и события она `null`, а название `ChatResource` берёт от родителя (`ministry->name`, `event->title`), поэтому переименование служения не требует синхронизации (раздел 5.6).

`BackfillChatsCommand`: `Ministry::whereNull('archived_at')->each(CreateMinistryChat::handle)`; идемпотентность даёт `firstOrCreate`.

- [x] **Шаг 4: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Feature/Chat tests/Feature/Ministries`
Ожидается: PASS.

- [x] **Шаг 5: Коммит**

```bash
composer openapi && git add . && git commit -m "feat(chat): ministry chats created and synchronised by listeners, backfill command"
```

**Критерии готовности:**
- Тесты синхронизации из раздела 12: добавление и исключение участника, догон при создании аккаунта, архивация — все зелёные.
- Человек без аккаунта — не ошибка: чат догоняет его при приёме приглашения (ADR-0002).
- `chat:backfill` идемпотентен и не трогает архивные служения.
- Ministries о чате не знает: `chat_id` в ресурсе читается из модели Chat.

---
### Задача 3: Список чатов, карточка, доступ, канал `private-chat.{id}`

**Файлы:**
- Создать: `app/Modules/Chat/ChatAccess.php`; `UnreadCounter.php`; `Policies/ChatPolicy.php`; `Http/Controllers/ChatController.php` (`index`, `show`); `Http/Resources/ChatResource.php`, `ChatListItemResource.php`, `ChatMemberResource.php`; `app/Modules/Chat/routes.php`
- Изменить: `routes/channels.php` (канал `chat.{chatId}`)
- Тест: `tests/Feature/Chat/ChatAccessTest.php`, `tests/Feature/Chat/ChatIndexTest.php`

**Интерфейсы:**
- Отдаёт наружу: `ChatAccess::canRead(User, Chat): bool` — участник или (`type = ministry` и `ministries.view_all`); `canWrite` — участник и чат не архивен; `canModerate` — по решению 6; `canManageMembers` — группа: владелец или `chats.moderate_all`; иные типы — `false`.
- Отдаёт наружу: `UnreadCounter::forChat(User $user, Chat $chat): int`, `total(User $user): int`, `forChats(User $user, Collection<Chat> $chats): array<string, int>` (один запрос на список).
- Отдаёт наружу: `GET /chats` → список чатов участия, отсортированный по `last_message_at` убыв. (пустые личные скрыты); `GET /chats/{id}` → `ChatResource` с `members`, `pinned_messages` (задача 7), `can_write`, `can_moderate`, `can_manage_members`, `unread_count`, `muted_until`, `is_owner`.
- Отдаёт наружу: `ChatResource.title` — название служения / события / группы / ФИО собеседника для личного; `avatar_url` — аватар группы или фото собеседника.
- Отдаёт наружу: канал `private-chat.{chatId}` — авторизация через `ChatAccess::canRead`.

- [x] **Шаг 1: Написать падающие тесты**

`tests/Feature/Chat/ChatAccessTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use App\Modules\Chat\Models\Chat;
use App\Modules\Directory\Models\User;

beforeEach(fn () => config(['broadcasting.default' => 'reverb']));

it('opens a ministry chat to a member with write access', function () {
    $ministry = ministryWithRoles();
    $user = actingAsUser();
    memberOf($ministry, $user->person);
    $chat = Chat::query()->where('ministry_id', $ministry->id)->sole();

    $this->getJson("/api/v1/chats/{$chat->id}")
        ->assertOk()
        ->assertJsonPath('data.title', 'Прославление')
        ->assertJsonPath('data.can_write', true)
        ->assertJsonPath('data.can_moderate', false);
});

it('opens a ministry chat read-only to ministries.view_all', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::MinistriesViewAll]);
    $chat = Chat::query()->where('ministry_id', $ministry->id)->sole();

    $this->getJson("/api/v1/chats/{$chat->id}")->assertOk()->assertJsonPath('data.can_write', false);
});

it('refuses a chat to a stranger', function () {
    actingAsUser();
    $chat = Chat::factory()->withMembers(User::factory()->create())->create();

    $this->getJson("/api/v1/chats/{$chat->id}")->assertForbidden();
});

it('marks an archived chat as read-only', function () {
    $user = actingAsUser();
    $chat = Chat::factory()->withMembers($user)->archived()->create();

    $this->getJson("/api/v1/chats/{$chat->id}")->assertOk()->assertJsonPath('data.archived', true)->assertJsonPath('data.can_write', false);
});

it('authorizes the chat channel for members and view_all readers only', function () {
    $ministry = ministryWithRoles();
    $chat = Chat::query()->where('ministry_id', $ministry->id)->sole();

    $member = actingAsUser();
    memberOf($ministry, $member->person);
    $this->postJson('/broadcasting/auth', ['channel_name' => "private-chat.{$chat->id}", 'socket_id' => '1.1'])->assertOk();

    actingAsUserWith([Permission::MinistriesViewAll]);
    $this->postJson('/broadcasting/auth', ['channel_name' => "private-chat.{$chat->id}", 'socket_id' => '1.1'])->assertOk();

    actingAsUser();
    $this->postJson('/broadcasting/auth', ['channel_name' => "private-chat.{$chat->id}", 'socket_id' => '1.1'])->assertForbidden();
});
```

`tests/Feature/Chat/ChatIndexTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\Models\Message;
use App\Modules\Directory\Models\User;
use Carbon\CarbonImmutable;

it('lists only chats the account belongs to, most recent first', function () {
    $user = actingAsUser();
    $other = User::factory()->create();
    $old = Chat::factory()->withMembers($user, $other)->create(['title' => 'Старая']);
    $new = Chat::factory()->withMembers($user, $other)->create(['title' => 'Новая']);
    Chat::factory()->withMembers($other)->create(['title' => 'Чужая']);
    Message::factory()->for($old)->from($other)->at(CarbonImmutable::now()->subHour())->create();
    Message::factory()->for($new)->from($other)->create();

    $titles = collect($this->getJson('/api/v1/chats')->assertOk()->json('data'))->pluck('title')->all();

    expect($titles)->toBe(['Новая', 'Старая']);
});

it('shows the last message and the unread count', function () {
    $user = actingAsUser();
    $other = User::factory()->create();
    $chat = Chat::factory()->withMembers($user, $other)->create();
    Message::factory()->for($chat)->from($other)->create(['body' => 'Первое']);
    Message::factory()->for($chat)->from($other)->create(['body' => 'Второе, длинное сообщение с подробностями']);
    Message::factory()->for($chat)->from($user)->create(['body' => 'Своё']);

    $this->getJson('/api/v1/chats')
        ->assertJsonPath('data.0.unread_count', 2)
        ->assertJsonPath('data.0.last_message.body_preview', 'Своё');
});

it('hides direct chats without messages', function () {
    $user = actingAsUser();
    $other = User::factory()->create();
    Chat::factory()->direct($user, $other)->create();

    $this->getJson('/api/v1/chats')->assertOk()->assertJsonCount(0, 'data');
});

it('names a direct chat after the other person', function () {
    $user = actingAsUser();
    $other = User::factory()->create();
    $other->person->update(['last_name' => 'Иванова', 'first_name' => 'Мария']);
    $chat = Chat::factory()->direct($user, $other)->create();
    Message::factory()->for($chat)->from($other)->create();

    $this->getJson('/api/v1/chats')->assertJsonPath('data.0.title', 'Иванова Мария');
});

it('does not list ministry chats the account only reads with view_all', function () {
    ministryWithRoles();
    actingAsUserWith([\App\Modules\Access\Permission::MinistriesViewAll]);

    $this->getJson('/api/v1/chats')->assertOk()->assertJsonCount(0, 'data');
});
```

- [x] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Feature/Chat/ChatAccessTest.php tests/Feature/Chat/ChatIndexTest.php`
Ожидается: FAIL.

- [x] **Шаг 3: Реализовать**

```php
final class ChatAccess
{
    public function __construct(private readonly PermissionResolver $permissions, private readonly EventAccess $events) {}

    public function canRead(User $user, Chat $chat): bool
    {
        if ($this->isMember($user, $chat)) {
            return true;
        }

        return $chat->type === ChatType::Ministry && $this->permissions->can($user, Permission::MinistriesViewAll);
    }

    public function canWrite(User $user, Chat $chat): bool
    {
        return $chat->archived_at === null && $this->isMember($user, $chat);
    }

    public function canModerate(User $user, Chat $chat): bool
    {
        return match ($chat->type) {
            ChatType::Direct => false,
            ChatType::Ministry => $this->permissions->canInMinistry($user, Permission::ChatModerate, (string) $chat->ministry_id)
                || $this->permissions->can($user, Permission::ChatsModerateAll),
            ChatType::Event => $this->events->canManage($user, $chat->event)
                || $this->permissions->can($user, Permission::ChatsModerateAll),
            ChatType::Group => $this->isOwner($user, $chat)
                || $this->permissions->can($user, Permission::ChatsModerateAll),
        };
    }

    public function canManageMembers(User $user, Chat $chat): bool
    {
        return $chat->type === ChatType::Group
            && ($this->isOwner($user, $chat) || $this->permissions->can($user, Permission::ChatsModerateAll));
    }
}
```

Ключи `ChatModerate` и `ChatsModerateAll` объявляет задача 5; в этой задаче `canModerate` временно возвращает `false` для всех, кроме владельца группы и управляющего событием, и задача 5 дописывает ветки прав — иначе `PermissionCoverageTest` потребует тесты на ключи, которых ещё нет.

`UnreadCounter::forChats` — одним запросом: `messages` с `chat_id IN (...)`, `deleted_at IS NULL`, `sender_user_id IS DISTINCT FROM :user`, и `(created_at, id) > (select created_at, id from messages where id = chat_members.last_read_message_id)` через `leftJoin` на `chat_members` и `leftJoin` на сообщение-курсор; группировка по `chat_id`. Для `last_read_message_id IS NULL` считаются все.

Канал: `Broadcast::channel('chat.{chatId}', fn (User $user, string $chatId) => ($chat = Chat::find($chatId)) !== null && app(ChatAccess::class)->canRead($user, $chat));`.

- [x] **Шаг 4: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Feature/Chat tests/Feature/Realtime`
Ожидается: PASS.

- [x] **Шаг 5: Коммит**

```bash
composer openapi && git add . && git commit -m "feat(chat): chat list, chat card, access rules and chat channel"
```

**Критерии готовности:**
- Доступ определяется участием; читатели `ministries.view_all` видят чат служения без права писать (раздел 6.4).
- Непрочитанное считается запросом, своё и удалённое не учитывается (раздел 5.6).
- Список чатов — «входящие»: по последнему сообщению, пустые личные скрыты (решение 3).
- Канал чата авторизуется той же функцией, что и HTTP.

---

### Задача 4: Отправка сообщений, история, вложения, ответ

**Файлы:**
- Создать: `app/Modules/Chat/Actions/SendMessage.php`; `Events/MessageSent.php`; `ChatMediaOwnerResolver.php`; `Policies/MessagePolicy.php`; `Http/Controllers/MessageController.php` (`index`, `store`), `Http/Requests/SendMessageRequest.php`, `Http/Requests/MessageHistoryRequest.php`; `Http/Resources/MessageResource.php`
- Изменить: `routes.php`, `AppServiceProvider` (тег `media.owner_resolvers`)
- Тест: `tests/Feature/Chat/SendMessageTest.php`, `tests/Feature/Chat/MessageHistoryTest.php`

**Интерфейсы:**
- Отдаёт наружу: `POST /chats/{id}/messages` с `{ body?, media_ids?: list<ulid>, reply_to_id? }` → `201 MessageResource`; `GET /chats/{id}/messages?before&after&limit` → `{ data: list<MessageResource>, next_before: string|null, next_after: string|null }`, по умолчанию 50 последних в хронологическом порядке.
- Отдаёт наружу: `SendMessage::handle(User $sender, Chat $chat, ?string $body, list<string> $mediaIds, ?string $replyToId): Message` — обновляет `last_message_id`, `last_message_at`, публикует `MessageSent(string $chatId, string $messageId, string $senderUserId)`.
- Отдаёт наружу: `MessageResource`: `id`, `chat_id`, `sender: {id, person: {id, full_name, photo_thumb_url}}|null`, `body`, `reply_to: {id, sender_name, body_preview, deleted}|null`, `attachments: list<MediaResource>`, `edited_at`, `deleted`, `created_at`, `cursor`.
- Коды ошибок: `message.empty`, `message.reply_other_chat`, `chat.archived`, `chat.read_only`, `media.not_owned`, `media.already_attached`.

- [ ] **Шаг 1: Написать падающие тесты**

`tests/Feature/Chat/SendMessageTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use App\Modules\Chat\Events\MessageSent;
use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\Models\Message;
use App\Modules\Directory\Models\User;
use App\Modules\Media\Models\Media;
use Illuminate\Support\Facades\Event as EventBus;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;

beforeEach(fn () => Storage::fake('media'));

it('sends a text message and updates the chat', function () {
    EventBus::fake([MessageSent::class]);
    $user = actingAsUser();
    $chat = Chat::factory()->withMembers($user, User::factory()->create())->create();

    $response = $this->postJson("/api/v1/chats/{$chat->id}/messages", ['body' => 'Привет'])
        ->assertCreated()
        ->assertJsonPath('data.body', 'Привет')
        ->assertJsonPath('data.sender.id', $user->id);

    expect($chat->fresh()->last_message_id)->toBe($response->json('data.id'))
        ->and($chat->fresh()->last_message_at)->not->toBeNull();
    EventBus::assertDispatched(MessageSent::class, fn (MessageSent $e) => $e->chatId === $chat->id);
});

it('refuses an empty message', function () {
    $user = actingAsUser();
    $chat = Chat::factory()->withMembers($user)->create();

    $this->postJson("/api/v1/chats/{$chat->id}/messages", ['body' => '   '])
        ->assertStatus(422)->assertJsonPath('code', 'message.empty');
});

it('sends an attachment-only message', function () {
    $user = actingAsUser();
    $chat = Chat::factory()->withMembers($user)->create();
    $media = Media::factory()->create(['uploader_user_id' => $user->id]);

    $this->postJson("/api/v1/chats/{$chat->id}/messages", ['media_ids' => [$media->id]])
        ->assertCreated()
        ->assertJsonPath('data.body', null)
        ->assertJsonPath('data.attachments.0.id', $media->id);
});

it('refuses someone elses media', function () {
    $user = actingAsUser();
    $chat = Chat::factory()->withMembers($user)->create();
    $media = Media::factory()->create(['uploader_user_id' => User::factory()->create()->id]);

    $this->postJson("/api/v1/chats/{$chat->id}/messages", ['media_ids' => [$media->id]])
        ->assertStatus(422)->assertJsonPath('code', 'media.not_owned');
    expect(Message::query()->count())->toBe(0);
});

it('limits the body to 4000 characters', function () {
    $user = actingAsUser();
    $chat = Chat::factory()->withMembers($user)->create();

    $this->postJson("/api/v1/chats/{$chat->id}/messages", ['body' => str_repeat('а', 4001)])
        ->assertStatus(422)->assertJsonValidationErrors('body');
});

it('replies only inside the same chat', function () {
    $user = actingAsUser();
    $chat = Chat::factory()->withMembers($user)->create();
    $other = Chat::factory()->withMembers($user)->create();
    $foreign = Message::factory()->for($other)->from($user)->create();
    $own = Message::factory()->for($chat)->from($user)->create(['body' => 'Исходное']);

    $this->postJson("/api/v1/chats/{$chat->id}/messages", ['body' => 'Ответ', 'reply_to_id' => $foreign->id])
        ->assertStatus(422)->assertJsonPath('code', 'message.reply_other_chat');
    $this->postJson("/api/v1/chats/{$chat->id}/messages", ['body' => 'Ответ', 'reply_to_id' => $own->id])
        ->assertCreated()->assertJsonPath('data.reply_to.body_preview', 'Исходное');
});

it('refuses writing to a read-only reader and to an archived chat', function () {
    $ministry = ministryWithRoles();
    $chat = Chat::query()->where('ministry_id', $ministry->id)->sole();
    actingAsUserWith([Permission::MinistriesViewAll]);
    $this->postJson("/api/v1/chats/{$chat->id}/messages", ['body' => 'Привет'])->assertForbidden();

    $user = actingAsUser();
    $archived = Chat::factory()->withMembers($user)->archived()->create();
    $this->postJson("/api/v1/chats/{$archived->id}/messages", ['body' => 'Привет'])
        ->assertStatus(422)->assertJsonPath('code', 'chat.archived');
});

it('serves a message attachment to members only', function () {
    $user = actingAsUser();
    $member = User::factory()->create();
    $chat = Chat::factory()->withMembers($user, $member)->create();
    $media = Media::factory()->create(['uploader_user_id' => $user->id]);
    $this->postJson("/api/v1/chats/{$chat->id}/messages", ['media_ids' => [$media->id]])->assertCreated();
    $url = URL::temporarySignedRoute('media.show', now()->addHour(), ['media' => $media->id]);

    $this->actingAs($member)->get($url)->assertOk();
    actingAsUser();
    $this->get($url)->assertForbidden();
});
```

`tests/Feature/Chat/MessageHistoryTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\Models\Message;
use App\Modules\Directory\Models\User;
use Carbon\CarbonImmutable;

function chatWithHistory(User $user, int $count): Chat
{
    $chat = Chat::factory()->withMembers($user)->create();
    foreach (range(1, $count) as $i) {
        Message::factory()->for($chat)->from($user)->at(CarbonImmutable::parse('2026-12-01 10:00:00')->addSeconds($i))->create(['body' => "m{$i}"]);
    }

    return $chat;
}

it('returns the latest fifty in chronological order with a cursor for older ones', function () {
    $user = actingAsUser();
    $chat = chatWithHistory($user, 60);

    $response = $this->getJson("/api/v1/chats/{$chat->id}/messages")->assertOk()->assertJsonCount(50, 'data');

    expect($response->json('data.0.body'))->toBe('m11')
        ->and($response->json('data.49.body'))->toBe('m60')
        ->and($response->json('next_before'))->not->toBeNull();
});

it('pages backwards with before', function () {
    $user = actingAsUser();
    $chat = chatWithHistory($user, 60);
    $before = $this->getJson("/api/v1/chats/{$chat->id}/messages")->json('next_before');

    $older = $this->getJson("/api/v1/chats/{$chat->id}/messages?before={$before}")->assertOk()->assertJsonCount(10, 'data');

    expect($older->json('data.0.body'))->toBe('m1')
        ->and($older->json('data.9.body'))->toBe('m10')
        ->and($older->json('next_before'))->toBeNull();
});

it('catches up forwards with after', function () {
    $user = actingAsUser();
    $chat = chatWithHistory($user, 5);
    $cursor = $this->getJson("/api/v1/chats/{$chat->id}/messages")->json('data.2.cursor');

    $newer = $this->getJson("/api/v1/chats/{$chat->id}/messages?after={$cursor}")->assertOk()->assertJsonCount(2, 'data');

    expect($newer->json('data.0.body'))->toBe('m4');
});

it('rejects a malformed cursor and a stranger', function () {
    $user = actingAsUser();
    $chat = chatWithHistory($user, 1);
    $this->getJson("/api/v1/chats/{$chat->id}/messages?before=junk")->assertStatus(422)->assertJsonPath('code', 'cursor.invalid');

    actingAsUser();
    $this->getJson("/api/v1/chats/{$chat->id}/messages")->assertForbidden();
});

it('shows deleted messages as placeholders and keeps replies to them', function () {
    $user = actingAsUser();
    $chat = Chat::factory()->withMembers($user)->create();
    $deleted = Message::factory()->for($chat)->from($user)->deleted()->create();
    Message::factory()->for($chat)->from($user)->replyTo($deleted)->create(['body' => 'Ответ']);

    $data = $this->getJson("/api/v1/chats/{$chat->id}/messages")->json('data');

    expect($data[0]['deleted'])->toBeTrue()
        ->and($data[0]['body'])->toBeNull()
        ->and($data[1]['reply_to']['deleted'])->toBeTrue();
});
```

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Feature/Chat/SendMessageTest.php tests/Feature/Chat/MessageHistoryTest.php`
Ожидается: FAIL.

- [ ] **Шаг 3: Реализовать**

```php
final class SendMessage
{
    /** @param list<string> $mediaIds */
    public function handle(User $sender, Chat $chat, ?string $body, array $mediaIds, ?string $replyToId): Message
    {
        if ($chat->archived_at !== null) {
            throw DomainRuleException::because('chat.archived', 'Чат архивирован, писать в него нельзя.');
        }

        $body = $body !== null && trim($body) !== '' ? trim($body) : null;

        if ($body === null && $mediaIds === []) {
            throw DomainRuleException::because('message.empty', 'Сообщение без текста должно содержать вложение.');
        }

        if ($replyToId !== null && ! Message::query()->where('id', $replyToId)->where('chat_id', $chat->id)->exists()) {
            throw DomainRuleException::because('message.reply_other_chat', 'Отвечать можно только на сообщение этого чата.');
        }

        $message = DB::transaction(function () use ($sender, $chat, $body, $mediaIds, $replyToId) {
            $message = $chat->messages()->create([
                'sender_user_id' => $sender->id,
                'body' => $body,
                'reply_to_id' => $replyToId,
            ]);

            app(SyncAttachments::class)->handle($message, $mediaIds, $sender);

            $chat->forceFill(['last_message_id' => $message->id, 'last_message_at' => $message->created_at])->save();

            return $message;
        });

        MessageSent::dispatch($chat->id, $message->id, $sender->id);

        return $message->load('sender.person', 'replyTo.sender.person', 'attachments.media');
    }
}
```

История: `limit` 1–100 (по умолчанию 50); без курсора — последние `limit` по `(created_at desc, id desc)`, перевёрнутые; `before` — `(created_at, id) < (?, ?)`; `after` — `>`; `next_before` — курсор первого элемента страницы, если есть более старые; `next_after` — курсор последнего, если есть более новые. Политика `MessagePolicy::create` → `ChatAccess::canWrite`; читатель `view_all` получает `403` (тест «read-only reader»). `ChatMediaOwnerResolver::canView`: вложение сообщения → `canRead(chat)`; аватар чата (`chats.avatar_media_id`) → `canRead`; иначе `null`.

- [ ] **Шаг 4: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Feature/Chat tests/Feature/Media`
Ожидается: PASS.

- [ ] **Шаг 5: Коммит**

```bash
composer openapi && git add . && git commit -m "feat(chat): sending messages with attachments and replies, cursor history"
```

**Критерии готовности:**
- Правила раздела 7.6 закрыты: участие, свои непривязанные вложения, `reply_to` в том же чате, обновление `last_message_*`, событие `MessageSent`.
- История листается в обе стороны по паре `(created_at, id)`; неверный курсор — понятная ошибка.
- Вложение сообщения видно только участникам чата (раздел 6.4).
- Удалённое сообщение — заглушка, ответ на него сохраняется.

---
## Блок 2. Сообщения: правка, удаление, прочитанное, закрепления

### Задача 5: Правка и удаление своих сообщений, удаление модератором

**Файлы:**
- Создать: `app/Modules/Chat/Actions/EditMessage.php`, `DeleteMessage.php`; `Events/MessageEdited.php`, `MessageDeleted.php`; `app/Modules/Media/Actions/DeleteAttachedMedia.php`; `Http/Requests/EditMessageRequest.php`
- Изменить: `MessageController` (`update`, `destroy`), `MessagePolicy` (`update`, `delete`), `ChatAccess::canModerate` (ветки прав), `app/Modules/Access/Permission.php` (`chat.moderate`, `chats.moderate_all`), `routes.php`
- Тест: `tests/Feature/Chat/EditDeleteMessageTest.php`, `tests/Feature/Chat/ModerationTest.php`

**Интерфейсы:**
- Отдаёт наружу: `Permission::ChatModerate = 'chat.moderate'` (служения, «Модерировать чат служения»), `Permission::ChatsModerateAll = 'chats.moderate_all'` (глобальное, «Модерировать любые чаты»).
- Отдаёт наружу: `PATCH /messages/{id}` с `{ body }` → `200 MessageResource` (только автор, `edited_at`); `DELETE /messages/{id}` → `204` (автор или модератор).
- Отдаёт наружу: `EditMessage::handle(Message $m, string $body): Message`, `DeleteMessage::handle(Message $m, User $actor): void` — при удалении не автором пишет журнал `message.deleted_by_moderator`; публикуют `MessageEdited(chatId, messageId)`, `MessageDeleted(chatId, messageId)`.
- Отдаёт наружу: `DeleteAttachedMedia::handle(Model $attachable): void` (Media) — отвязывает и физически удаляет все вложения объекта.
- Коды ошибок: `message.deleted`, `message.empty`.

- [ ] **Шаг 1: Написать падающие тесты**

`tests/Feature/Chat/EditDeleteMessageTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Chat\Events\MessageDeleted;
use App\Modules\Chat\Events\MessageEdited;
use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\Models\Message;
use App\Modules\Directory\Models\User;
use App\Modules\Media\Models\Media;
use App\Modules\Media\Models\MediaAttachment;
use Illuminate\Support\Facades\Event as EventBus;
use Illuminate\Support\Facades\Storage;

beforeEach(fn () => Storage::fake('media'));

it('lets the author edit their message at any time', function () {
    EventBus::fake([MessageEdited::class]);
    $user = actingAsUser();
    $chat = Chat::factory()->withMembers($user)->create();
    $message = Message::factory()->for($chat)->from($user)->at(now()->subMonths(6))->create(['body' => 'Старое']);

    $this->patchJson("/api/v1/messages/{$message->id}", ['body' => 'Новое'])
        ->assertOk()->assertJsonPath('data.body', 'Новое')->assertJsonPath('data.edited_at', fn ($v) => $v !== null);
    EventBus::assertDispatched(MessageEdited::class);
});

it('does not let another member edit it', function () {
    $author = User::factory()->create();
    $user = actingAsUser();
    $chat = Chat::factory()->withMembers($author, $user)->create();
    $message = Message::factory()->for($chat)->from($author)->create();

    $this->patchJson("/api/v1/messages/{$message->id}", ['body' => 'Х'])->assertForbidden();
});

it('refuses to edit a deleted message or make it empty', function () {
    $user = actingAsUser();
    $chat = Chat::factory()->withMembers($user)->create();
    $deleted = Message::factory()->for($chat)->from($user)->deleted()->create();
    $live = Message::factory()->for($chat)->from($user)->create();

    $this->patchJson("/api/v1/messages/{$deleted->id}", ['body' => 'Х'])->assertStatus(422)->assertJsonPath('code', 'message.deleted');
    $this->patchJson("/api/v1/messages/{$live->id}", ['body' => ' '])->assertStatus(422)->assertJsonPath('code', 'message.empty');
});

it('deletes own message into a placeholder and removes its files', function () {
    EventBus::fake([MessageDeleted::class]);
    $user = actingAsUser();
    $chat = Chat::factory()->withMembers($user)->create();
    $media = Media::factory()->create(['uploader_user_id' => $user->id, 'path' => '2026/12/a.jpg']);
    Storage::disk('media')->put('2026/12/a.jpg', 'bytes');
    $id = $this->postJson("/api/v1/chats/{$chat->id}/messages", ['body' => 'Текст', 'media_ids' => [$media->id]])->json('data.id');

    $this->deleteJson("/api/v1/messages/{$id}")->assertNoContent();

    $message = Message::query()->find($id);
    expect($message->deleted_at)->not->toBeNull()
        ->and($message->body)->toBeNull()
        ->and(MediaAttachment::query()->count())->toBe(0)
        ->and(Media::query()->find($media->id))->toBeNull();
    Storage::disk('media')->assertMissing('2026/12/a.jpg');
    EventBus::assertDispatched(MessageDeleted::class);
});

it('keeps the last message pointer valid after deletion', function () {
    $user = actingAsUser();
    $chat = Chat::factory()->withMembers($user)->create();
    $id = $this->postJson("/api/v1/chats/{$chat->id}/messages", ['body' => 'Единственное'])->json('data.id');

    $this->deleteJson("/api/v1/messages/{$id}")->assertNoContent();

    $this->getJson('/api/v1/chats')->assertJsonPath('data.0.last_message.deleted', true);
});
```

`tests/Feature/Chat/ModerationTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Access\Models\AuditEntry;
use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\Models\Message;
use App\Modules\Directory\Models\User;

it('lets chat.moderate delete others messages in the ministry chat and journals it', function () {
    $ministry = ministryWithRoles();
    $chat = Chat::query()->where('ministry_id', $ministry->id)->sole();
    $author = User::factory()->create();
    memberOf($ministry, $author->person);
    $message = Message::factory()->for($chat)->from($author)->create();
    $moderatorRole = Role::query()->create(['scope' => 'ministry', 'ministry_id' => $ministry->id, 'name' => 'Модератор']);
    $moderatorRole->permissions()->create(['permission' => Permission::ChatModerate->value]);
    $moderator = actingAsUser();
    memberOf($ministry, $moderator->person, [$moderatorRole->id]);

    $this->deleteJson("/api/v1/messages/{$message->id}")->assertNoContent();

    expect(AuditEntry::query()->where('action', 'message.deleted_by_moderator')->where('subject_id', $message->id)->exists())->toBeTrue();
});

it('does not let a plain member delete others messages', function () {
    $ministry = ministryWithRoles();
    $chat = Chat::query()->where('ministry_id', $ministry->id)->sole();
    $author = User::factory()->create();
    memberOf($ministry, $author->person);
    $message = Message::factory()->for($chat)->from($author)->create();
    $member = actingAsUser();
    memberOf($ministry, $member->person);

    $this->deleteJson("/api/v1/messages/{$message->id}")->assertForbidden();
});

it('lets chats.moderate_all delete in a group but not in a direct chat', function () {
    [$a, $b] = User::factory()->count(2)->create();
    $group = Chat::factory()->withMembers($a, $b)->create();
    $direct = Chat::factory()->direct($a, $b)->create();
    $inGroup = Message::factory()->for($group)->from($a)->create();
    $inDirect = Message::factory()->for($direct)->from($a)->create();
    actingAsUserWith([Permission::ChatsModerateAll]);

    $this->deleteJson("/api/v1/messages/{$inGroup->id}")->assertNoContent();
    $this->deleteJson("/api/v1/messages/{$inDirect->id}")->assertForbidden();
});

it('lets the group owner delete others messages', function () {
    $owner = actingAsUser();
    $member = User::factory()->create();
    $group = Chat::factory()->withMembers($owner, $member)->create();
    $group->members()->where('user_id', $owner->id)->update(['is_owner' => true]);
    $message = Message::factory()->for($group)->from($member)->create();

    $this->deleteJson("/api/v1/messages/{$message->id}")->assertNoContent();
});

it('reports can_moderate in the chat card', function () {
    $ministry = ministryWithRoles();
    $chat = Chat::query()->where('ministry_id', $ministry->id)->sole();
    actingAsUserWith([Permission::ChatsModerateAll, Permission::MinistriesViewAll]);

    $this->getJson("/api/v1/chats/{$chat->id}")->assertJsonPath('data.can_moderate', true);
});
```

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Feature/Chat/EditDeleteMessageTest.php tests/Feature/Chat/ModerationTest.php`
Ожидается: FAIL.

- [ ] **Шаг 3: Реализовать**

В `Permission`: `ChatModerate = 'chat.moderate'` (служения; «Модерировать чат служения»; «Удалять чужие сообщения и закреплять в чате служения.») и `ChatsModerateAll = 'chats.moderate_all'` (глобальное; «Модерировать любые чаты»; «Удалять чужие сообщения, закреплять, менять состав групп, архивировать чаты.»). `ChatAccess::canModerate` дописывается по коду из задачи 3.

```php
final class DeleteMessage
{
    public function handle(Message $message, User $actor): void
    {
        if ($message->isDeleted()) {
            throw DomainRuleException::because('message.deleted', 'Сообщение уже удалено.');
        }

        DB::transaction(function () use ($message) {
            app(DeleteAttachedMedia::class)->handle($message);
            $message->forceFill(['deleted_at' => now(), 'body' => null, 'reply_to_id' => null])->save();
        });

        if ($message->sender_user_id !== $actor->id) {
            app(AuditLogger::class)->record('message.deleted_by_moderator', $message, ['chat_id' => $message->chat_id]);
        }

        MessageDeleted::dispatch($message->chat_id, $message->id);
    }
}
```

`MessagePolicy::update` — автор и не удалено; `delete` — автор или `ChatAccess::canModerate($user, $message->chat)`. `DeleteAttachedMedia` в Media: находит `media_attachments` объекта, удаляет строки и вызывает `DeleteMediaFile` для каждого медиафайла. `last_message_id` не сбрасывается: список показывает заглушку (`last_message.deleted = true`).

- [ ] **Шаг 4: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Feature/Chat tests/Feature/Access/PermissionCoverageTest.php`
Ожидается: PASS.

- [ ] **Шаг 5: Коммит**

```bash
composer openapi && git add . && git commit -m "feat(chat): message editing, deletion with file cleanup, moderation permissions"
```

**Критерии готовности:**
- Оба ключа закрыты тестами по областям; личный чат не модерирует никто (раздел 6.4).
- Удаление физически убирает файлы и оставляет заглушку (раздел 7.6); удаление чужого попадает в журнал (раздел 6.5).
- Правка без ограничения по времени, но не для удалённого и не в пустоту.

---

### Задача 6: Прочитанное и непрочитанное

**Файлы:**
- Создать: `app/Modules/Chat/Actions/MarkChatRead.php`; `Events/ChatRead.php`; `Http/Controllers/ChatReadController.php`, `Http/Requests/MarkReadRequest.php`
- Изменить: `routes.php`
- Тест: `tests/Feature/Chat/ReadStateTest.php`

**Интерфейсы:**
- Отдаёт наружу: `POST /chats/{id}/read` с `{ message_id }` → `{ unread_count, unread_total }`; указатель двигается только вперёд.
- Отдаёт наружу: `MarkChatRead::handle(User $user, Chat $chat, string $messageId): void` — публикует `ChatRead(string $chatId, string $userId)` для пересчёта бейджей (задача 8).
- Коды ошибок: `message.not_in_chat`, `chat.read_only`.

- [ ] **Шаг 1: Написать падающие тесты**

```php
<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use App\Modules\Chat\Events\ChatRead;
use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\Models\ChatMember;
use App\Modules\Chat\Models\Message;
use App\Modules\Directory\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Event as EventBus;

function conversation(User $me, User $other, int $count): Chat
{
    $chat = Chat::factory()->withMembers($me, $other)->create();
    foreach (range(1, $count) as $i) {
        Message::factory()->for($chat)->from($other)->at(CarbonImmutable::parse('2026-12-01 10:00:00')->addSeconds($i))->create();
    }

    return $chat;
}

it('counts unread as messages after the pointer, excluding own and deleted', function () {
    $me = actingAsUser();
    $other = User::factory()->create();
    $chat = conversation($me, $other, 3);
    Message::factory()->for($chat)->from($me)->create();
    Message::factory()->for($chat)->from($other)->deleted()->create();

    $this->getJson("/api/v1/chats/{$chat->id}")->assertJsonPath('data.unread_count', 3);
});

it('moves the pointer and returns fresh counts', function () {
    EventBus::fake([ChatRead::class]);
    $me = actingAsUser();
    $other = User::factory()->create();
    $chat = conversation($me, $other, 3);
    $second = $chat->messages()->orderBy('created_at')->skip(1)->first();

    $this->postJson("/api/v1/chats/{$chat->id}/read", ['message_id' => $second->id])
        ->assertOk()->assertJsonPath('unread_count', 1)->assertJsonPath('unread_total', 1);

    expect(ChatMember::query()->where('chat_id', $chat->id)->where('user_id', $me->id)->sole()->last_read_message_id)->toBe($second->id);
    EventBus::assertDispatched(ChatRead::class);
});

it('never moves the pointer backwards', function () {
    $me = actingAsUser();
    $other = User::factory()->create();
    $chat = conversation($me, $other, 3);
    [$first, , $third] = $chat->messages()->orderBy('created_at')->get()->all();

    $this->postJson("/api/v1/chats/{$chat->id}/read", ['message_id' => $third->id])->assertJsonPath('unread_count', 0);
    $this->postJson("/api/v1/chats/{$chat->id}/read", ['message_id' => $first->id])->assertJsonPath('unread_count', 0);
});

it('rejects a message from another chat and a read-only reader', function () {
    $me = actingAsUser();
    $other = User::factory()->create();
    $chat = conversation($me, $other, 1);
    $foreign = Message::factory()->for(Chat::factory()->withMembers($me)->create())->from($me)->create();
    $this->postJson("/api/v1/chats/{$chat->id}/read", ['message_id' => $foreign->id])->assertStatus(422)->assertJsonPath('code', 'message.not_in_chat');

    $ministry = ministryWithRoles();
    $ministryChat = Chat::query()->where('ministry_id', $ministry->id)->sole();
    $msg = Message::factory()->for($ministryChat)->from($other)->create();
    actingAsUserWith([Permission::MinistriesViewAll]);
    $this->postJson("/api/v1/chats/{$ministryChat->id}/read", ['message_id' => $msg->id])->assertStatus(422)->assertJsonPath('code', 'chat.read_only');
});

it('sums unread across chats', function () {
    $me = actingAsUser();
    $other = User::factory()->create();
    conversation($me, $other, 2);
    $chat = conversation($me, $other, 3);

    $this->postJson("/api/v1/chats/{$chat->id}/read", ['message_id' => $chat->messages()->latest('created_at')->first()->id])
        ->assertJsonPath('unread_total', 2);
});
```

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Feature/Chat/ReadStateTest.php`
Ожидается: FAIL.

- [ ] **Шаг 3: Реализовать**

`MarkChatRead`: участие обязательно (`chat.read_only` для читателя); сообщение должно принадлежать чату (`message.not_in_chat`); если у участника уже есть указатель и он не старше нового по `(created_at, id)`, ничего не менять; иначе обновить и опубликовать `ChatRead`. Контроллер отдаёт `UnreadCounter::forChat` и `total`.

- [ ] **Шаг 4: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Feature/Chat`
Ожидается: PASS.

- [ ] **Шаг 5: Коммит**

```bash
composer openapi && git add . && git commit -m "feat(chat): read pointer and unread counters"
```

**Критерии готовности:**
- Формула непрочитанного из раздела 5.6 закрыта тестом: после указателя, не своё, не удалённое.
- Указатель не откатывается назад при повторной отправке старого сообщения с медленного клиента.
- Ответ сразу содержит новые счётчики — клиенту не нужен второй запрос.

---

### Задача 7: Закрепление сообщений

**Файлы:**
- Создать: `app/Modules/Chat/Actions/PinMessage.php`, `UnpinMessage.php`; `Events/ChatPinsChanged.php`; `Http/Controllers/PinController.php`
- Изменить: `ChatResource` (`pinned_messages`), `MessagePolicy` (`pin`), `routes.php`
- Тест: `tests/Feature/Chat/PinTest.php`

**Интерфейсы:**
- Отдаёт наружу: `POST /messages/{id}/pin`, `DELETE /messages/{id}/pin` → `200 { data: pinned_messages }`; `GET /chats/{id}` → `pinned_messages: list<MessageResource>` (свежие закрепления первыми, до 20).
- Отдаёт наружу: `ChatPinsChanged(string $chatId)`.
- Коды ошибок: `message.deleted`, `message.already_pinned`, `message.not_pinned`.

- [ ] **Шаг 1: Написать падающие тесты**

```php
<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use App\Modules\Chat\Events\ChatPinsChanged;
use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\Models\Message;
use App\Modules\Directory\Models\User;
use Illuminate\Support\Facades\Event as EventBus;

it('lets a moderator pin and unpin, and lists pins in the chat card', function () {
    EventBus::fake([ChatPinsChanged::class]);
    $ministry = ministryWithRoles();
    $chat = Chat::query()->where('ministry_id', $ministry->id)->sole();
    $author = User::factory()->create();
    memberOf($ministry, $author->person);
    $message = Message::factory()->for($chat)->from($author)->create(['body' => 'Важно']);
    actingAsUserWith([Permission::ChatsModerateAll, Permission::MinistriesViewAll]);

    $this->postJson("/api/v1/messages/{$message->id}/pin")->assertOk()->assertJsonPath('data.0.id', $message->id);
    $this->getJson("/api/v1/chats/{$chat->id}")->assertJsonPath('data.pinned_messages.0.body', 'Важно');
    $this->deleteJson("/api/v1/messages/{$message->id}/pin")->assertOk()->assertJsonPath('data', []);
    EventBus::assertDispatchedTimes(ChatPinsChanged::class, 2);
});

it('does not let a plain member pin', function () {
    $author = User::factory()->create();
    $me = actingAsUser();
    $chat = Chat::factory()->withMembers($author, $me)->create();
    $message = Message::factory()->for($chat)->from($author)->create();

    $this->postJson("/api/v1/messages/{$message->id}/pin")->assertForbidden();
});

it('refuses to pin a deleted message or pin twice', function () {
    $owner = actingAsUser();
    $chat = Chat::factory()->withMembers($owner)->create();
    $chat->members()->where('user_id', $owner->id)->update(['is_owner' => true]);
    $deleted = Message::factory()->for($chat)->from($owner)->deleted()->create();
    $live = Message::factory()->for($chat)->from($owner)->create();

    $this->postJson("/api/v1/messages/{$deleted->id}/pin")->assertStatus(422)->assertJsonPath('code', 'message.deleted');
    $this->postJson("/api/v1/messages/{$live->id}/pin")->assertOk();
    $this->postJson("/api/v1/messages/{$live->id}/pin")->assertStatus(422)->assertJsonPath('code', 'message.already_pinned');
});

it('unpins automatically when the pinned message is deleted', function () {
    $owner = actingAsUser();
    $chat = Chat::factory()->withMembers($owner)->create();
    $chat->members()->where('user_id', $owner->id)->update(['is_owner' => true]);
    $message = Message::factory()->for($chat)->from($owner)->create();
    $this->postJson("/api/v1/messages/{$message->id}/pin")->assertOk();

    $this->deleteJson("/api/v1/messages/{$message->id}")->assertNoContent();

    $this->getJson("/api/v1/chats/{$chat->id}")->assertJsonPath('data.pinned_messages', []);
});
```

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Feature/Chat/PinTest.php`
Ожидается: FAIL.

- [ ] **Шаг 3: Реализовать**

`PinMessage::handle(Message $m, User $actor)` — проверки `message.deleted`, `message.already_pinned`; запись в `chat_pinned_messages`; `ChatPinsChanged`. `UnpinMessage` — `message.not_pinned`. `DeleteMessage` (задача 5) дополняется удалением строки закрепления. Политика `pin` → `ChatAccess::canModerate`.

- [ ] **Шаг 4: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Feature/Chat`
Ожидается: PASS.

- [ ] **Шаг 5: Коммит**

```bash
composer openapi && git add . && git commit -m "feat(chat): pinned messages"
```

**Критерии готовности:**
- Закрепляют только модераторы чата (раздел 6.4); удаление сообщения снимает закрепление.
- Карточка чата отдаёт закреплённые сразу — шапка чата на клиенте не делает лишний запрос.

---
## Блок 3. Realtime и пуши

### Задача 8: Рассылка изменений в каналы чата и участников

**Файлы:**
- Создать: `app/Modules/Chat/Broadcasts/MessageSentBroadcast.php`, `MessageEditedBroadcast.php`, `MessageDeletedBroadcast.php`, `ChatPinnedBroadcast.php`, `ChatMembersChangedBroadcast.php`, `ChatUpdatedBroadcast.php`, `UnreadTotalBroadcast.php`; `Listeners/BroadcastChatChanges.php`
- Изменить: `AppServiceProvider` (подписка на `MessageSent`, `MessageEdited`, `MessageDeleted`, `ChatPinsChanged`, `ChatMembersChanged`, `ChatRead`)
- Тест: `tests/Feature/Chat/BroadcastTest.php`

**Интерфейсы:**
- Отдаёт наружу: в `private-chat.{id}` — `message.sent` (`{message: MessageResource}`), `message.edited` (`{message}`), `message.deleted` (`{message_id}`), `chat.pinned` (`{pinned_messages}`), `chat.members_changed` (`{added: list<userId>, removed: list<userId>}`); в `private-user.{id}` — `chat.updated` (`{chat: ChatListItemResource}` с `unread_count` этого участника) и `unread.total` (`{total}`).
- Все классы `ShouldBroadcast` с `broadcastAs()` из списка выше; слушатель `BroadcastChatChanges` — `ShouldQueue`.

- [ ] **Шаг 1: Написать падающие тесты**

```php
<?php

declare(strict_types=1);

use App\Modules\Chat\Broadcasts\ChatUpdatedBroadcast;
use App\Modules\Chat\Broadcasts\MessageDeletedBroadcast;
use App\Modules\Chat\Broadcasts\MessageSentBroadcast;
use App\Modules\Chat\Broadcasts\UnreadTotalBroadcast;
use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\Models\Message;
use App\Modules\Directory\Models\User;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Support\Facades\Event as EventBus;

beforeEach(fn () => EventBus::fake([MessageSentBroadcast::class, MessageDeletedBroadcast::class, ChatUpdatedBroadcast::class, UnreadTotalBroadcast::class]));

it('broadcasts a sent message to the chat channel and updates every member', function () {
    $me = actingAsUser();
    $other = User::factory()->create();
    $chat = Chat::factory()->withMembers($me, $other)->create();

    $id = $this->postJson("/api/v1/chats/{$chat->id}/messages", ['body' => 'Привет'])->json('data.id');

    EventBus::assertDispatched(MessageSentBroadcast::class, function (MessageSentBroadcast $b) use ($chat, $id) {
        $channel = $b->broadcastOn();

        return $channel instanceof PrivateChannel
            && $channel->name === "private-chat.{$chat->id}"
            && $b->broadcastAs() === 'message.sent'
            && $b->broadcastWith()['message']['id'] === $id;
    });
    EventBus::assertDispatched(ChatUpdatedBroadcast::class, fn (ChatUpdatedBroadcast $b) => $b->broadcastOn()->name === "private-user.{$other->id}" && $b->broadcastWith()['chat']['unread_count'] === 1);
    EventBus::assertDispatched(ChatUpdatedBroadcast::class, fn (ChatUpdatedBroadcast $b) => $b->broadcastOn()->name === "private-user.{$me->id}" && $b->broadcastWith()['chat']['unread_count'] === 0);
    EventBus::assertDispatched(UnreadTotalBroadcast::class, fn (UnreadTotalBroadcast $b) => $b->broadcastOn()->name === "private-user.{$other->id}" && $b->broadcastWith()['total'] === 1);
});

it('broadcasts deletions with the message id only', function () {
    $me = actingAsUser();
    $chat = Chat::factory()->withMembers($me)->create();
    $message = Message::factory()->for($chat)->from($me)->create();

    $this->deleteJson("/api/v1/messages/{$message->id}")->assertNoContent();

    EventBus::assertDispatched(MessageDeletedBroadcast::class, fn (MessageDeletedBroadcast $b) => $b->broadcastAs() === 'message.deleted' && $b->broadcastWith() === ['message_id' => $message->id]);
});

it('pushes the fresh unread total after reading', function () {
    $me = actingAsUser();
    $other = User::factory()->create();
    $chat = Chat::factory()->withMembers($me, $other)->create();
    $message = Message::factory()->for($chat)->from($other)->create();

    $this->postJson("/api/v1/chats/{$chat->id}/read", ['message_id' => $message->id])->assertOk();

    EventBus::assertDispatched(UnreadTotalBroadcast::class, fn (UnreadTotalBroadcast $b) => $b->broadcastOn()->name === "private-user.{$me->id}" && $b->broadcastWith()['total'] === 0);
});

it('does not broadcast chat updates to view_all readers who are not members', function () {
    $ministry = ministryWithRoles();
    $chat = Chat::query()->where('ministry_id', $ministry->id)->sole();
    $reader = User::factory()->create();
    $member = actingAsUser();
    memberOf($ministry, $member->person);

    $this->postJson("/api/v1/chats/{$chat->id}/messages", ['body' => 'Привет']);

    EventBus::assertNotDispatched(ChatUpdatedBroadcast::class, fn (ChatUpdatedBroadcast $b) => $b->broadcastOn()->name === "private-user.{$reader->id}");
});
```

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Feature/Chat/BroadcastTest.php`
Ожидается: FAIL.

- [ ] **Шаг 3: Реализовать**

```php
final class MessageSentBroadcast implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(private readonly Message $message) {}

    public function broadcastOn(): PrivateChannel { return new PrivateChannel("chat.{$this->message->chat_id}"); }

    public function broadcastAs(): string { return 'message.sent'; }

    /** @return array<string, mixed> */
    public function broadcastWith(): array
    {
        return ['message' => (new MessageResource($this->message->load('sender.person', 'replyTo', 'attachments.media')))->resolve()];
    }
}
```

`BroadcastChatChanges` обрабатывает все шесть доменных событий: для событий сообщений и закреплений отправляет соответствующий broadcast в канал чата, затем для каждого участника чата (`chat_members`, не читателей) — `ChatUpdatedBroadcast` с `ChatListItemResource` и его `unread_count`, и `UnreadTotalBroadcast` с `UnreadCounter::total`. `ChatRead` — только два последних для прочитавшего. `ChatMembersChanged` — `chat.members_changed` в канал чата плюс `chat.updated` добавленным и удалённым (удалённым — с признаком `removed: true`, чтобы клиент убрал чат из списка).

- [ ] **Шаг 4: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Feature/Chat`
Ожидается: PASS.

- [ ] **Шаг 5: Проверить живьём**

Выполнить: `make up`, `npm run dev` в `apps/web`, два браузера с разными аккаунтами в одном чате (клиент задачи 14 ещё не готов — использовать `wscat -c ws://localhost:3000/app/local-key` через прокси dev-сервера Nuxt, как ходит клиент (решение 15 плана фазы 2), с подпиской на канал через `/broadcasting/auth`).
Ожидается: событие `message.sent` приходит во второй сокет в течение секунды.

- [ ] **Шаг 6: Коммит**

```bash
git add . && git commit -m "feat(chat): broadcast message, pin, membership and unread changes"
```

**Критерии готовности:**
- Имена каналов и событий строго по разделу 9; тесты проверяют и канал, и имя, и полезную нагрузку.
- Каждый участник получает свой `unread_count`; читатели без участия ничего не получают в личный канал.
- Домен не знает о вещании: broadcast — отдельные классы, вызываемые слушателем в очереди.

---

### Задача 9: Пуши о сообщениях и «без звука»

**Файлы:**
- Создать: `app/Modules/Notifications/Notifications/ChatMessageNotification.php`; `Listeners/NotifyAboutChatMessage.php`; `app/Modules/Chat/Actions/MuteChat.php`, `UnmuteChat.php`; `Http/Controllers/MuteController.php`, `Http/Requests/MuteRequest.php`
- Изменить: `routes.php`, `ChatResource` (`muted_until`), `AppServiceProvider` (подписка на `MessageSent`)
- Тест: `tests/Feature/Chat/MuteTest.php`, `tests/Feature/Notifications/ChatPushTest.php`

**Интерфейсы:**
- Отдаёт наружу: `POST /chats/{id}/mute` с `{ until?: ISO 8601 }` (без `until` — навсегда, `muted_until = 9999-12-31`); `DELETE /chats/{id}/mute`; оба → `200 ChatResource`.
- Отдаёт наружу: `ChatMessageNotification(Message $message, Chat $chat)` — категория `chat`, `via()` → только `WebPushChannel` при разрешении `PushGate`; `title` — название чата (для личного — имя отправителя), `body` — «{Имя}: {текст}» или «{Имя}: Вложение», `url = /chats/{id}`, `tag = chat-{id}`.
- Отдаёт наружу: `NotifyAboutChatMessage` (`ShouldQueue`) на `MessageSent` — адресаты: участники кроме отправителя, не заглушённые, активные.

- [ ] **Шаг 1: Написать падающие тесты**

`tests/Feature/Chat/MuteTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\Models\ChatMember;

it('mutes forever, until a moment, and unmutes', function () {
    $me = actingAsUser();
    $chat = Chat::factory()->withMembers($me)->create();

    $this->postJson("/api/v1/chats/{$chat->id}/mute")->assertOk()->assertJsonPath('data.muted_until', fn ($v) => str_starts_with($v, '9999-12-31'));
    $this->postJson("/api/v1/chats/{$chat->id}/mute", ['until' => now()->addHours(8)->toISOString()])->assertOk();
    expect(ChatMember::query()->where('chat_id', $chat->id)->where('user_id', $me->id)->sole()->isMuted())->toBeTrue();

    $this->deleteJson("/api/v1/chats/{$chat->id}/mute")->assertOk()->assertJsonPath('data.muted_until', null);
});

it('does not let a non-member mute', function () {
    actingAsUser();
    $chat = Chat::factory()->create();

    $this->postJson("/api/v1/chats/{$chat->id}/mute")->assertForbidden();
});
```

`tests/Feature/Notifications/ChatPushTest.php`:

```php
<?php

declare(strict_types=1);

use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\Models\ChatMember;
use App\Modules\Directory\Models\User;
use App\Modules\Notifications\Channels\WebPushChannel;
use App\Modules\Notifications\Models\NotificationSetting;
use App\Modules\Notifications\Models\PushSubscription;
use App\Modules\Notifications\Notifications\ChatMessageNotification;
use Illuminate\Support\Facades\Notification;

beforeEach(fn () => Notification::fake());

it('pushes to every member except the sender with a chat tag', function () {
    $me = actingAsUser();
    $me->person->update(['last_name' => 'Иванов', 'first_name' => 'Иван']);
    $other = User::factory()->create();
    $chat = Chat::factory()->withMembers($me, $other)->create(['title' => 'Молодёжка']);

    $this->postJson("/api/v1/chats/{$chat->id}/messages", ['body' => 'Всем привет'])->assertCreated();

    Notification::assertSentTo($other, ChatMessageNotification::class, function (ChatMessageNotification $n) use ($other, $chat) {
        $data = $n->toArray($other);

        return $data['category'] === 'chat'
            && $data['tag'] === "chat-{$chat->id}"
            && $data['url'] === "/chats/{$chat->id}"
            && $data['title'] === 'Молодёжка'
            && $data['body'] === 'Иванов Иван: Всем привет';
    });
    Notification::assertNotSentTo($me, ChatMessageNotification::class);
});

it('skips muted members and members with the chat category off', function () {
    $me = actingAsUser();
    $muted = User::factory()->create();
    $quiet = User::factory()->create();
    $chat = Chat::factory()->withMembers($me, $muted, $quiet)->create();
    ChatMember::query()->where('chat_id', $chat->id)->where('user_id', $muted->id)->update(['muted_until' => now()->addDay()]);
    NotificationSetting::query()->create(['user_id' => $quiet->id, 'category' => 'chat', 'enabled' => false]);
    PushSubscription::factory()->for($quiet)->create();

    $this->postJson("/api/v1/chats/{$chat->id}/messages", ['body' => 'Тихо']);

    Notification::assertNotSentTo($muted, ChatMessageNotification::class);
    Notification::assertSentTo($quiet, ChatMessageNotification::class, fn (ChatMessageNotification $n) => $n->via($quiet) === []);
});

it('uses webpush only and never the database or the broadcast channel', function () {
    $sender = User::factory()->create();
    $recipient = User::factory()->create();
    PushSubscription::factory()->for($recipient)->create();
    $chat = Chat::factory()->withMembers($sender, $recipient)->create();
    $message = \App\Modules\Chat\Models\Message::factory()->for($chat)->from($sender)->create(['body' => null]);

    $notification = new ChatMessageNotification($message, $chat);

    expect($notification->via($recipient))->toBe([WebPushChannel::class])
        ->and($notification->toArray($recipient)['body'])->toContain('Вложение');
});

it('titles a direct chat push with the sender name', function () {
    $me = actingAsUser();
    $me->person->update(['last_name' => 'Иванов', 'first_name' => 'Иван']);
    $other = User::factory()->create();
    $chat = Chat::factory()->direct($me, $other)->create();

    $this->postJson("/api/v1/chats/{$chat->id}/messages", ['body' => 'Привет']);

    Notification::assertSentTo($other, ChatMessageNotification::class, fn (ChatMessageNotification $n) => $n->toArray($other)['title'] === 'Иванов Иван');
});
```

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Feature/Chat/MuteTest.php tests/Feature/Notifications/ChatPushTest.php`
Ожидается: FAIL.

- [ ] **Шаг 3: Реализовать**

```php
final class ChatMessageNotification extends AppNotification
{
    public function __construct(private readonly Message $message, private readonly Chat $chat) {}

    public function category(): NotificationCategory { return NotificationCategory::Chat; }

    /** @return list<string> */
    public function via(object $notifiable): array
    {
        return $notifiable instanceof User && app(PushGate::class)->allows($notifiable, $this) ? [WebPushChannel::class] : [];
    }

    public function title(): string
    {
        return $this->chat->type === ChatType::Direct ? $this->senderName() : app(ChatTitle::class)->for($this->chat, null);
    }

    public function body(): string
    {
        return $this->senderName().': '.($this->message->body ?? 'Вложение');
    }

    public function url(): string { return "/chats/{$this->chat->id}"; }

    public function tag(): string { return "chat-{$this->chat->id}"; }

    private function senderName(): string
    {
        return $this->message->sender?->person->fullName() ?? 'Удалённый человек';
    }
}
```

`ChatTitle::for(Chat $chat, ?User $viewer): string` выделяется из `ChatResource` задачи 3 (служение, событие, группа, собеседник). `NotifyAboutChatMessage`: `ChatMember` чата, кроме `sender_user_id`, с `muted_until IS NULL OR muted_until <= now()`, аккаунты активные; `Notification::send` чанками по 200. `MuteChat::handle(User, Chat, ?CarbonImmutable $until)` — `muted_until = $until ?? '9999-12-31 00:00:00'`; `UnmuteChat` — `null`; политика — участие.

- [ ] **Шаг 4: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Feature/Chat tests/Feature/Notifications`
Ожидается: PASS.

- [ ] **Шаг 5: Коммит**

```bash
composer openapi && git add . && git commit -m "feat(chat,notifications): chat message push with mute and category"
```

**Критерии готовности:**
- Строка `chat` таблицы 7.7 закрыта: адресаты — участники кроме автора и заглушённых; каналы — только `webpush`; тег `chat-{id}`.
- «Без звука» сохраняет участие и историю, отключает только пуши (CONTEXT.md, «Без звука»).
- Личный чат подписан именем собеседника, группа и служение — своим названием.

---
## Блок 4. Группы, личные чаты, чат события

### Задача 10: Группы — создание, состав, название и аватар, выход, архивация

**Файлы:**
- Создать: `app/Modules/Chat/Actions/CreateGroupChat.php`, `UpdateGroupChat.php`, `AddGroupMembers.php`, `RemoveGroupMember.php`, `LeaveGroup.php`; `Http/Controllers/ChatMemberController.php`; `Http/Requests/CreateChatRequest.php`, `UpdateChatRequest.php`, `AddMembersRequest.php`
- Изменить: `ChatController` (`store`, `update`, `archive`, `avatar`), `ChatPolicy`, `app/Modules/Access/Permission.php` (`chats.create_groups`), `routes.php`
- Тест: `tests/Feature/Chat/GroupChatTest.php`

**Интерфейсы:**
- Отдаёт наружу: `Permission::ChatsCreateGroups = 'chats.create_groups'` (глобальное, «Создавать группы»).
- Отдаёт наружу: `POST /chats` с `{ type: 'group', title, member_ids: list<ulid> }` → `201 ChatResource` (создатель — владелец и участник); `PATCH /chats/{id}` с `{ title }`; `PUT /chats/{id}/avatar` с `{ media_id }`; `POST /chats/{id}/members` с `{ user_ids }`; `DELETE /chats/{id}/members/{userId}`; `POST /chats/{id}/leave`; `POST /chats/{id}/archive` (журнал `chat.archived`).
- Коды ошибок: `chat.owner_cannot_leave`, `chat.members_managed_by_sync` (попытка править состав чата служения или события), `chat.not_group`, `chat.archived`, `chat.member_disabled`.

- [ ] **Шаг 1: Написать падающие тесты**

```php
<?php

declare(strict_types=1);

use App\Modules\Access\Models\AuditEntry;
use App\Modules\Access\Permission;
use App\Modules\Chat\Events\ChatMembersChanged;
use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\Models\ChatMember;
use App\Modules\Directory\Models\User;
use App\Modules\Media\Models\Media;
use Illuminate\Support\Facades\Event as EventBus;

it('denies creating a group without chats.create_groups', function () {
    actingAsUser();

    $this->postJson('/api/v1/chats', ['type' => 'group', 'title' => 'Поездка', 'member_ids' => [User::factory()->create()->id]])->assertForbidden();
});

it('creates a group with the creator as owner and the listed members', function () {
    EventBus::fake([ChatMembersChanged::class]);
    $me = actingAsUserWith([Permission::ChatsCreateGroups]);
    [$a, $b] = User::factory()->count(2)->create();

    $this->postJson('/api/v1/chats', ['type' => 'group', 'title' => 'Поездка', 'member_ids' => [$a->id, $b->id]])
        ->assertCreated()
        ->assertJsonPath('data.type', 'group')
        ->assertJsonPath('data.title', 'Поездка')
        ->assertJsonPath('data.is_owner', true)
        ->assertJsonPath('data.can_manage_members', true)
        ->assertJsonCount(3, 'data.members');

    expect(ChatMember::query()->where('is_owner', true)->sole()->user_id)->toBe($me->id);
});

it('requires at least one other member and rejects disabled accounts', function () {
    actingAsUserWith([Permission::ChatsCreateGroups]);
    $this->postJson('/api/v1/chats', ['type' => 'group', 'title' => 'Пусто', 'member_ids' => []])->assertStatus(422)->assertJsonValidationErrors('member_ids');

    $disabled = User::factory()->create(['disabled_at' => now()]);
    $this->postJson('/api/v1/chats', ['type' => 'group', 'title' => 'Х', 'member_ids' => [$disabled->id]])->assertStatus(422)->assertJsonPath('code', 'chat.member_disabled');
});

it('lets the owner rename, set an avatar, add and remove members', function () {
    $me = actingAsUserWith([Permission::ChatsCreateGroups]);
    $a = User::factory()->create();
    $b = User::factory()->create();
    $chat = $this->postJson('/api/v1/chats', ['type' => 'group', 'title' => 'Поездка', 'member_ids' => [$a->id]])->json('data.id');
    $media = Media::factory()->create(['uploader_user_id' => $me->id]);

    $this->patchJson("/api/v1/chats/{$chat}", ['title' => 'Поездка в горы'])->assertOk()->assertJsonPath('data.title', 'Поездка в горы');
    $this->putJson("/api/v1/chats/{$chat}/avatar", ['media_id' => $media->id])->assertOk()->assertJsonPath('data.avatar_url', fn ($v) => $v !== null);
    $this->postJson("/api/v1/chats/{$chat}/members", ['user_ids' => [$b->id]])->assertOk()->assertJsonCount(3, 'data.members');
    $this->deleteJson("/api/v1/chats/{$chat}/members/{$a->id}")->assertOk()->assertJsonCount(2, 'data.members');
});

it('does not let a plain member manage the group', function () {
    $owner = User::factory()->create();
    $me = actingAsUser();
    $chat = Chat::factory()->withMembers($owner, $me)->create();
    $chat->members()->where('user_id', $owner->id)->update(['is_owner' => true]);

    $this->patchJson("/api/v1/chats/{$chat->id}", ['title' => 'Х'])->assertForbidden();
    $this->postJson("/api/v1/chats/{$chat->id}/members", ['user_ids' => [User::factory()->create()->id]])->assertForbidden();
    $this->postJson("/api/v1/chats/{$chat->id}/archive")->assertForbidden();
});

it('lets a member leave but not the owner', function () {
    $owner = User::factory()->create();
    $me = actingAsUser();
    $chat = Chat::factory()->withMembers($owner, $me)->create();
    $chat->members()->where('user_id', $owner->id)->update(['is_owner' => true]);

    $this->postJson("/api/v1/chats/{$chat->id}/leave")->assertNoContent();
    expect(ChatMember::query()->where('chat_id', $chat->id)->where('user_id', $me->id)->exists())->toBeFalse();

    $this->actingAs($owner)->postJson("/api/v1/chats/{$chat->id}/leave")->assertStatus(422)->assertJsonPath('code', 'chat.owner_cannot_leave');
});

it('refuses to edit the members of a ministry chat by hand', function () {
    $ministry = ministryWithRoles();
    $chat = Chat::query()->where('ministry_id', $ministry->id)->sole();
    actingAsUserWith([Permission::ChatsModerateAll]);

    $this->postJson("/api/v1/chats/{$chat->id}/members", ['user_ids' => [User::factory()->create()->id]])
        ->assertStatus(422)->assertJsonPath('code', 'chat.members_managed_by_sync');
    $this->postJson("/api/v1/chats/{$chat->id}/leave")->assertStatus(422)->assertJsonPath('code', 'chat.not_group');
});

it('archives a group with a journal entry and makes it read-only', function () {
    $me = actingAsUserWith([Permission::ChatsCreateGroups]);
    $chat = $this->postJson('/api/v1/chats', ['type' => 'group', 'title' => 'Поездка', 'member_ids' => [User::factory()->create()->id]])->json('data.id');

    $this->postJson("/api/v1/chats/{$chat}/archive")->assertOk()->assertJsonPath('data.archived', true);

    expect(AuditEntry::query()->where('action', 'chat.archived')->where('subject_id', $chat)->exists())->toBeTrue();
    $this->postJson("/api/v1/chats/{$chat}/messages", ['body' => 'Эй'])->assertStatus(422)->assertJsonPath('code', 'chat.archived');
});

it('lets chats.moderate_all manage and archive someone elses group', function () {
    [$owner, $member] = User::factory()->count(2)->create();
    $chat = Chat::factory()->withMembers($owner, $member)->create();
    $chat->members()->where('user_id', $owner->id)->update(['is_owner' => true]);
    actingAsUserWith([Permission::ChatsModerateAll]);

    $this->deleteJson("/api/v1/chats/{$chat->id}/members/{$member->id}")->assertOk();
    $this->postJson("/api/v1/chats/{$chat->id}/archive")->assertOk();
});
```

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Feature/Chat/GroupChatTest.php`
Ожидается: FAIL.

- [ ] **Шаг 3: Реализовать**

В `Permission`: `ChatsCreateGroups = 'chats.create_groups'` (глобальное; «Создавать группы»; «Создавать групповые чаты с произвольным составом и управлять ими.»). `CreateGroupChat::handle(User $owner, string $title, list<string> $memberIds): Chat` — проверяет, что все аккаунты существуют и не отключены (`chat.member_disabled`), создаёт чат, участника-владельца и остальных, публикует `ChatMembersChanged`. `AddGroupMembers`/`RemoveGroupMember` — только для `type = group` (`chat.members_managed_by_sync` для служения и события, `chat.not_group` для личного); удаление владельца запрещено (`chat.owner_cannot_leave`). `LeaveGroup` — `chat.not_group` для остальных типов. Архивация — `ArchiveChat` задачи 2 под `ChatPolicy::archive` (владелец или `chats.moderate_all`; служение и событие — `chat.archived_with_parent`). Аватар — `AttachDirectMedia::handle($media, MediaKind::Image)` и `avatar_media_id`.

- [ ] **Шаг 4: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Feature/Chat tests/Feature/Access/PermissionCoverageTest.php`
Ожидается: PASS.

- [ ] **Шаг 5: Коммит**

```bash
composer openapi && git add . && git commit -m "feat(chat): group chats with owner-managed membership, avatar and archiving"
```

**Критерии готовности:**
- Группу создаёт носитель `chats.create_groups`, управляет владелец, участники выходят сами (раздел 7.6); владелец выйти не может (решение 4).
- Состав чатов служений и событий руками не правится — только синхронизацией.
- Архивация группы попадает в журнал и делает чат только для чтения.

---

### Задача 11: Личные чаты

**Файлы:**
- Создать: `app/Modules/Chat/Actions/OpenDirectChat.php`
- Изменить: `ChatController::store` (ветка `direct`), `CreateChatRequest`, `app/Modules/Access/Permission.php` (`chats.dm`), `ChatPolicy`
- Тест: `tests/Feature/Chat/DirectChatTest.php`

**Интерфейсы:**
- Отдаёт наружу: `Permission::ChatsDm = 'chats.dm'` (глобальное, «Писать в личные чаты»).
- Отдаёт наружу: `POST /chats` с `{ type: 'direct', user_id }` → `201` при создании, `200` при существующем; оба — `ChatResource`.
- Отдаёт наружу: `OpenDirectChat::handle(User $me, User $other): array{chat: Chat, created: bool}`.
- Коды ошибок: `chat.direct_self`, `chat.direct_user_disabled`.

- [ ] **Шаг 1: Написать падающие тесты**

```php
<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use App\Modules\Chat\Models\Chat;
use App\Modules\Directory\Models\User;

it('denies opening a direct chat without chats.dm', function () {
    actingAsUser();

    $this->postJson('/api/v1/chats', ['type' => 'direct', 'user_id' => User::factory()->create()->id])->assertForbidden();
});

it('opens a direct chat once for a pair regardless of who starts', function () {
    $me = actingAsUserWith([Permission::ChatsDm]);
    $other = User::factory()->create();
    $other->person->update(['last_name' => 'Петрова', 'first_name' => 'Анна']);

    $first = $this->postJson('/api/v1/chats', ['type' => 'direct', 'user_id' => $other->id])->assertCreated()->assertJsonPath('data.title', 'Петрова Анна')->json('data.id');
    $second = $this->postJson('/api/v1/chats', ['type' => 'direct', 'user_id' => $other->id])->assertOk()->json('data.id');

    actingAsUserWith([Permission::ChatsDm], $other->person);
    $third = $this->postJson('/api/v1/chats', ['type' => 'direct', 'user_id' => $me->id])->assertOk()->json('data.id');

    expect($first)->toBe($second)->toBe($third)->and(Chat::query()->count())->toBe(1);
});

it('lets the other side reply without chats.dm', function () {
    $me = actingAsUserWith([Permission::ChatsDm]);
    $other = User::factory()->create();
    $chat = $this->postJson('/api/v1/chats', ['type' => 'direct', 'user_id' => $other->id])->json('data.id');

    $this->actingAs($other)->postJson("/api/v1/chats/{$chat}/messages", ['body' => 'Отвечаю'])->assertCreated();
});

it('refuses a chat with oneself or with a disabled account', function () {
    $me = actingAsUserWith([Permission::ChatsDm]);
    $this->postJson('/api/v1/chats', ['type' => 'direct', 'user_id' => $me->id])->assertStatus(422)->assertJsonPath('code', 'chat.direct_self');

    $disabled = User::factory()->create(['disabled_at' => now()]);
    $this->postJson('/api/v1/chats', ['type' => 'direct', 'user_id' => $disabled->id])->assertStatus(422)->assertJsonPath('code', 'chat.direct_user_disabled');
});

it('appears in both lists only after the first message', function () {
    $me = actingAsUserWith([Permission::ChatsDm]);
    $other = User::factory()->create();
    $chat = $this->postJson('/api/v1/chats', ['type' => 'direct', 'user_id' => $other->id])->json('data.id');
    $this->getJson('/api/v1/chats')->assertJsonCount(0, 'data');

    $this->postJson("/api/v1/chats/{$chat}/messages", ['body' => 'Привет']);

    $this->getJson('/api/v1/chats')->assertJsonCount(1, 'data');
    $this->actingAs($other)->getJson('/api/v1/chats')->assertJsonCount(1, 'data')->assertJsonPath('data.0.unread_count', 1);
});
```

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Feature/Chat/DirectChatTest.php`
Ожидается: FAIL.

- [ ] **Шаг 3: Реализовать**

В `Permission`: `ChatsDm = 'chats.dm'` (глобальное; «Писать в личные чаты»; «Начинать личный чат с любым аккаунтом.»).

```php
final class OpenDirectChat
{
    /** @return array{chat: Chat, created: bool} */
    public function handle(User $me, User $other): array
    {
        if ($me->id === $other->id) {
            throw DomainRuleException::because('chat.direct_self', 'Нельзя открыть чат с самим собой.');
        }

        if ($other->isDisabled()) {
            throw DomainRuleException::because('chat.direct_user_disabled', 'Аккаунт собеседника отключён.');
        }

        $key = Chat::directKey($me->id, $other->id);
        $existing = Chat::query()->where('direct_key', $key)->first();

        if ($existing !== null) {
            return ['chat' => $existing, 'created' => false];
        }

        $chat = DB::transaction(function () use ($me, $other, $key) {
            $chat = Chat::query()->create(['type' => ChatType::Direct, 'direct_key' => $key, 'created_by_user_id' => $me->id]);
            foreach ([$me, $other] as $user) {
                ChatMember::query()->create(['chat_id' => $chat->id, 'user_id' => $user->id, 'joined_at' => now()]);
            }

            return $chat;
        });

        return ['chat' => $chat, 'created' => true];
    }
}
```

Политика создания: `chats.dm` только для того, кто открывает; отвечать в существующий личный чат может любой участник (участие даёт `canWrite`).

- [ ] **Шаг 4: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Feature/Chat tests/Feature/Access/PermissionCoverageTest.php`
Ожидается: PASS.

- [ ] **Шаг 5: Коммит**

```bash
composer openapi && git add . && git commit -m "feat(chat): direct chats keyed by the account pair"
```

**Критерии готовности:**
- `direct_key` не даёт завести второй чат для пары (раздел 7.6); повторное открытие возвращает тот же чат.
- Право `chats.dm` нужно только инициатору; собеседник отвечает без него.
- Пустой личный чат не засоряет списки (решение 3).

---

### Задача 12: Чат события

**Файлы:**
- Создать: `app/Modules/Chat/Actions/CreateEventChat.php`, `SyncEventChatMember.php`; `Listeners/SyncEventChatOnAssignment.php`; `Http/Controllers/EventChatController.php`
- Изменить: `Listeners/AddNewUserToChats.php` (ветка событий), `app/Modules/Calendar/Http/Resources/EventResource.php` (`chat_id`), `routes.php`, `AppServiceProvider`
- Тест: `tests/Feature/Chat/EventChatTest.php`

**Интерфейсы:**
- Отдаёт наружу: `POST /events/{id}/chat` → `201 ChatResource` (или `200`, если чат уже есть) — право `EventAccess::canManage`.
- Отдаёт наружу: `CreateEventChat::handle(Event $event, User $creator): array{chat: Chat, created: bool}` — участники: аккаунты назначенных плюс создатель.
- Отдаёт наружу: `SyncEventChatMember::add(Chat, User)`, `remove(Chat, User)` — снятие только если у человека не осталось назначений в событии.
- Отдаёт наружу: `EventResource.chat_id: string|null`.
- Потребляет: `AssignmentCreated`, `AssignmentRemoved` (фаза 3), `UserCreated` (фаза 1), `EventAccess` (фаза 3).

- [ ] **Шаг 1: Написать падающие тесты**

```php
<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventAssignment;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\Models\ChatMember;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;

it('lets the event manager create the chat with the assigned accounts', function () {
    $manager = actingAsUserWith([Permission::CalendarChurchManage]);
    $event = Event::factory()->create(['title' => 'Крещение']);
    $slot = EventSlot::factory()->for($event)->create(['required_count' => 3]);
    $withAccount = Person::factory()->has(User::factory())->create();
    $withoutAccount = Person::factory()->create();
    EventAssignment::factory()->for($slot)->for($withAccount)->create();
    EventAssignment::factory()->for($slot)->for($withoutAccount)->create();

    $response = $this->postJson("/api/v1/events/{$event->id}/chat")->assertCreated()->assertJsonPath('data.type', 'event')->assertJsonPath('data.title', 'Крещение');
    $chatId = $response->json('data.id');

    expect(ChatMember::query()->where('chat_id', $chatId)->pluck('user_id')->all())->toEqualCanonicalizing([$manager->id, $withAccount->user->id]);
    $this->postJson("/api/v1/events/{$event->id}/chat")->assertOk()->assertJsonPath('data.id', $chatId);
    $this->getJson("/api/v1/events/{$event->id}")->assertJsonPath('data.chat_id', $chatId);
});

it('denies creating the chat to a non-manager', function () {
    actingAsUser();
    $event = Event::factory()->create();

    $this->postJson("/api/v1/events/{$event->id}/chat")->assertForbidden();
});

it('adds and removes members as assignments change', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $event = Event::factory()->create();
    $slotA = EventSlot::factory()->for($event)->create();
    $slotB = EventSlot::factory()->for($event)->create();
    $chat = Chat::query()->find($this->postJson("/api/v1/events/{$event->id}/chat")->json('data.id'));
    $person = Person::factory()->has(User::factory())->create();

    $a = $this->postJson("/api/v1/slots/{$slotA->id}/assignments", ['person_id' => $person->id])->json('data.id');
    $b = $this->postJson("/api/v1/slots/{$slotB->id}/assignments", ['person_id' => $person->id])->json('data.id');
    expect(ChatMember::query()->where('chat_id', $chat->id)->where('user_id', $person->user->id)->exists())->toBeTrue();

    $this->deleteJson("/api/v1/assignments/{$a}");
    expect(ChatMember::query()->where('chat_id', $chat->id)->where('user_id', $person->user->id)->exists())->toBeTrue();

    $this->deleteJson("/api/v1/assignments/{$b}");
    expect(ChatMember::query()->where('chat_id', $chat->id)->where('user_id', $person->user->id)->exists())->toBeFalse();
});

it('adds a newly created account to the chats of its events', function () {
    actingAsUserWith([Permission::CalendarChurchManage, Permission::PeopleInvite]);
    $event = Event::factory()->create();
    $chat = Chat::query()->find($this->postJson("/api/v1/events/{$event->id}/chat")->json('data.id'));
    $person = Person::factory()->create();
    $person->globalRoles()->attach(\App\Modules\Access\Models\Role::factory()->global()->create());
    EventAssignment::factory()->for(EventSlot::factory()->for($event)->create())->for($person)->create();

    $token = str($this->postJson("/api/v1/people/{$person->id}/invite")->json('data.url'))->afterLast('/')->toString();
    auth()->logout();
    $this->postJson("/api/v1/access-links/{$token}/accept", ['login' => 'x@example.com', 'password' => 'secret123', 'password_confirmation' => 'secret123'])->assertCreated();

    expect(ChatMember::query()->where('chat_id', $chat->id)->where('user_id', $person->fresh()->user->id)->exists())->toBeTrue();
});

it('lets the event manager moderate the event chat', function () {
    $ministry = ministryWithRoles();
    $leader = actingAsUser();
    memberOf($ministry, $leader->person, [$ministry->roles()->where('name', 'Лидер')->sole()->id]);
    $event = Event::factory()->ministry($ministry)->create();
    $chat = Chat::query()->find($this->postJson("/api/v1/events/{$event->id}/chat")->json('data.id'));
    $member = Person::factory()->has(User::factory())->create();
    EventAssignment::factory()->for(EventSlot::factory()->for($event)->create())->for($member)->create();
    $message = \App\Modules\Chat\Models\Message::factory()->for($chat)->from($member->user)->create();

    $this->getJson("/api/v1/chats/{$chat->id}")->assertJsonPath('data.can_moderate', true);
    $this->deleteJson("/api/v1/messages/{$message->id}")->assertNoContent();
});
```

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `./vendor/bin/pest tests/Feature/Chat/EventChatTest.php`
Ожидается: FAIL.

- [ ] **Шаг 3: Реализовать**

`CreateEventChat`: `firstOrCreate(['event_id' => …], ['type' => ChatType::Event, 'created_by_user_id' => $creator->id])`; участники — аккаунты назначенных (`event_assignments → people → users`, активные) плюс создатель. `SyncEventChatOnAssignment`: `AssignmentCreated` с `userId` и существующим чатом события → `add`; `AssignmentRemoved` → `remove`, если `EventAssignment::whereHas('slot', event)->where('person_id')` больше не существует. `AddNewUserToChats` дополняется веткой: события `scheduled` с назначением человека и чатом → `add`. Маршрут `events/{event}/chat` объявляется в `app/Modules/Chat/routes.php`; политика — `EventAccess::canManage`.

- [ ] **Шаг 4: Запустить тесты, убедиться что проходят**

Выполнить: `./vendor/bin/pest tests/Feature/Chat tests/Feature/Calendar`
Ожидается: PASS.

- [ ] **Шаг 5: Коммит**

```bash
composer openapi && git add . && git commit -m "feat(chat): event chats created by managers and synchronised with assignments"
```

**Критерии готовности:**
- Чат события создаётся по кнопке управляющим, состав повторяет назначенных (CONTEXT.md, «Чат события»); человек без аккаунта догоняется при приёме приглашения.
- Снятие одного из двух назначений участника из чата не выкидывает.
- Модерация чата события — у управляющих событием (раздел 6.4), через `EventAccess`.
- Calendar о чате не знает: маршрут и слушатели живут в Chat, `chat_id` в ресурсе читается из `chats.event_id`.

---
## Блок 5. Клиент

### Задача 13: Store чатов, список, бейдж, живые обновления

**Файлы:**
- Создать: `apps/web/app/stores/chats.ts`; `app/pages/chats/index.vue`; `app/components/chat/ChatList.vue`, `ChatListItem.vue`
- Изменить: `app/components/AppNav.vue` (пункт «Чаты» с бейджем `unreadTotal`), `app/stores/auth.ts` (подписка на `chat.updated` и `unread.total` вместе с уведомлениями), `app/pages/index.vue` (блок «Непрочитанное»)
- Тест: `tests/unit/chats.store.spec.ts`, `tests/component/chat-list.spec.ts`

**Интерфейсы:**
- Отдаёт наружу: `useChatsStore()` с `chats`, `unreadTotal`, `fetch()`, `upsert(chat)`, `remove(chatId)`, `subscribeUser(userId)`, `unsubscribeUser()`, `setUnreadTotal(n)`; сортировка по `last_message_at` убыв. поддерживается при `upsert`.
- Потребляет: `GET /chats`, события `chat.updated` (`{chat, removed?}`) и `unread.total` (`{total}`) на `private-user.{id}`.

- [ ] **Шаг 1: Написать падающие тесты**

`tests/unit/chats.store.spec.ts`:

```ts
import { createPinia, setActivePinia } from 'pinia'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useChatsStore } from '~/app/stores/chats'

const get = vi.fn()
const listen = vi.fn()
const leave = vi.fn()

mockNuxtImport('useApi', () => () => ({ get }))
mockNuxtImport('useEcho', () => () => ({ private: () => ({ listen, notification: vi.fn() }), leave }))

const chat = (id: string, at: string, unread = 0) => ({
  id, type: 'group', title: id, avatar_url: null, archived: false, unread_count: unread, muted_until: null,
  last_message: { id: 'm', body_preview: 'x', sender_name: 'Я', deleted: false, created_at: at }, last_message_at: at,
})

beforeEach(() => {
  setActivePinia(createPinia())
  ;[get, listen, leave].forEach(fn => fn.mockReset())
})

describe('chats store', () => {
  it('loads chats and the total', async () => {
    get.mockResolvedValue({ data: [chat('a', '2026-12-01T10:00:00Z', 2), chat('b', '2026-12-01T09:00:00Z')], meta: { unread_total: 2 } })

    const store = useChatsStore()
    await store.fetch()

    expect(store.chats.map(c => c.id)).toEqual(['a', 'b'])
    expect(store.unreadTotal).toBe(2)
  })

  it('moves an updated chat to the top and applies the live total', async () => {
    get.mockResolvedValue({ data: [chat('a', '2026-12-01T10:00:00Z'), chat('b', '2026-12-01T09:00:00Z')], meta: { unread_total: 0 } })
    const store = useChatsStore()
    await store.fetch()
    store.subscribeUser('u1')

    const handlers = Object.fromEntries(listen.mock.calls.map(([name, fn]) => [name, fn])) as Record<string, (p: unknown) => void>
    handlers['.chat.updated']!({ chat: chat('b', '2026-12-01T11:00:00Z', 1) })
    handlers['.unread.total']!({ total: 1 })

    expect(store.chats[0]!.id).toBe('b')
    expect(store.chats[0]!.unread_count).toBe(1)
    expect(store.unreadTotal).toBe(1)
  })

  it('removes a chat the account was excluded from', async () => {
    get.mockResolvedValue({ data: [chat('a', '2026-12-01T10:00:00Z')], meta: { unread_total: 0 } })
    const store = useChatsStore()
    await store.fetch()
    store.subscribeUser('u1')

    const handlers = Object.fromEntries(listen.mock.calls.map(([name, fn]) => [name, fn])) as Record<string, (p: unknown) => void>
    handlers['.chat.updated']!({ chat: chat('a', '2026-12-01T10:00:00Z'), removed: true })

    expect(store.chats).toHaveLength(0)
  })
})
```

`tests/component/chat-list.spec.ts`:

```ts
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ChatsIndex from '~/app/pages/chats/index.vue'
import { permissionChecker } from '~/app/composables/useCan'

const get = vi.fn()
const permissions = { administrator: false, global: [] as string[], ministries: {} }

mockNuxtImport('useApi', () => () => ({ get }))
mockNuxtImport('useCan', () => () => permissionChecker(permissions))

beforeEach(() => {
  get.mockReset()
  permissions.global = []
})

describe('chat list page', () => {
  it('shows unread badges and a muted marker', async () => {
    get.mockResolvedValue({ data: [
      { id: 'a', type: 'ministry', title: 'Прославление', avatar_url: null, archived: false, unread_count: 3, muted_until: '9999-12-31T00:00:00Z', last_message: { body_preview: 'Репетиция в 18:00', sender_name: 'Сергей', deleted: false, created_at: '2026-12-01T10:00:00Z' }, last_message_at: '2026-12-01T10:00:00Z' },
    ], meta: { unread_total: 3 } })

    const page = await mountSuspended(ChatsIndex)

    expect(page.find('[data-test="unread-a"]').text()).toBe('3')
    expect(page.find('[data-test="muted-a"]').exists()).toBe(true)
    expect(page.text()).toContain('Сергей: Репетиция в 18:00')
  })

  it('shows the new group button only with chats.create_groups', async () => {
    get.mockResolvedValue({ data: [], meta: { unread_total: 0 } })
    expect((await mountSuspended(ChatsIndex)).find('[data-test="new-group"]').exists()).toBe(false)

    permissions.global = ['chats.create_groups']
    expect((await mountSuspended(ChatsIndex)).find('[data-test="new-group"]').exists()).toBe(true)
  })
})
```

`GET /chats` в этой задаче дополняется `meta.unread_total` (правка контроллера задачи 3 на сервере — одна строка, тест `ChatIndexTest` дополняется проверкой `meta.unread_total`).

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `npm run test`
Ожидается: FAIL.

- [ ] **Шаг 3: Реализовать**

Store подписывается на `private:user.{id}` через тот же экземпляр канала, что и уведомления (Echo кеширует канал по имени): `.listen('.chat.updated', ...)`, `.listen('.unread.total', ...)`. Список: аватар или инициалы, название, превью последнего сообщения «Имя: текст», время (`useChurchDate`), бейдж непрочитанного, значок «без звука», пометка «архив». Кнопка «Новая группа» по `can('chats.create_groups')` открывает `NewGroupDialog` (задача 15). Главная: блок «Непрочитанное» — до трёх чатов с `unread_count > 0`.

- [ ] **Шаг 4: Запустить тесты, убедиться что проходят**

Выполнить: `npm run test && npm run typecheck && npm run lint`
Ожидается: PASS.

- [ ] **Шаг 5: Коммит**

```bash
git add apps/web apps/api && git commit -m "feat(web): chats store, chat list with live unread updates"
```

**Критерии готовности:**
- Список чатов обновляется по `chat.updated` без опроса, бейдж в навигации — по `unread.total` (раздел 9).
- Исключённый из группы видит, как чат исчезает из списка.

---

### Задача 14: Экран чата

**Файлы:**
- Создать: `apps/web/app/pages/chats/[id].vue`; `app/components/chat/MessageList.vue`, `MessageItem.vue`, `Composer.vue`, `ReplyPreview.vue`, `PinnedBar.vue`, `ChatHeader.vue`; `app/composables/useChatMessages.ts`
- Изменить: `MediaUploader.vue` (режим композера: превью выбранных файлов до отправки), `package.json` (`@vueuse/core`)
- Тест: `tests/unit/useChatMessages.spec.ts`, `tests/component/chat.spec.ts`

**Интерфейсы:**
- Отдаёт наружу: `useChatMessages(chatId)` → `{ messages, loadInitial(), loadOlder(), catchUp(), applySent(m), applyEdited(m), applyDeleted(id), hasOlder }` — чистая логика слияния: сообщения уникальны по `id`, порядок по `cursor`.
- Отдаёт наружу: экран `/chats/{id}`: шапка (название, участники, «без звука», меню), закреплённые, история с подгрузкой вверх при прокрутке к началу, композер (текст, вложения, ответ), отметка прочитанного при появлении последнего сообщения в области видимости, подписка на `private-chat.{id}`, догон через `after` при `reconnected`.
- Потребляет: `GET /chats/{id}`, `GET /chats/{id}/messages`, `POST /chats/{id}/messages`, `PATCH /messages/{id}`, `DELETE /messages/{id}`, `POST /chats/{id}/read`, события канала чата.

- [ ] **Шаг 1: Написать падающие тесты**

`tests/unit/useChatMessages.spec.ts`:

```ts
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useChatMessages } from '~/app/composables/useChatMessages'

const get = vi.fn()
mockNuxtImport('useApi', () => () => ({ get }))

const msg = (id: string, cursor: string) => ({ id, cursor, body: id, deleted: false, sender: null, attachments: [], reply_to: null, edited_at: null, created_at: cursor.split('|')[0] })

beforeEach(() => get.mockReset())

describe('useChatMessages', () => {
  it('loads the latest page and prepends older ones', async () => {
    get.mockResolvedValueOnce({ data: [msg('b', '2026-12-01T10:00:02.000000Z|b'), msg('c', '2026-12-01T10:00:03.000000Z|c')], next_before: '2026-12-01T10:00:02.000000Z|b', next_after: null })
      .mockResolvedValueOnce({ data: [msg('a', '2026-12-01T10:00:01.000000Z|a')], next_before: null, next_after: null })

    const chat = useChatMessages('chat1')
    await chat.loadInitial()
    await chat.loadOlder()

    expect(chat.messages.value.map(m => m.id)).toEqual(['a', 'b', 'c'])
    expect(chat.hasOlder.value).toBe(false)
    expect(get).toHaveBeenLastCalledWith('/chats/chat1/messages', { before: '2026-12-01T10:00:02.000000Z|b' })
  })

  it('ignores a live duplicate and applies edits and deletions', async () => {
    get.mockResolvedValueOnce({ data: [msg('a', '2026-12-01T10:00:01.000000Z|a')], next_before: null, next_after: null })
    const chat = useChatMessages('chat1')
    await chat.loadInitial()

    chat.applySent(msg('a', '2026-12-01T10:00:01.000000Z|a'))
    chat.applySent(msg('b', '2026-12-01T10:00:02.000000Z|b'))
    chat.applyEdited({ ...msg('a', '2026-12-01T10:00:01.000000Z|a'), body: 'изменено' })
    chat.applyDeleted('b')

    expect(chat.messages.value).toHaveLength(2)
    expect(chat.messages.value[0]!.body).toBe('изменено')
    expect(chat.messages.value[1]!.deleted).toBe(true)
  })

  it('catches up after a reconnect using the last cursor', async () => {
    get.mockResolvedValueOnce({ data: [msg('a', '2026-12-01T10:00:01.000000Z|a')], next_before: null, next_after: null })
      .mockResolvedValueOnce({ data: [msg('b', '2026-12-01T10:00:02.000000Z|b')], next_before: null, next_after: null })
    const chat = useChatMessages('chat1')
    await chat.loadInitial()

    await chat.catchUp()

    expect(get).toHaveBeenLastCalledWith('/chats/chat1/messages', { after: '2026-12-01T10:00:01.000000Z|a' })
    expect(chat.messages.value.map(m => m.id)).toEqual(['a', 'b'])
  })
})
```

`tests/component/chat.spec.ts`:

```ts
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ChatPage from '~/app/pages/chats/[id].vue'

const get = vi.fn()
const post = vi.fn()
const del = vi.fn()
const listen = vi.fn()

mockNuxtImport('useApi', () => () => ({ get, post, delete: del }))
mockNuxtImport('useRoute', () => () => ({ params: { id: 'c1' } }))
mockNuxtImport('useAuthStore', () => () => ({ user: { id: 'me' } }))
mockNuxtImport('useEcho', () => () => ({ private: () => ({ listen, notification: vi.fn() }), leave: vi.fn(), connector: { pusher: { connection: { bind: vi.fn() } } } }))

const chat = (over = {}) => ({
  id: 'c1', type: 'group', title: 'Поездка', archived: false, can_write: true, can_moderate: false, can_manage_members: false,
  is_owner: false, muted_until: null, unread_count: 0, members: [], pinned_messages: [], avatar_url: null, ...over,
})
const message = (id: string, senderId: string, over = {}) => ({
  id, cursor: `2026-12-01T10:00:0${id.length}.000000Z|${id}`, body: `текст ${id}`, deleted: false, edited_at: null, attachments: [], reply_to: null,
  sender: { id: senderId, person: { id: 'p', full_name: senderId === 'me' ? 'Я' : 'Сергей' } }, created_at: '2026-12-01T10:00:00Z', ...over,
})

beforeEach(() => {
  [get, post, del, listen].forEach(fn => fn.mockReset())
  get.mockImplementation((url: string) => url.endsWith('/messages')
    ? Promise.resolve({ data: [message('a', 'other'), message('b', 'me')], next_before: null, next_after: null })
    : Promise.resolve({ data: chat() }))
})

describe('chat page', () => {
  it('renders history and shows edit/delete only on own messages', async () => {
    const page = await mountSuspended(ChatPage)

    expect(page.text()).toContain('текст a')
    expect(page.find('[data-test="edit-a"]').exists()).toBe(false)
    expect(page.find('[data-test="edit-b"]').exists()).toBe(true)
  })

  it('sends a message with a reply and clears the composer', async () => {
    post.mockResolvedValue({ data: message('c', 'me') })
    const page = await mountSuspended(ChatPage)

    await page.find('[data-test="reply-a"]').trigger('click')
    await page.find('[data-test="composer"]').setValue('Ответ')
    await page.find('[data-test="send"]').trigger('click')
    await new Promise(resolve => setTimeout(resolve))

    expect(post).toHaveBeenCalledWith('/chats/c1/messages', { body: 'Ответ', media_ids: [], reply_to_id: 'a' })
    expect((page.find('[data-test="composer"]').element as HTMLTextAreaElement).value).toBe('')
  })

  it('disables the composer in a read-only chat', async () => {
    get.mockImplementation((url: string) => url.endsWith('/messages')
      ? Promise.resolve({ data: [], next_before: null, next_after: null })
      : Promise.resolve({ data: chat({ can_write: false, archived: true }) }))

    const page = await mountSuspended(ChatPage)

    expect(page.find('[data-test="composer"]').exists()).toBe(false)
    expect(page.text()).toContain('Чат архивирован')
  })

  it('shows a placeholder for a deleted message and a pinned bar', async () => {
    get.mockImplementation((url: string) => url.endsWith('/messages')
      ? Promise.resolve({ data: [message('a', 'other', { deleted: true, body: null })], next_before: null, next_after: null })
      : Promise.resolve({ data: chat({ pinned_messages: [message('p', 'other', { body: 'Закреплено' })] }) }))

    const page = await mountSuspended(ChatPage)

    expect(page.text()).toContain('Сообщение удалено')
    expect(page.find('[data-test="pinned-bar"]').text()).toContain('Закреплено')
  })

  it('appends a live message from the chat channel', async () => {
    const page = await mountSuspended(ChatPage)
    const handlers = Object.fromEntries(listen.mock.calls.map(([name, fn]) => [name, fn])) as Record<string, (p: unknown) => void>

    handlers['.message.sent']!({ message: message('z', 'other', { body: 'живое' }) })
    await page.vm.$nextTick()

    expect(page.text()).toContain('живое')
  })
})
```

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `npm run test`
Ожидается: FAIL.

- [ ] **Шаг 3: Реализовать**

`useChatMessages` держит `Map<id, Message>` и отсортированный массив по `cursor` (строковое сравнение достаточно: ISO-время с микросекундами, затем ULID). Экран: при монтировании `GET /chats/{id}` и `loadInitial`, прокрутка вниз; `useIntersectionObserver` на верхнем «якоре» → `loadOlder` с сохранением позиции прокрутки; на нижнем последнем сообщении → `POST /chats/{id}/read` (не чаще раза в секунду, только вперёд); подписка `echo.private('chat.{id}')` на пять событий раздела 9; на `reconnected` соединения Echo — `catchUp()` и `useChatsStore().fetch()`. Композер: `textarea` с автоувеличением, вложения через `MediaUploader` (`purpose = message`, превью до отправки, `media_ids` уходят вместе с текстом), ответ через `ReplyPreview`, `Enter` — отправка на десктопе, кнопка — на телефоне. Свои сообщения — меню «Изменить», «Удалить» (подтверждение); чужие для модератора — «Удалить», «Закрепить». Удалённое — «Сообщение удалено» курсивом.

- [ ] **Шаг 4: Запустить тесты, убедиться что проходят**

Выполнить: `npm run test && npm run typecheck && npm run lint`
Ожидается: PASS.

- [ ] **Шаг 5: Проверить на телефоне**

Открыть один чат на телефоне и на десктопе, обменяться сообщениями с картинкой, отключить Wi-Fi на телефоне на минуту и включить.
Ожидается: сообщения приходят живьём; после переподключения пропущенное дотягивается без перезагрузки (раздел 9).

- [ ] **Шаг 6: Коммит**

```bash
git add apps/web && git commit -m "feat(web): chat screen with history, composer, replies, pins and live updates"
```

**Критерии готовности:**
- История листается вверх без прыжков, новые сообщения приходят по каналу, дубликаты не появляются.
- После переподключения клиент дотягивает пропущенное через `after` и перечитывает список чатов (риск 7).
- Прочитанное отмечается по видимости, а не по открытию экрана.
- Композер скрыт в архивном чате и у читателя без права писать.

---

### Задача 15: Группы, личный чат, «без звука», модерация, вкладка служения, кнопка события

**Файлы:**
- Создать: `apps/web/app/components/chat/NewGroupDialog.vue`, `ChatMembersDialog.vue`, `MuteMenu.vue`; `app/pages/ministries/[id]/chat.vue`
- Изменить: `app/pages/chats/[id].vue` (`ChatHeader` с меню), `app/pages/people/[id].vue` (кнопка «Написать» по `can('chats.dm')` и наличию аккаунта), `app/pages/events/[id].vue` (кнопка «Чат события» / «Открыть чат»), `app/pages/ministries/[id]/index.vue` (вкладка «Чат»)
- Тест: `tests/component/chat-groups.spec.ts`

**Интерфейсы:**
- Потребляет: `POST /chats` (обе ветки), `PATCH /chats/{id}`, `PUT /chats/{id}/avatar`, `POST /chats/{id}/members`, `DELETE /chats/{id}/members/{userId}`, `POST /chats/{id}/leave`, `POST /chats/{id}/archive`, `POST /chats/{id}/mute`, `DELETE /chats/{id}/mute`, `POST /events/{id}/chat`, `GET /people?search`.

- [ ] **Шаг 1: Написать падающие тесты**

```ts
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ChatHeader from '~/app/components/chat/ChatHeader.vue'
import NewGroupDialog from '~/app/components/chat/NewGroupDialog.vue'
import PersonCard from '~/app/pages/people/[id].vue'
import EventPage from '~/app/pages/events/[id].vue'
import { permissionChecker } from '~/app/composables/useCan'

const get = vi.fn()
const post = vi.fn()
const del = vi.fn()
const push = vi.fn()
const permissions = { administrator: false, global: [] as string[], ministries: {} }

mockNuxtImport('useApi', () => () => ({ get, post, delete: del }))
mockNuxtImport('useCan', () => () => permissionChecker(permissions))
mockNuxtImport('useRouter', () => () => ({ push }))
mockNuxtImport('useRoute', () => () => ({ params: { id: 'x1' } }))

beforeEach(() => {
  [get, post, del, push].forEach(fn => fn.mockReset())
  permissions.global = []
})

describe('new group dialog', () => {
  it('searches people with accounts and creates the group', async () => {
    get.mockResolvedValue({ data: [{ id: 'p1', full_name: 'Петрова Анна', has_account: true, user_id: 'u2' }, { id: 'p2', full_name: 'Без Аккаунта', has_account: false }], meta: {} })
    post.mockResolvedValue({ data: { id: 'c9' } })

    const dialog = await mountSuspended(NewGroupDialog)
    await dialog.find('[data-test="title"]').setValue('Поездка')
    await dialog.find('[data-test="search"]').setValue('пет')
    await new Promise(resolve => setTimeout(resolve, 350))

    expect(dialog.find('[data-test="option-p2"]').exists()).toBe(false)
    await dialog.find('[data-test="option-p1"]').trigger('click')
    await dialog.find('[data-test="create"]').trigger('click')
    await new Promise(resolve => setTimeout(resolve))

    expect(post).toHaveBeenCalledWith('/chats', { type: 'group', title: 'Поездка', member_ids: ['u2'] })
    expect(push).toHaveBeenCalledWith('/chats/c9')
  })
})

describe('chat header menu', () => {
  const chat = (over = {}) => ({ id: 'c1', type: 'group', title: 'Поездка', muted_until: null, is_owner: false, can_manage_members: false, can_moderate: false, archived: false, members: [], ...over })

  it('toggles mute', async () => {
    post.mockResolvedValue({ data: chat({ muted_until: '9999-12-31T00:00:00Z' }) })
    const header = await mountSuspended(ChatHeader, { props: { chat: chat() } })
    await header.find('[data-test="menu"]').trigger('click')
    await header.find('[data-test="mute-forever"]').trigger('click')
    expect(post).toHaveBeenCalledWith('/chats/c1/mute', {})
  })

  it('shows leave for a member and archive for the owner, never leave for the owner', async () => {
    const member = await mountSuspended(ChatHeader, { props: { chat: chat() } })
    await member.find('[data-test="menu"]').trigger('click')
    expect(member.find('[data-test="leave"]').exists()).toBe(true)
    expect(member.find('[data-test="archive"]').exists()).toBe(false)

    const owner = await mountSuspended(ChatHeader, { props: { chat: chat({ is_owner: true, can_manage_members: true }) } })
    await owner.find('[data-test="menu"]').trigger('click')
    expect(owner.find('[data-test="leave"]').exists()).toBe(false)
    expect(owner.find('[data-test="archive"]').exists()).toBe(true)
    expect(owner.find('[data-test="members"]').exists()).toBe(true)
  })

  it('offers neither leave nor members for a ministry chat', async () => {
    const header = await mountSuspended(ChatHeader, { props: { chat: chat({ type: 'ministry' }) } })
    await header.find('[data-test="menu"]').trigger('click')
    expect(header.find('[data-test="leave"]').exists()).toBe(false)
    expect(header.find('[data-test="members"]').exists()).toBe(false)
  })
})

describe('entry points', () => {
  it('shows «Написать» on a person card only with chats.dm and an account, and opens the direct chat', async () => {
    get.mockResolvedValue({ data: { id: 'x1', full_name: 'Петрова Анна', has_account: true, user_id: 'u2', status: 'member', archived: false, has_global_roles: true } })
    expect((await mountSuspended(PersonCard)).find('[data-test="write"]').exists()).toBe(false)

    permissions.global = ['chats.dm']
    post.mockResolvedValue({ data: { id: 'c5' } })
    const card = await mountSuspended(PersonCard)
    await card.find('[data-test="write"]').trigger('click')
    await new Promise(resolve => setTimeout(resolve))

    expect(post).toHaveBeenCalledWith('/chats', { type: 'direct', user_id: 'u2' })
    expect(push).toHaveBeenCalledWith('/chats/c5')
  })

  it('shows «Создать чат» to the event manager and «Открыть чат» when it exists', async () => {
    get.mockResolvedValue({ data: { id: 'x1', title: 'Т', status: 'scheduled', can_manage: true, chat_id: null, slots: [], attachments: [], starts_at: '2026-12-01T10:00:00Z', ends_at: '2026-12-01T11:00:00Z' } })
    expect((await mountSuspended(EventPage)).find('[data-test="create-chat"]').exists()).toBe(true)

    get.mockResolvedValue({ data: { id: 'x1', title: 'Т', status: 'scheduled', can_manage: false, chat_id: 'c7', slots: [], attachments: [], starts_at: '2026-12-01T10:00:00Z', ends_at: '2026-12-01T11:00:00Z' } })
    expect((await mountSuspended(EventPage)).find('[data-test="open-chat"]').attributes('href')).toBe('/chats/c7')
  })
})
```

`PersonResource` фазы 1 дополняется полем `user_id` (идентификатор аккаунта, если есть) — одна строка в ресурсе и проверка в `PersonCrudTest`.

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `npm run test tests/component/chat-groups.spec.ts`
Ожидается: FAIL.

- [ ] **Шаг 3: Реализовать**

`NewGroupDialog`: название, поиск по `GET /people?search` с фильтром `has_account`, выбранные чипами, создание и переход. `ChatHeader`: название и участники (`ChatMembersDialog` с добавлением и исключением для `can_manage_members`), меню: «Без звука» (на 8 часов, на неделю, навсегда / включить звук), «Выйти» (группа, не владелец), «Архивировать» (владелец или модератор всего), «Переименовать», «Сменить аватар». Вкладка «Чат» служения — тот же экран чата, встроенный по `chat_id` из карточки служения. Карточка человека — «Написать»; карточка события — «Создать чат» / «Открыть чат».

- [ ] **Шаг 4: Запустить тесты, убедиться что проходят**

Выполнить: `npm run test && npm run typecheck && npm run lint`
Ожидается: PASS.

- [ ] **Шаг 5: Коммит**

```bash
git add apps/web apps/api && git commit -m "feat(web): groups, direct chats, mute, moderation menu, ministry and event chat entry points"
```

**Критерии готовности:**
- Все действия из раздела 7.6 доступны из интерфейса ровно тем, кому положено: меню строится по флагам чата, а не по догадкам клиента.
- Личный чат открывается из карточки человека, чат события — из карточки события, чат служения — со вкладки служения.

---

### Задача 16: Service worker для чата — сворачивание и гашение пушей

**Файлы:**
- Изменить: `apps/web/app/sw/handlers.ts` (`shouldShow(payload, clients)`), `apps/web/app/sw.ts` (проверка открытого чата), `app/pages/chats/[id].vue` (сообщение service worker о текущем чате через `postMessage`)
- Тест: `tests/unit/sw-handlers.spec.ts` (дополнение)

**Интерфейсы:**
- Отдаёт наружу: `shouldShow(payload: PushPayload, openUrls: string[]): boolean` — пуш чата не показывается, если среди видимых окон есть `/chats/{id}` этого чата; `pickWindow` предпочитает окно с тем же чатом.

- [ ] **Шаг 1: Написать падающие тесты**

```ts
import { describe, expect, it } from 'vitest'
import { pickWindow, shouldShow } from '~/app/sw/handlers'

describe('chat push handling', () => {
  it('hides a chat push when that chat is open and visible', () => {
    expect(shouldShow({ tag: 'chat-c1', url: '/chats/c1' }, ['https://church.test/chats/c1'])).toBe(false)
    expect(shouldShow({ tag: 'chat-c1', url: '/chats/c1' }, ['https://church.test/chats/c2'])).toBe(true)
    expect(shouldShow({ tag: 'announcement-a1', url: '/announcements/a1' }, ['https://church.test/announcements/a1'])).toBe(true)
  })

  it('prefers the window already showing the target chat', () => {
    const other = { url: 'https://church.test/people', focus: () => {}, navigate: () => {} }
    const same = { url: 'https://church.test/chats/c1', focus: () => {}, navigate: () => {} }
    expect(pickWindow([other, same], '/chats/c1')).toBe(same)
  })
})
```

- [ ] **Шаг 2: Запустить тесты, убедиться что падают**

Выполнить: `npm run test tests/unit/sw-handlers.spec.ts`
Ожидается: FAIL.

- [ ] **Шаг 3: Реализовать**

В `sw.ts` обработчик `push` перед показом собирает `clients.matchAll({ type: 'window' })`, оставляет окна с `visibilityState === 'visible'` и вызывает `shouldShow`. Тег `chat-{id}` уже сворачивает карточки одного чата средствами платформы; `renotify: true` сохраняется. `pickWindow` ищет окно, чей `url` заканчивается на целевой путь, иначе первое.

- [ ] **Шаг 4: Запустить тесты, убедиться что проходят**

Выполнить: `npm run test && npm run build`
Ожидается: PASS.

- [ ] **Шаг 5: Проверить на телефоне**

Открыть чат в установленной PWA, отправить сообщение с другого аккаунта; затем свернуть приложение и повторить.
Ожидается: в открытом чате пуша нет, в свёрнутом — есть; второе сообщение заменяет карточку первого.

- [ ] **Шаг 6: Коммит**

```bash
git add apps/web && git commit -m "feat(web): suppress chat pushes for the open chat and collapse by tag"
```

**Критерии готовности:**
- Присутствие не отслеживается сервером; клиент гасит пуш открытого чата сам (раздел 7.6).
- Уведомления одного чата сворачиваются в одну карточку.

---

## Блок 6. Приёмка

### Задача 17: Сквозной сценарий, backfill на деплое, пилот

**Файлы:**
- Создать: `apps/web/e2e/chat.spec.ts`
- Изменить: `docs/deploy.md` (шаг `php artisan chat:backfill` после миграций фазы 4), `README.md` (упоминание всех четырёх планов)
- Тест: сам сценарий

- [ ] **Шаг 1: Написать сценарий**

```ts
import { expect, test } from '@playwright/test'
import path from 'node:path'
import { createInvitedAccount, login } from './fixtures'

test('a ministry chat carries a message with a photo to another member live', async ({ page, browser }) => {
  await login(page, 'admin@example.com', 'secret123')

  await page.goto('/ministries')
  await page.getByRole('button', { name: 'Создать служение' }).click()
  await page.getByLabel('Название').fill('Прославление')
  await page.getByRole('button', { name: 'Сохранить' }).click()

  const a = await createInvitedAccount(page, browser, { lastName: 'Сидоров', firstName: 'Сергей' })
  const b = await createInvitedAccount(page, browser, { lastName: 'Петрова', firstName: 'Анна' })
  await page.getByRole('tab', { name: 'Участники' }).click()
  for (const name of ['Сидоров', 'Петрова']) {
    await page.getByRole('button', { name: 'Добавить участника' }).click()
    await page.getByPlaceholder('Поиск по справочнику').fill(name)
    await page.getByText(name).first().click()
    await page.getByRole('button', { name: 'Добавить' }).click()
  }

  await a.goto('/chats')
  await a.getByText('Прославление').click()
  await b.goto('/chats')
  await b.getByText('Прославление').click()

  await a.getByTestId('attach').setInputFiles(path.join(__dirname, 'fixtures', 'photo.jpg'))
  await expect(a.getByTestId('attachment-preview')).toBeVisible()
  await a.getByTestId('composer').fill('Фото с репетиции')
  await a.getByTestId('send').click()

  await expect(b.getByText('Фото с репетиции')).toBeVisible({ timeout: 10_000 })
  await expect(b.locator('[data-test^="attachment-"] img')).toBeVisible()

  await b.getByTestId('composer').fill('Класс!')
  await b.getByTestId('send').click()
  await expect(a.getByText('Класс!')).toBeVisible({ timeout: 10_000 })

  await a.goto('/chats')
  await expect(a.getByTestId('unread-total')).toHaveCount(0)
})

test('a plain member cannot delete someone elses message, the admin can', async ({ page, browser }) => {
  await login(page, 'admin@example.com', 'secret123')
  const member = await createInvitedAccount(page, browser, { lastName: 'Кузнецов', firstName: 'Олег' })
  await page.goto('/chats')
  await page.getByTestId('new-group').click()
  await page.getByTestId('title').fill('Тест')
  await page.getByTestId('search').fill('Кузнецов')
  await page.getByTestId(/^option-/).first().click()
  await page.getByTestId('create').click()
  await page.getByTestId('composer').fill('Сообщение админа')
  await page.getByTestId('send').click()

  await member.goto('/chats')
  await member.getByText('Тест').click()
  await expect(member.getByText('Сообщение админа')).toBeVisible()
  await expect(member.getByTestId(/^delete-/)).toHaveCount(0)

  await page.getByTestId(/^delete-/).first().click()
  await page.getByTestId('confirm-delete').click()
  await expect(member.getByText('Сообщение удалено')).toBeVisible({ timeout: 10_000 })
})
```

- [ ] **Шаг 2: Запустить сценарии**

Выполнить: `npm run e2e`
Ожидается: PASS с настоящим Reverb (конфигурация e2e из фазы 2).

- [ ] **Шаг 3: Деплой и backfill**

`docs/deploy.md`: после `migrate --force` фазы 4 один раз выполнить `php artisan chat:backfill` в контейнере `app`; проверить в интерфейсе, что у каждого активного служения есть вкладка «Чат» с участниками.

- [ ] **Шаг 4: Пилот**

Одно служение переводит общение в чат на две недели. Фиксируются: число сообщений, жалобы на недоставленные пуши, случаи потери сообщений после переподключения. Критерий: лидер служения подтверждает, что мессенджер для рабочего общения служения больше не нужен.

- [ ] **Шаг 5: Коммит**

```bash
git add apps/web docs README.md && git commit -m "test(web): end-to-end chat scenarios, backfill deploy note"
```

**Критерии готовности:**
- Сквозной сценарий «сообщение с вложением приходит живьём, модерация ограничена» проходит в CI.
- Существующие служения получили чаты одной командой на деплое.
- Пилотное служение перенесло общение — критерий фазы из раздела 13.

---

## Фаза 4 готова, когда

Проверка по критерию из раздела 13 архитектуры, на продовом сервере с пилотным служением:

1. У каждого активного служения есть чат с составом, повторяющим состав служения; новый участник появляется в чате сразу, исключённый — исчезает; человек без аккаунта попадает в чат при приёме приглашения.
2. Управляющий событием создаёт чат события; назначенные автоматически в нём, снятые с назначения — вне его.
3. Носитель `chats.create_groups` создаёт группу и управляет составом; носитель `chats.dm` пишет любому аккаунту, собеседник отвечает.
4. Сообщения с текстом, картинками и файлами приходят живьём на второе устройство; после потери сети пропущенное дотягивается без перезагрузки.
5. Пуш о сообщении приходит на закрытую PWA, не приходит в открытый чат и не приходит из чата «без звука»; уведомления одного чата сворачиваются.
6. Модератор удаляет чужое сообщение (заглушка остаётся, файлы удалены, запись в журнале) и закрепляет важное; в личном чате модерации нет.
7. Читатель с `ministries.view_all` открывает чат служения без права писать.
8. Пилотное служение две недели общается в системе и подтверждает отказ от мессенджера.

После фазы 4 v1 считается собранной. Кандидаты после v1 — по разделу 13 архитектуры, по явному запросу заказчика.

---

## Изменения в архитектуре, внесённые этим планом

- Раздел 5.3: колонка `ministries.chat_id` не создаётся; связь хранится в `chats.ministry_id` (решение 1).
- Раздел 5.6: `messages.sender_user_id`, `chats.created_by_user_id`, `chat_pinned_messages.pinned_by_user_id` допускают `null` после стирания аккаунта (решение 10); `chats.title` заполняется только у групп.
- Раздел 7.3: чат служения создаёт слушатель Chat на `MinistryCreated`, а не транзакция создания служения (решение 2).
- Раздел 7.6: личный чат открывается эндпоинтом `POST /chats` идемпотентно, пустые личные чаты скрыты из списка (решение 3); владелец группы не выходит из неё (решение 4).
- Раздел 8: `POST /events/{id}/chat` — в строке модуля Chat.
