<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Notifications;

use App\Modules\Calendar\Models\Event;

final class AssignmentCreatedNotification extends EventNotification
{
    public function __construct(Event $event, private readonly string $slotLabel)
    {
        parent::__construct($event);
    }

    public function title(): string
    {
        return 'Вас назначили';
    }

    public function body(): string
    {
        return parent::body().", слот «{$this->slotLabel}»";
    }
}
