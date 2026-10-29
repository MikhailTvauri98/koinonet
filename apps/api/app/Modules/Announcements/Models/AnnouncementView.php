<?php

declare(strict_types=1);

namespace App\Modules\Announcements\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * Read model for the composite-key view record; writes use module Actions.
 *
 * @property string $announcement_id
 * @property string $user_id
 * @property Carbon $viewed_at
 */
final class AnnouncementView extends Model
{
    public $timestamps = false;

    public $incrementing = false;

    protected $guarded = [];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['viewed_at' => 'datetime'];
    }
}
