<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Models;

use App\Modules\Directory\Models\User;
use Database\Factories\PushSubscriptionFactory;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * @property string $id
 * @property string $user_id
 * @property string $endpoint
 * @property string $public_key
 * @property string $auth_token
 * @property string $content_encoding
 * @property string|null $user_agent
 * @property Carbon $created_at
 * @property Carbon|null $last_success_at
 * @property int $failures
 * @property-read User $user
 */
final class PushSubscription extends Model
{
    /** @use HasFactory<PushSubscriptionFactory> */
    use HasFactory;

    use HasUlids;

    public const UPDATED_AT = null;

    /** @var list<string> */
    protected $fillable = [
        'user_id', 'endpoint', 'public_key', 'auth_token', 'content_encoding',
        'user_agent', 'last_success_at', 'failures',
    ];

    /** @var array<string, mixed> */
    protected $attributes = ['content_encoding' => 'aes128gcm', 'failures' => 0];

    protected static function newFactory(): PushSubscriptionFactory
    {
        return PushSubscriptionFactory::new();
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['last_success_at' => 'datetime', 'failures' => 'integer'];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
