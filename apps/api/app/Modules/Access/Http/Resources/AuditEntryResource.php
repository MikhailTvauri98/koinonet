<?php

declare(strict_types=1);

namespace App\Modules\Access\Http\Resources;

use App\Modules\Access\Models\AuditEntry;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin AuditEntry */
final class AuditEntryResource extends JsonResource
{
    /**
     * @return array{
     *     id: string,
     *     action: string,
     *     actor: array{id: string, person_id: string, name: string}|null,
     *     subject_type: string|null,
     *     subject_id: string|null,
     *     payload: array<string, mixed>|null,
     *     ip: string|null,
     *     created_at: string
     * }
     */
    public function toArray(Request $request): array
    {
        $entry = $this->resource;
        assert($entry instanceof AuditEntry);

        $actor = $entry->actor;

        return [
            'id' => $entry->id,
            'action' => $entry->action,
            'actor' => $actor === null ? null : [
                'id' => $actor->id,
                'person_id' => $actor->person_id,
                'name' => $actor->person->fullName(),
            ],
            'subject_type' => $entry->subject_type,
            'subject_id' => $entry->subject_id,
            'payload' => $entry->payload,
            'ip' => $entry->ip,
            'created_at' => $entry->created_at->toISOString(),
        ];
    }
}
