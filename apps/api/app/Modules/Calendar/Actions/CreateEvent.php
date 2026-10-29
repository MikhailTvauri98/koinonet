<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Actions;

use App\Modules\Calendar\Events\EventCreated;
use App\Modules\Calendar\EventStatus;
use App\Modules\Calendar\Models\Event;
use App\Modules\Directory\Models\User;
use App\Modules\Media\Actions\SyncAttachments;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

final readonly class CreateEvent
{
    public function __construct(private AddSlot $addSlot, private SyncAttachments $attachments) {}

    /** @param array{owner_type: string, ministry_id?: string|null, title: string, description?: string|null, location?: string|null, starts_at: string, ends_at: string, visibility: string, slots?: list<array{label?: string|null, role_id?: string|null, required_count: int}>, notify?: string, media_ids?: list<string>} $attributes */
    public function handle(User $creator, array $attributes): Event
    {
        return DB::transaction(function () use ($creator, $attributes): Event {
            $event = Event::query()->create([
                'owner_type' => $attributes['owner_type'],
                'ministry_id' => $attributes['ministry_id'] ?? null,
                'title' => $attributes['title'],
                'description' => $attributes['description'] ?? null,
                'location' => $attributes['location'] ?? null,
                'starts_at' => CarbonImmutable::parse($attributes['starts_at'])->utc(),
                'ends_at' => CarbonImmutable::parse($attributes['ends_at'])->utc(),
                'visibility' => $attributes['visibility'],
                'status' => EventStatus::Scheduled,
                'created_by_user_id' => $creator->id,
            ]);
            foreach ($attributes['slots'] ?? [] as $position => $slot) {
                $this->addSlot->handle($event, $slot + ['sort_order' => $position]);
            }
            $this->attachments->handle($event, $attributes['media_ids'] ?? [], $creator);
            EventCreated::dispatch($event->id, $attributes['notify'] ?? 'none');

            return $event;
        });
    }
}
