<?php

declare(strict_types=1);

namespace App\Modules\Directory\Models;

use App\Modules\Access\Models\Role;
use App\Modules\Directory\PersonStatus;
use Database\Factories\PersonFactory;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * @property string $id
 * @property string $last_name
 * @property string $first_name
 * @property string|null $patronymic
 * @property PersonStatus $status
 */
final class Person extends Model
{
    /** @use HasFactory<PersonFactory> */
    use HasFactory;

    use HasUlids;

    protected $guarded = [];

    protected static function newFactory(): PersonFactory
    {
        return PersonFactory::new();
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'status' => PersonStatus::class,
            'birth_date' => 'date',
            'contacts_public' => 'boolean',
            'archived_at' => 'datetime',
        ];
    }

    /** @return HasOne<User, $this> */
    public function user(): HasOne
    {
        return $this->hasOne(User::class);
    }

    /** @return BelongsToMany<Role, $this> */
    public function globalRoles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'person_roles');
    }

    public function fullName(): string
    {
        return trim(sprintf(
            '%s %s %s',
            (string) $this->getAttribute('last_name'),
            (string) $this->getAttribute('first_name'),
            (string) $this->getAttribute('patronymic'),
        ));
    }
}
