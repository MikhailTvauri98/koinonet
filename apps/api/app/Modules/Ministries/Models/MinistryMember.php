<?php

declare(strict_types=1);

namespace App\Modules\Ministries\Models;

use App\Modules\Access\Models\Role;
use App\Modules\Directory\Models\Person;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Support\Carbon;

/**
 * @property string $id
 * @property string $ministry_id
 * @property string $person_id
 * @property Carbon $joined_at
 * @property string|null $added_by_user_id
 */
final class MinistryMember extends Model
{
    use HasUlids;

    public $timestamps = false;

    protected $guarded = [];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'joined_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<Ministry, $this> */
    public function ministry(): BelongsTo
    {
        return $this->belongsTo(Ministry::class);
    }

    /** @return BelongsTo<Person, $this> */
    public function person(): BelongsTo
    {
        return $this->belongsTo(Person::class);
    }

    /** @return BelongsToMany<Role, $this, MinistryMemberRole> */
    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'ministry_member_roles', 'member_id', 'role_id')
            ->using(MinistryMemberRole::class)
            ->withPivot('ministry_id');
    }
}
