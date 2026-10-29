<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * @property string $user_id
 * @property string $category
 * @property bool $enabled
 */
final class NotificationSetting extends Model
{
    public $incrementing = false;

    public $timestamps = false;

    /** @var list<string> */
    protected $fillable = ['user_id', 'category', 'enabled'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['enabled' => 'boolean'];
    }

    /**
     * Eloquent otherwise updates by an id column, but this table has a pair key.
     *
     * @param  Builder<static>  $query
     * @return Builder<static>
     */
    protected function setKeysForSaveQuery($query)
    {
        return $query
            ->where('user_id', $this->getOriginal('user_id', $this->user_id))
            ->where('category', $this->getOriginal('category', $this->category));
    }
}
