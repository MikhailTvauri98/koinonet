<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Models;

use App\Modules\Calendar\ReminderKind;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property string $event_id
 * @property ReminderKind $kind
 * @property CarbonImmutable $sent_at
 */
final class EventReminder extends Model
{
    public $timestamps = false;

    public $incrementing = false;

    protected $guarded = [];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'kind' => ReminderKind::class,
            'sent_at' => 'immutable_datetime',
        ];
    }

    /** @return BelongsTo<Event, $this> */
    public function event(): BelongsTo
    {
        return $this->belongsTo(Event::class);
    }
}
