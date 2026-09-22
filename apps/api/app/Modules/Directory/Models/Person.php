<?php

declare(strict_types=1);

namespace App\Modules\Directory\Models;

use App\Modules\Access\Models\Role;
use App\Modules\Directory\PersonStatus;
use Database\Factories\PersonFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Carbon;

/**
 * @property string $id
 * @property string $last_name
 * @property string $first_name
 * @property string|null $patronymic
 * @property string|null $phone
 * @property string|null $email
 * @property Carbon|null $birth_date
 * @property PersonStatus $status
 * @property string|null $note
 * @property bool $contacts_public
 * @property Carbon|null $archived_at
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

    /**
     * Existence flags every person card shows: account, global roles, disabled account.
     *
     * @return array<int|string, string|callable>
     */
    private static function cardFlags(): array
    {
        return [
            'user',
            'globalRoles',
            'user as account_disabled' => fn (Builder $query) => $query->whereNotNull('disabled_at'),
        ];
    }

    public function loadCardFlags(): self
    {
        return $this->loadExists(self::cardFlags());
    }

    /** @param Builder<self> $query */
    public function scopeWithCardFlags(Builder $query): void
    {
        $query->withExists(self::cardFlags());
    }

    /** @return HasOne<User, $this> */
    public function user(): HasOne
    {
        return $this->hasOne(User::class);
    }

    /** @return BelongsToMany<Role, $this> */
    public function globalRoles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'person_roles')
            ->withPivot('assigned_by_user_id')
            ->withTimestamps(null, false);
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
