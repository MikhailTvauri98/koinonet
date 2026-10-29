<?php

declare(strict_types=1);

namespace App\Modules\Access;

use App\Modules\Access\Models\AuditEntry;
use App\Modules\Directory\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

final class AuditLogger
{
    /** @param array<string, mixed> $payload */
    public function record(string $action, ?Model $subject = null, array $payload = []): void
    {
        $this->recordForActor(auth()->user(), $action, $subject, $payload);
    }

    /** @param array<string, mixed> $payload */
    public function recordForActor(?User $actor, string $action, ?Model $subject = null, array $payload = []): void
    {
        $subjectId = $subject?->getKey();

        AuditEntry::query()->create([
            'actor_user_id' => $actor?->id,
            'action' => $action,
            'subject_type' => $subject === null
                ? null
                : Str::of(class_basename($subject))->snake()->toString(),
            'subject_id' => $subjectId === null ? null : (string) $subjectId,
            'payload' => $payload === [] ? null : $payload,
            'ip' => request()->ip(),
            'created_at' => now(),
        ]);
    }
}
