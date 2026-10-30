<?php

declare(strict_types=1);

namespace App\Modules\Chat\Models;

use App\Modules\Calendar\Models\Event;
use App\Modules\Chat\ChatType;
use App\Modules\Directory\Models\User;
use App\Modules\Ministries\Models\Ministry;
use Carbon\CarbonImmutable;
use Database\Factories\ChatFactory;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property string $id
 * @property ChatType $type
 * @property string|null $ministry_id
 * @property string|null $event_id
 * @property string|null $direct_key
 * @property string|null $title
 * @property string|null $avatar_media_id
 * @property string|null $created_by_user_id
 * @property string|null $last_message_id
 * @property CarbonImmutable|null $last_message_at
 * @property CarbonImmutable|null $archived_at
 */
final class Chat extends Model
{
    /** @use HasFactory<ChatFactory> */
    use HasFactory;

    use HasUlids;

    protected $guarded = [];

    protected static function newFactory(): ChatFactory
    {
        return ChatFactory::new();
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['type' => ChatType::class, 'last_message_at' => 'immutable_datetime', 'archived_at' => 'immutable_datetime'];
    }

    public static function directKey(string $a, string $b): string
    {
        return min($a, $b).':'.max($a, $b);
    }

    /** @return HasMany<ChatMember, $this> */
    public function members(): HasMany
    {
        return $this->hasMany(ChatMember::class);
    }

    /** @return HasMany<Message, $this> */
    public function messages(): HasMany
    {
        return $this->hasMany(Message::class);
    }

    /** @return HasMany<ChatPinnedMessage, $this> */
    public function pins(): HasMany
    {
        return $this->hasMany(ChatPinnedMessage::class);
    }

    /** @return BelongsTo<Message, $this> */
    public function lastMessage(): BelongsTo
    {
        return $this->belongsTo(Message::class, 'last_message_id');
    }

    /** @return BelongsTo<Ministry, $this> */
    public function ministry(): BelongsTo
    {
        return $this->belongsTo(Ministry::class);
    }

    /** @return BelongsTo<Event, $this> */
    public function event(): BelongsTo
    {
        return $this->belongsTo(Event::class);
    }

    /** @return BelongsTo<User, $this> */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }
}
