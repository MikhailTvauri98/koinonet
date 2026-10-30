<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Notifications;

use App\Modules\Chat\ChatTitle;
use App\Modules\Chat\ChatType;
use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\Models\Message;
use App\Modules\Directory\Models\User;
use App\Modules\Notifications\AppNotification;
use App\Modules\Notifications\Channels\WebPushChannel;
use App\Modules\Notifications\NotificationCategory;
use App\Modules\Notifications\PushGate;
use Illuminate\Support\Facades\Gate;

final class ChatMessageNotification extends AppNotification
{
    private readonly string $messageId;

    private readonly string $chatId;

    public function __construct(Message $message, Chat $chat)
    {
        $this->messageId = $message->id;
        $this->chatId = $chat->id;
        $this->afterCommit();
    }

    public function category(): NotificationCategory
    {
        return NotificationCategory::Chat;
    }

    /** @return list<string> */
    public function via(object $notifiable): array
    {
        return $this->shouldSend($notifiable, WebPushChannel::class) ? [WebPushChannel::class] : [];
    }

    // Laravel retains queued channels: this check must also run in sendNow at delivery.
    public function shouldSend(object $notifiable, string $channel): bool
    {
        if (! $notifiable instanceof User || $channel !== WebPushChannel::class) {
            return false;
        }
        $recipient = User::query()->find($notifiable->id);
        $message = $this->message();
        $member = Chat::query()->find($this->chatId)?->members()->where('user_id', $notifiable->id)->first();

        return $recipient !== null && ! $recipient->isDisabled() && $message !== null && ! $message->isDeleted()
            && $message->sender_user_id !== $recipient->id && $member !== null && ! $member->isMuted()
            && app(PushGate::class)->allows($recipient, $this);
    }

    public function title(): string
    {
        return 'Личный чат';
    }

    public function body(): string
    {
        return 'Новое сообщение';
    }

    public function url(): string
    {
        return "/chats/{$this->chatId}";
    }

    public function tag(): string
    {
        return "chat-{$this->chatId}";
    }

    /** @return array{category: string, title: string, body: string, url: string, tag: string} */
    public function toArray(object $notifiable): array
    {
        $recipient = $notifiable instanceof User ? User::query()->find($notifiable->id) : null;
        $message = $this->message();
        $chat = Chat::query()->find($this->chatId);
        $sender = $message?->sender;
        $visible = $recipient !== null && $sender !== null && Gate::forUser($recipient)->allows('view', $sender->person);
        $name = $sender === null ? 'Удалённый человек' : ($visible ? $sender->person->fullName() : 'Участник');
        $title = $chat !== null && $recipient !== null ? app(ChatTitle::class)->for($chat, $recipient) : $this->title();
        if ($chat?->type === ChatType::Direct && $sender === null) {
            $title = 'Удалённый человек';
        }

        return ['category' => $this->category()->value, 'title' => $title,
            'body' => mb_strimwidth($name.': '.($message?->isDeleted() === false ? ($message->body ?? 'Вложение') : 'Сообщение удалено'), 0, 140, '…'),
            'url' => $this->url(), 'tag' => $this->tag()];
    }

    private function message(): ?Message
    {
        return Message::query()->where('chat_id', $this->chatId)->find($this->messageId);
    }
}
