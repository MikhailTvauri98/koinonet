<?php

declare(strict_types=1);

namespace App\Modules\Chat\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property string $chat_id
 * @property string $message_id
 * @property string|null $pinned_by_user_id
 * @property CarbonImmutable $pinned_at
 */
final class ChatPinnedMessage extends Model
{
    public $incrementing = false;

    public $timestamps = false;

    protected $guarded = [];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['pinned_at' => 'immutable_datetime'];
    }

    /** @param Builder<static> $query
     * @return Builder<static>
     */
    protected function setKeysForSaveQuery($query)
    {
        return $query->where('chat_id', $this->getOriginal('chat_id', $this->chat_id))
            ->where('message_id', $this->getOriginal('message_id', $this->message_id));
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

    /** @return BelongsTo<Message, $this> */
    public function message(): BelongsTo
    {
        return $this->belongsTo(Message::class);
    }
}
