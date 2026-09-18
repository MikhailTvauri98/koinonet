<?php

declare(strict_types=1);

namespace App\Modules\Access\Models;

use App\Modules\Directory\Models\User;
use Database\Factories\AuditEntryFactory;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * @property string $id
 * @property string|null $actor_user_id
 * @property string $action
 * @property string|null $subject_type
 * @property string|null $subject_id
 * @property array<string, mixed>|null $payload
 * @property string|null $ip
 * @property Carbon $created_at
 * @property-read User|null $actor
 */
final class AuditEntry extends Model
{
    /** @use HasFactory<AuditEntryFactory> */
    use HasFactory;

    use HasUlids;

    protected $guarded = [];

    public $timestamps = false;

    protected static function newFactory(): AuditEntryFactory
    {
        return AuditEntryFactory::new();
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'created_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_user_id');
    }
}
