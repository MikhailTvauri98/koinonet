<?php

declare(strict_types=1);

namespace App\Modules\Chat\Models;

use App\Modules\Directory\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property string $chat_id
 * @property string $user_id
 * @property bool $is_owner
 * @property CarbonImmutable|null $muted_until
 * @property string|null $last_read_message_id
 * @property CarbonImmutable $joined_at
 */
final class ChatMember extends Model
{
    public $incrementing = false;

    public $timestamps = false;

    protected $guarded = [];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['is_owner' => 'boolean', 'muted_until' => 'immutable_datetime', 'joined_at' => 'immutable_datetime'];
    }

    /** @param Builder<static> $query
     * @return Builder<static>
     */
    protected function setKeysForSaveQuery($query)
    {
        return $query->where('chat_id', $this->getOriginal('chat_id', $this->chat_id))
            ->where('user_id', $this->getOriginal('user_id', $this->user_id));
    }

    /** @param Builder<static> $query
     * @return Builder<static>
     */
    protected function setKeysForSelectQuery($query)
    {
        return $this->setKeysForSaveQuery($query);
    }

    /** @return BelongsTo<Chat, $this> */
    public function chat(): BelongsTo
    {
        return $this->belongsTo(Chat::class);
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function isMuted(): bool
    {
        return $this->muted_until !== null && $this->muted_until->isFuture();
    }
}
