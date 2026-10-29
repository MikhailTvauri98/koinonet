<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Models;

use App\Modules\Access\Models\Role;
use App\Modules\Calendar\ResourceType;
use Carbon\CarbonImmutable;
use Database\Factories\EventSlotFactory;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property string $id
 * @property string $event_id
 * @property string $label
 * @property ResourceType $resource_type
 * @property string|null $role_id
 * @property int $required_count
 * @property int $sort_order
 * @property CarbonImmutable|null $archived_at
 */
final class EventSlot extends Model
{
    /** @use HasFactory<EventSlotFactory> */
    use HasFactory;

    use HasUlids;

    protected $guarded = [];

    protected static function newFactory(): EventSlotFactory
    {
        return EventSlotFactory::new();
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'resource_type' => ResourceType::class,
            'required_count' => 'integer',
            'sort_order' => 'integer',
            'archived_at' => 'immutable_datetime',
        ];
    }

    /** @return BelongsTo<Event, $this> */
    public function event(): BelongsTo
    {
        return $this->belongsTo(Event::class);
    }

    /** @return BelongsTo<Role, $this> */
    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class);
    }

    /** @return HasMany<EventAssignment, $this> */
    public function assignments(): HasMany
    {
        return $this->hasMany(EventAssignment::class, 'slot_id');
    }
}
