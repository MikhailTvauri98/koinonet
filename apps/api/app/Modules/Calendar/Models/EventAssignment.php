<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Models;

use App\Modules\Calendar\ResourceType;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use Carbon\CarbonImmutable;
use Database\Factories\EventAssignmentFactory;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property string $id
 * @property string $slot_id
 * @property ResourceType $resource_type
 * @property string|null $person_id
 * @property string|null $assigned_by_user_id
 * @property CarbonImmutable $created_at
 * @property CarbonImmutable|null $archived_at
 */
final class EventAssignment extends Model
{
    /** @use HasFactory<EventAssignmentFactory> */
    use HasFactory;

    use HasUlids;

    public const UPDATED_AT = null;

    protected $guarded = [];

    protected static function newFactory(): EventAssignmentFactory
    {
        return EventAssignmentFactory::new();
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'resource_type' => ResourceType::class,
            'created_at' => 'immutable_datetime',
            'archived_at' => 'immutable_datetime',
        ];
    }

    /** @return BelongsTo<EventSlot, $this> */
    public function slot(): BelongsTo
    {
        return $this->belongsTo(EventSlot::class, 'slot_id');
    }

    /**
     * Laravel infers this name for factory()->for($slot).
     *
     * @return BelongsTo<EventSlot, $this>
     */
    public function eventSlot(): BelongsTo
    {
        return $this->slot();
    }

    /** @return BelongsTo<Person, $this> */
    public function person(): BelongsTo
    {
        return $this->belongsTo(Person::class);
    }

    /** @return BelongsTo<User, $this> */
    public function assignedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_by_user_id');
    }
}
