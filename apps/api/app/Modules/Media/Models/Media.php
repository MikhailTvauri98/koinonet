<?php

declare(strict_types=1);

namespace App\Modules\Media\Models;

use App\Modules\Directory\Models\User;
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
 * @property string $uploader_user_id
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
}
