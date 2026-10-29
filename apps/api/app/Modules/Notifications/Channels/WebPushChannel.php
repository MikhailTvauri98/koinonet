<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Channels;

use App\Modules\Directory\Models\User;
use App\Modules\Notifications\AppNotification;
use App\Modules\Notifications\Push\WebPushSender;

final readonly class WebPushChannel
{
    public function __construct(private WebPushSender $sender) {}

    public function send(User $notifiable, AppNotification $notification): void
    {
        $this->sender->send($notifiable, [...$notification->toArray($notifiable), 'icon' => config('webpush.icon')]);
    }
}
