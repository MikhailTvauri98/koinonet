<?php

declare(strict_types=1);

namespace App\Modules\Directory\Models;

use App\Modules\Directory\AccessLinkKind;
use App\Support\DomainRuleException;
use Database\Factories\AccessLinkFactory;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * @property string $id
 * @property string $person_id
 * @property AccessLinkKind $kind
 * @property string $token_hash
 * @property string|null $created_by_user_id
 * @property Carbon $expires_at
 * @property Carbon|null $used_at
 * @property Carbon|null $revoked_at
 * @property Carbon $created_at
 * @property-read Person $person
 * @property-read User|null $creator
 */
final class AccessLink extends Model
{
    /** @use HasFactory<AccessLinkFactory> */
    use HasFactory;

    use HasUlids;

    protected $guarded = [];

    public $timestamps = false;

    public string $plain_token;

    protected static function newFactory(): AccessLinkFactory
    {
        return AccessLinkFactory::new();
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'kind' => AccessLinkKind::class,
            'expires_at' => 'datetime',
            'used_at' => 'datetime',
            'revoked_at' => 'datetime',
            'created_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<Person, $this> */
    public function person(): BelongsTo
    {
        return $this->belongsTo(Person::class);
    }

    /** @return BelongsTo<User, $this> */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    public static function findByPlainToken(string $token): ?self
    {
        return self::query()->where('token_hash', hash('sha256', $token))->first();
    }

    public function ensureUsable(): void
    {
        if ($this->revoked_at !== null) {
            throw DomainRuleException::because('access_link.revoked', 'Ссылка отозвана.');
        }

        if ($this->used_at !== null) {
            throw DomainRuleException::because('access_link.used', 'Ссылка уже использована.');
        }

        if ($this->expires_at->isPast()) {
            throw DomainRuleException::because('access_link.expired', 'Срок действия ссылки истёк.');
        }
    }
}
