<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Models;

use App\Modules\Calendar\EventOwnerType;
use App\Modules\Calendar\EventStatus;
use App\Modules\Calendar\EventVisibility;
use App\Modules\Directory\Models\User;
use App\Modules\Media\Models\MediaAttachment;
use App\Modules\Ministries\Models\Ministry;
use Carbon\CarbonImmutable;
use Database\Factories\EventFactory;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;

/**
 * @property string $id
 * @property EventOwnerType $owner_type
 * @property string|null $ministry_id
 * @property string|null $template_id
 * @property CarbonImmutable|null $occurrence_date
 * @property string $title
 * @property string|null $description
 * @property string|null $location
 * @property CarbonImmutable $starts_at
 * @property CarbonImmutable $ends_at
 * @property EventVisibility $visibility
 * @property EventStatus $status
 * @property CarbonImmutable|null $cancelled_at
 * @property string|null $cancel_reason
 * @property string|null $created_by_user_id
 * @property CarbonImmutable|null $archived_at
 */
final class Event extends Model
{
    /** @use HasFactory<EventFactory> */
    use HasFactory;

    use HasUlids;

    protected $guarded = [];

    protected static function newFactory(): EventFactory
    {
        return EventFactory::new();
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'owner_type' => EventOwnerType::class,
            'visibility' => EventVisibility::class,
            'status' => EventStatus::class,
            'starts_at' => 'immutable_datetime',
            'ends_at' => 'immutable_datetime',
            'cancelled_at' => 'immutable_datetime',
            'occurrence_date' => 'immutable_date',
            'archived_at' => 'immutable_datetime',
        ];
    }

    public function isCancelled(): bool
    {
        return $this->status === EventStatus::Cancelled;
    }

    public function isPast(): bool
    {
        return $this->ends_at->lessThanOrEqualTo(now());
    }

    /** @return HasMany<EventSlot, $this> */
    public function slots(): HasMany
    {
        return $this->hasMany(EventSlot::class)->orderBy('sort_order')->orderBy('id');
    }

    /** @return MorphMany<MediaAttachment, $this> */
    public function attachments(): MorphMany
    {
        return $this->morphMany(MediaAttachment::class, 'attachable')->orderBy('sort_order')->orderBy('id');
    }

    /** @return BelongsTo<Ministry, $this> */
    public function ministry(): BelongsTo
    {
        return $this->belongsTo(Ministry::class);
    }

    /** @return BelongsTo<EventTemplate, $this> */
    public function template(): BelongsTo
    {
        return $this->belongsTo(EventTemplate::class, 'template_id');
    }

    /** @return BelongsTo<User, $this> */
    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    /** @return list<string> */
    public function assignedPersonIds(): array
    {
        return EventAssignment::query()
            ->whereNull('archived_at')
            ->whereHas('slot', fn ($query) => $query->where('event_id', $this->id)->whereNull('archived_at'))
            ->distinct()->orderBy('person_id')->pluck('person_id')->all();
    }
}
