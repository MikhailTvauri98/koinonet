<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Actions;

use App\Modules\Calendar\EventAccess;
use App\Modules\Calendar\Events\AssignmentCreated;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventAssignment;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Calendar\ResourceType;
use App\Modules\Calendar\TimeConflictFinder;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use App\Support\DomainRuleException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

final readonly class AssignPerson
{
    public function __construct(private TimeConflictFinder $conflicts, private EventAccess $access) {}

    /** @return array{assignment: EventAssignment, warnings: list<array{code: string, message: string, event_ids?: list<string>}>} */
    public function handle(User $actor, EventSlot $slot, Person $person): array
    {
        return DB::transaction(function () use ($actor, $slot, $person): array {
            $event = Event::query()->whereNull('archived_at')->lockForUpdate()->findOrFail($slot->event_id);
            $slot = EventSlot::query()->whereNull('archived_at')->lockForUpdate()->findOrFail($slot->id);
            $slot->setRelation('event', $event);
            Gate::forUser($actor)->authorize('assign', $slot);
            if ($event->isCancelled()) {
                throw DomainRuleException::because('event.cancelled', 'Назначения отменённого события изменить нельзя.');
            }
            $person = Person::query()->findOrFail($person->id);
            if ($person->archived_at !== null) {
                throw DomainRuleException::because('assignment.person_archived', 'Человек архивирован.');
            }
            if ($slot->assignments()->whereNull('archived_at')->where('person_id', $person->id)->exists()) {
                throw DomainRuleException::because('assignment.duplicate', 'Человек уже назначен в этот слот.');
            }
            $warnings = [];
            if ($slot->role_id !== null && ! $person->ministryMemberships()->whereHas('roles', fn ($roles) => $roles->whereKey($slot->role_id))->exists()) {
                $warnings[] = ['code' => 'role_mismatch', 'message' => 'У человека нет требуемой роли.'];
            }
            $conflicts = $this->conflicts->conflictsFor($person->id, $event->starts_at, $event->ends_at, $event->id);
            if ($conflicts->isNotEmpty()) {
                $visibleIds = $this->access->constrainVisibleQuery(Event::query()->whereKey($conflicts->modelKeys()), $actor)->pluck('id')->all();
                $warnings[] = ['code' => 'time_conflict', 'message' => 'У человека есть пересечение с другим событием.', 'event_ids' => $conflicts->pluck('id')->intersect($visibleIds)->values()->all()];
            }
            $assignment = $slot->assignments()->create(['resource_type' => ResourceType::Person, 'person_id' => $person->id, 'assigned_by_user_id' => $actor->id]);
            if ($slot->assignments()->whereNull('archived_at')->count() > $slot->required_count) {
                $warnings[] = ['code' => 'over_capacity', 'message' => 'Слот заполнен сверх нормы.'];
            }
            event(new AssignmentCreated($event->id, $slot->id, $person->id, $person->user?->id, $actor->id));

            return ['assignment' => $assignment->load('person.photo'), 'warnings' => $warnings];
        });
    }
}
