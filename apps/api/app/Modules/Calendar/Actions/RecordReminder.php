<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Actions;

use App\Modules\Calendar\Events\EventReminderDue;
use App\Modules\Calendar\EventStatus;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventReminder;
use App\Modules\Calendar\ReminderKind;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

final class RecordReminder
{
    public function handle(Event $event, ReminderKind $kind, ?CarbonImmutable $now = null): void
    {
        // Match the second precision of persisted event times and SQL bindings.
        $now = ($now ?? CarbonImmutable::now('UTC'))->utc()->startOfSecond();
        DB::transaction(function () use ($event, $kind, $now): void {
            $event = Event::query()->lockForUpdate()->find($event->id);
            $from = $now->add($kind->offset());
            if ($event === null || $event->status !== EventStatus::Scheduled || $event->archived_at !== null
                || $event->starts_at < $from || $event->starts_at >= $from->addMinutes(5)) {
                return;
            }
            $inserted = EventReminder::query()->insertOrIgnore([
                'event_id' => $event->id,
                'kind' => $kind->value,
                'sent_at' => $now,
            ]);
            if ($inserted === 1) {
                EventReminderDue::dispatch($event->id, $kind);
            }
        });
    }
}
