<?php

declare(strict_types=1);

namespace App\Modules\Ministries\Models;

use App\Modules\Access\Models\Role;
use Database\Factories\MinistryFactory;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * @property string $id
 * @property string $name
 * @property string|null $description
 * @property string|null $cover_media_id
 * @property string|null $default_role_id
 * @property Carbon|null $archived_at
 * @property-read Role|null $defaultRole
 */
final class Ministry extends Model
{
    /** @use HasFactory<MinistryFactory> */
    use HasFactory;

    use HasUlids;

    protected $guarded = [];

    protected static function newFactory(): MinistryFactory
    {
        return MinistryFactory::new();
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'archived_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<Role, $this> */
    public function defaultRole(): BelongsTo
    {
        return $this->belongsTo(Role::class, 'default_role_id');
    }

    /** @return HasMany<Role, $this> */
    public function roles(): HasMany
    {
        return $this->hasMany(Role::class, 'ministry_id');
    }

    /** @return HasMany<MinistryMember, $this> */
    public function members(): HasMany
    {
        return $this->hasMany(MinistryMember::class);
    }
}
