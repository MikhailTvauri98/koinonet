<?php

declare(strict_types=1);

namespace App\Modules\Media\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Polymorphic link from a media file to the message, announcement or event
 * it belongs to. A person's photo and a ministry's cover reference `media`
 * directly instead (section 5.8) and do not go through this table.
 *
 * @property string $id
 * @property string $media_id
 * @property string $attachable_type
 * @property string $attachable_id
 * @property int $sort_order
 * @property Carbon $created_at
 */
final class MediaAttachment extends Model
{
    use HasUlids;

    protected $guarded = [];

    public $timestamps = false;

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'sort_order' => 'integer',
            'created_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<Media, $this> */
    public function media(): BelongsTo
    {
        return $this->belongsTo(Media::class);
    }
}
