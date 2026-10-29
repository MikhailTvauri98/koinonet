<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Models;

use App\Modules\Calendar\EventOwnerType;
use App\Modules\Calendar\EventVisibility;
use App\Modules\Directory\Models\User;
use App\Modules\Ministries\Models\Ministry;
use Carbon\CarbonImmutable;
use Database\Factories\EventTemplateFactory;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property string $id
 * @property EventOwnerType $owner_type
 * @property string|null $ministry_id
 * @property string $title
 * @property string|null $description
 * @property string|null $location
 * @property EventVisibility $visibility
 * @property string $start_time
 * @property int $duration_minutes
 * @property array{type: string, weekday: int, nth?: int, anchor_date?: string}|null $recurrence
 * @property bool $active
 * @property CarbonImmutable|null $generated_until
 * @property string|null $created_by_user_id
 * @property CarbonImmutable|null $archived_at
 */
final class EventTemplate extends Model
{
    /** @use HasFactory<EventTemplateFactory> */
    use HasFactory;

    use HasUlids;

    protected $guarded = [];

    protected static function newFactory(): EventTemplateFactory
    {
        return EventTemplateFactory::new();
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'owner_type' => EventOwnerType::class,
            'visibility' => EventVisibility::class,
            'duration_minutes' => 'integer',
            'recurrence' => 'array',
            'active' => 'boolean',
            'generated_until' => 'immutable_date',
            'archived_at' => 'immutable_datetime',
        ];
    }

    /** @return HasMany<EventTemplateSlot, $this> */
    public function slots(): HasMany
    {
        return $this->hasMany(EventTemplateSlot::class, 'template_id')->orderBy('sort_order')->orderBy('id');
    }

    /** @return BelongsTo<Ministry, $this> */
    public function ministry(): BelongsTo
    {
        return $this->belongsTo(Ministry::class);
    }

    /** @return BelongsTo<User, $this> */
    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }
}
