<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Notifications;

use App\Modules\Calendar\Models\Event;

final class EventCancelledNotification extends EventNotification
{
    public function __construct(Event $event, private readonly ?string $reason)
    {
        parent::__construct($event);
    }

    public function title(): string
    {
        return 'Событие отменено';
    }

    public function body(): string
    {
        return parent::body().($this->reason === null ? '' : ". Причина: {$this->reason}");
    }
}
