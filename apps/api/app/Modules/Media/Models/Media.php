<?php

declare(strict_types=1);

namespace App\Modules\Media\Models;

use App\Modules\Directory\Models\User;
use App\Modules\Media\Actions\AttachDirectMedia;
use App\Modules\Media\Actions\DeleteOwnMedia;
use App\Modules\Media\Console\PruneOrphanMediaCommand;
use App\Modules\Media\Jobs\ImageProcessor;
use App\Modules\Media\MediaKind;
use App\Modules\Media\MediaStatus;
use Database\Factories\MediaFactory;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * @property string $id
 * @property string|null $uploader_user_id null once the uploading account is erased
 * @property string $disk
 * @property string $path
 * @property string $original_name
 * @property string $mime
 * @property int $size
 * @property MediaKind $kind
 * @property int|null $width
 * @property int|null $height
 * @property array<string, mixed>|null $variants
 * @property MediaStatus $status
 * @property Carbon $created_at
 */
final class Media extends Model
{
    /** @use HasFactory<MediaFactory> */
    use HasFactory;

    use HasUlids;

    protected $guarded = [];

    public $timestamps = false;

    protected static function newFactory(): MediaFactory
    {
        return MediaFactory::new();
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'size' => 'integer',
            'kind' => MediaKind::class,
            'width' => 'integer',
            'height' => 'integer',
            'variants' => 'array',
            'status' => MediaStatus::class,
            'created_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploader_user_id');
    }

    /**
     * Whether `$userId` is the account that uploaded this file. A file whose
     * uploader was erased belongs to no account, not even to a caller
     * without one.
     */
    public function isUploadedBy(int|string|null $userId): bool
    {
        return $this->uploader_user_id !== null && $this->uploader_user_id === $userId;
    }

    /**
     * The MIME type to serve for one stored path of this media: `$mime` for
     * the original, or `image/webp` for a `thumb`/`large` variant - the only
     * format {@see ImageProcessor} writes variants in.
     */
    public function mimeFor(string $path): string
    {
        return match (strtolower(pathinfo($path, PATHINFO_EXTENSION))) {
            'webp' => 'image/webp',
            default => $this->mime,
        };
    }

    /**
     * Every path on `$disk` this media occupies: the original file plus
     * every processed variant (architecture 7.8). Used to remove a file
     * completely - own deletion and orphan pruning alike - without either
     * leaving a variant behind on disk or forgetting one still referenced.
     *
     * @return list<string>
     */
    public function storedPaths(): array
    {
        return [$this->path, ...array_values($this->variants ?? [])];
    }

    /**
     * A row-locked re-read of one media by id: the single place every
     * "check whether it's free, then attach or delete" sequence gets its
     * copy of the row from, so two concurrent requests for the same file
     * serialize on Postgres's row lock instead of both reading "free" and
     * both writing - the race that would silently break "a media file
     * belongs to exactly one object" (CONTEXT.md, "Медиафайл").
     *
     * Only holds anything while a transaction is open: `lockForUpdate()`
     * with no surrounding `DB::transaction()` releases the lock the moment
     * this call returns, which would defeat the whole point. Every caller -
     * {@see AttachDirectMedia}, {@see DeleteOwnMedia},
     * {@see PruneOrphanMediaCommand} - runs this inside one.
     */
    public static function lockedFind(string $id): self
    {
        return self::query()->whereKey($id)->lockForUpdate()->firstOrFail();
    }
}
