<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Actions;

use App\Modules\Access\AuditLogger;
use App\Modules\Calendar\Events\EventCancelled;
use App\Modules\Calendar\EventStatus;
use App\Modules\Calendar\Models\Event;
use App\Modules\Directory\Models\User;
use App\Support\DomainRuleException;
use Illuminate\Support\Facades\DB;

final readonly class CancelEvent
{
    public function __construct(private AuditLogger $audit) {}

    public function handle(Event $event, ?string $reason, ?User $actor): Event
    {
        return DB::transaction(function () use ($event, $reason, $actor): Event {
            $event = Event::query()->lockForUpdate()->findOrFail($event->id);
            if ($event->isCancelled()) {
                throw DomainRuleException::because('event.already_cancelled', 'Событие уже отменено.');
            }
            $event->forceFill([
                'status' => EventStatus::Cancelled,
                'cancelled_at' => now(),
                'cancel_reason' => $reason !== null && trim($reason) !== '' ? trim($reason) : null,
            ])->save();
            $this->audit->recordForActor($actor, 'event.cancelled', $event, ['reason' => $event->cancel_reason]);
            EventCancelled::dispatch($event->id, $event->cancel_reason);

            return $event;
        });
    }
}
