<?php

declare(strict_types=1);

namespace App\Modules\Access\Models;

use App\Modules\Access\RoleScope;
use App\Modules\Directory\Models\Person;
use Database\Factories\RoleFactory;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

final class Role extends Model
{
    /** @use HasFactory<RoleFactory> */
    use HasFactory;

    use HasUlids;

    protected $guarded = [];

    protected static function newFactory(): RoleFactory
    {
        return RoleFactory::new();
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'scope' => RoleScope::class,
            'is_system' => 'boolean',
        ];
    }

    /** @return BelongsToMany<Person, $this> */
    public function people(): BelongsToMany
    {
        return $this->belongsToMany(Person::class, 'person_roles')
            ->withPivot('assigned_by_user_id')
            ->withTimestamps(null, false);
    }

    /** @return HasMany<RolePermission, $this> */
    public function permissions(): HasMany
    {
        return $this->hasMany(RolePermission::class);
    }
}
