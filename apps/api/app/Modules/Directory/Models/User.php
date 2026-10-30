<?php

declare(strict_types=1);

namespace App\Modules\Directory\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Laravel\Sanctum\HasApiTokens;

/**
 * @property string $id
 * @property string $person_id
 * @property string|null $phone
 * @property string|null $email
 * @property string $ical_token
 * @property Carbon|null $disabled_at
 * @property-read Person $person
 */
final class User extends Authenticatable
{
    use HasApiTokens;

    /** @use HasFactory<UserFactory> */
    use HasFactory;

    use HasUlids;
    use Notifiable;

    protected $guarded = [];

    /** @var list<string> */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected static function booted(): void
    {
        self::creating(function (self $user): void {
            if ($user->getAttribute('ical_token') === null) {
                $user->setAttribute('ical_token', Str::random(64));
            }
        });
    }

    protected static function newFactory(): UserFactory
    {
        return UserFactory::new();
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'last_login_at' => 'datetime',
            'disabled_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<Person, $this> */
    public function person(): BelongsTo
    {
        return $this->belongsTo(Person::class);
    }

    public function isDisabled(): bool
    {
        return $this->getAttribute('disabled_at') !== null;
    }

    public function icalUrl(): string
    {
        return url("/api/v1/calendar/feed/{$this->ical_token}.ics");
    }

    public function receivesBroadcastNotificationsOn(): string
    {
        return "user.{$this->id}";
    }
}
