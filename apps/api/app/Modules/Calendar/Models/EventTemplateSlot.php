<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Models;

use App\Modules\Access\Models\Role;
use App\Modules\Calendar\ResourceType;
use Carbon\CarbonImmutable;
use Database\Factories\EventTemplateSlotFactory;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property string $id
 * @property string $template_id
 * @property string $label
 * @property ResourceType $resource_type
 * @property string|null $role_id
 * @property int $required_count
 * @property int $sort_order
 * @property CarbonImmutable|null $archived_at
 */
final class EventTemplateSlot extends Model
{
    /** @use HasFactory<EventTemplateSlotFactory> */
    use HasFactory;

    use HasUlids;

    protected $guarded = [];

    protected static function newFactory(): EventTemplateSlotFactory
    {
        return EventTemplateSlotFactory::new();
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

    /** @return BelongsTo<EventTemplate, $this> */
    public function template(): BelongsTo
    {
        return $this->belongsTo(EventTemplate::class, 'template_id');
    }

    /** @return BelongsTo<Role, $this> */
    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class);
    }
}
