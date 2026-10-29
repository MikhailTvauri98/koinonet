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
        return $this->category() === NotificationCategory::Chat ? ['broadcast'] : ['broadcast', 'database'];
    }

    /** @return array{category: string, title: string, body: string, url: string, tag: string} */
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
