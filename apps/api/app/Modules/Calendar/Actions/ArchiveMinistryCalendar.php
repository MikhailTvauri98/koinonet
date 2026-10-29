<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Actions;

use App\Modules\Calendar\EventStatus;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventTemplate;
use Illuminate\Support\Facades\DB;

final readonly class ArchiveMinistryCalendar
{
    public function __construct(private CancelEvent $cancel) {}

    public function handle(string $ministryId): void
    {
        EventTemplate::query()->where('ministry_id', $ministryId)->where('active', true)
            ->eachById(function (EventTemplate $template) use ($ministryId): void {
                DB::transaction(function () use ($template, $ministryId): void {
                    // Share the parent lock with materialization, editing and manual creation.
                    $template = EventTemplate::query()->lockForUpdate()->findOrFail($template->id);
                    if ($template->ministry_id === $ministryId && $template->active) {
                        $template->forceFill(['active' => false])->save();
                    }
                });
            });

        Event::query()->where('ministry_id', $ministryId)->whereNull('archived_at')
            ->where('status', EventStatus::Scheduled)->where('ends_at', '>', now())
            ->eachById(function (Event $event) use ($ministryId): void {
                DB::transaction(function () use ($event, $ministryId): void {
                    $event = Event::query()->lockForUpdate()->findOrFail($event->id);
                    // Eligibility can change while waiting for cancellation or editing to finish.
                    if ($event->ministry_id !== $ministryId || $event->archived_at !== null
                        || $event->status !== EventStatus::Scheduled || $event->isPast()) {
                        return;
                    }
                    $this->cancel->handle($event, 'Служение архивировано', null);
                });
            });
    }
}
