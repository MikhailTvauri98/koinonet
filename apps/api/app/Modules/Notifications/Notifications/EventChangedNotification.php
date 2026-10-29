<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Notifications;

use App\Modules\Calendar\Models\Event;

final class EventChangedNotification extends EventNotification
{
    /** @param list<string> $changed */
    public function __construct(Event $event, private readonly array $changed)
    {
        parent::__construct($event);
    }

    public function title(): string
    {
        return 'Событие изменено';
    }

    public function body(): string
    {
        $labels = [];
        if (array_intersect($this->changed, ['starts_at', 'ends_at']) !== []) {
            $labels[] = 'время';
        }
        if (in_array('location', $this->changed, true)) {
            $labels[] = 'место';
        }

        return parent::body().'. Изменено: '.implode(', ', $labels);
    }
}
