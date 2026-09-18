<?php

declare(strict_types=1);

namespace App\Modules\Access\Http\Controllers;

use App\Modules\Access\Http\Resources\AuditEntryResource;
use App\Modules\Access\Models\AuditEntry;
use Dedoc\Scramble\Attributes\Response as OpenApiResponse;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

final class AuditController
{
    private const string AUDIT_RESPONSE = 'array{data: list<array{id: string, action: string, actor: array{id: string, person_id: string, name: string}|null, subject_type: string|null, subject_id: string|null, payload: array<string, mixed>|null, ip: string|null, created_at: string}>, next_cursor: string|null}';

    #[OpenApiResponse(type: self::AUDIT_RESPONSE)]
    public function __invoke(Request $request): JsonResponse
    {
        Gate::authorize('viewAny', AuditEntry::class);

        /** @var array{cursor?: string, actor?: string, action?: string, subject_type?: string, subject_id?: string, from?: string, to?: string} $filters */
        $filters = $request->validate([
            'cursor' => ['sometimes', 'string', 'max:2048'],
            'actor' => ['sometimes', 'string', 'size:26'],
            'action' => ['sometimes', 'string', 'max:64'],
            'subject_type' => ['sometimes', 'string', 'max:64'],
            'subject_id' => ['sometimes', 'string', 'size:26'],
            'from' => ['sometimes', 'date'],
            'to' => ['sometimes', 'date', 'after_or_equal:from'],
        ]);

        $query = AuditEntry::query()
            ->with('actor.person')
            ->when(
                $filters['actor'] ?? null,
                fn (Builder $query, string $actor): Builder => $query->where('actor_user_id', $actor),
            )
            ->when(
                $filters['action'] ?? null,
                fn (Builder $query, string $action): Builder => $query->where('action', $action),
            )
            ->when(
                $filters['subject_type'] ?? null,
                fn (Builder $query, string $type): Builder => $query->where('subject_type', $type),
            )
            ->when(
                $filters['subject_id'] ?? null,
                fn (Builder $query, string $id): Builder => $query->where('subject_id', $id),
            )
            ->when(
                $filters['from'] ?? null,
                fn (Builder $query, string $from): Builder => $query->where('created_at', '>=', $from),
            )
            ->when(
                $filters['to'] ?? null,
                fn (Builder $query, string $to): Builder => $query->where('created_at', '<=', $to),
            )
            ->orderByDesc('created_at')
            ->orderByDesc('id');

        $entries = $query->cursorPaginate(50)->withQueryString();

        return response()->json([
            'data' => AuditEntryResource::collection($entries->items())->resolve($request),
            'next_cursor' => $entries->nextCursor()?->encode(),
        ]);
    }
}
