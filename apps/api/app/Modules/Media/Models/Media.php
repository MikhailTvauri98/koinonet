<?php

declare(strict_types=1);

namespace App\Modules\Media\Models;

use App\Modules\Directory\Models\User;
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
}
