<?php

declare(strict_types=1);

namespace App\Modules\Access\Models;

use App\Modules\Access\RoleScope;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use Database\Factories\RoleFactory;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\DB;

/**
 * @property string $id
 * @property RoleScope $scope
 * @property string|null $ministry_id
 * @property string $name
 * @property string|null $description
 * @property bool $is_system
 */
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

    /**
     * Carriers of a global role hold it directly; carriers of a ministry role hold it through
     * membership, so both `person_roles` and `ministry_member_roles` are checked.
     *
     * @return list<string>
     */
    public function carrierUserIds(): array
    {
        return User::query()
            ->whereIn(
                'person_id',
                PersonRole::query()->where('role_id', $this->id)->select('person_id'),
            )
            ->orWhereIn(
                'person_id',
                DB::table('ministry_member_roles')
                    ->join('ministry_members', 'ministry_members.id', '=', 'ministry_member_roles.member_id')
                    ->where('ministry_member_roles.role_id', $this->id)
                    ->select('ministry_members.person_id'),
            )
            ->pluck('id')
            ->all();
    }
}
