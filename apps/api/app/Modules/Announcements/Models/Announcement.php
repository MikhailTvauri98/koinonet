<?php

declare(strict_types=1);

namespace App\Modules\Announcements\Models;

use App\Modules\Announcements\AnnouncementScope;
use App\Modules\Directory\Models\User;
use App\Modules\Ministries\Models\Ministry;
use App\Support\DomainRuleException;
use Database\Factories\AnnouncementFactory;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * @property string $id
 * @property AnnouncementScope $scope
 * @property string|null $ministry_id
 * @property string|null $author_user_id
 * @property string $title
 * @property string $body
 * @property Carbon|null $pinned_at
 * @property Carbon|null $hide_after
 * @property bool $notify_on_publish
 * @property Carbon $published_at
 * @property Carbon|null $archived_at
 */
final class Announcement extends Model
{
    /** @use HasFactory<AnnouncementFactory> */
    use HasFactory;

    use HasUlids;

    protected $guarded = [];

    protected static function newFactory(): AnnouncementFactory
    {
        return AnnouncementFactory::new();
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'scope' => AnnouncementScope::class,
            'pinned_at' => 'datetime',
            'hide_after' => 'date',
            'notify_on_publish' => 'boolean',
            'published_at' => 'datetime',
            'archived_at' => 'datetime',
        ];
    }

    public function ensureNotArchived(): void
    {
        if ($this->archived_at !== null) {
            throw DomainRuleException::because('announcement.archived', 'Архивное объявление изменить нельзя.');
        }
    }

    /** @return BelongsTo<Ministry, $this> */
    public function ministry(): BelongsTo
    {
        return $this->belongsTo(Ministry::class);
    }

    /** @return BelongsTo<User, $this> */
    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'author_user_id');
    }

    /** @return HasMany<AnnouncementView, $this> */
    public function views(): HasMany
    {
        return $this->hasMany(AnnouncementView::class);
    }
}
