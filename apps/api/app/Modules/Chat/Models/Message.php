<?php

declare(strict_types=1);

namespace App\Modules\Chat\Models;

use App\Modules\Directory\Models\User;
use App\Modules\Media\Models\MediaAttachment;
use Carbon\CarbonImmutable;
use Database\Factories\MessageFactory;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphMany;

/**
 * @property string $id
 * @property string $chat_id
 * @property string|null $sender_user_id
 * @property string|null $body
 * @property string|null $reply_to_id
 * @property CarbonImmutable $created_at
 * @property CarbonImmutable|null $edited_at
 * @property CarbonImmutable|null $deleted_at
 */
final class Message extends Model
{
    /** @use HasFactory<MessageFactory> */
    use HasFactory;

    use HasUlids;

    public $timestamps = false;

    protected $guarded = [];

    protected $dateFormat = 'Y-m-d H:i:s.u';

    protected static function newFactory(): MessageFactory
    {
        return MessageFactory::new();
    }

    protected static function booted(): void
    {
        self::creating(function (self $message): void {
            $message->created_at ??= CarbonImmutable::now('UTC');
        });
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['created_at' => 'immutable_datetime', 'edited_at' => 'immutable_datetime', 'deleted_at' => 'immutable_datetime'];
    }

    /** Normalize timestamps before Eloquent discards their timezone in storage.
     * @param  mixed  $value
     * @return string|null
     */
    public function fromDateTime($value)
    {
        return empty($value) ? $value : $this->asDateTime($value)->utc()->format($this->getDateFormat());
    }

    public function isDeleted(): bool
    {
        return $this->deleted_at !== null;
    }

    /** @return BelongsTo<Chat, $this> */
    public function chat(): BelongsTo
    {
        return $this->belongsTo(Chat::class);
    }

    /** @return BelongsTo<User, $this> */
    public function sender(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sender_user_id');
    }

    /** @return BelongsTo<Message, $this> */
    public function replyTo(): BelongsTo
    {
        return $this->belongsTo(Message::class, 'reply_to_id');
    }

    /** @return MorphMany<MediaAttachment, $this> */
    public function attachments(): MorphMany
    {
        return $this->morphMany(MediaAttachment::class, 'attachable')->orderBy('sort_order')->orderBy('id');
    }
}
