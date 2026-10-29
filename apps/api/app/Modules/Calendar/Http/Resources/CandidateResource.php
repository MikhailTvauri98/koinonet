<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Http\Resources;

use App\Modules\Calendar\SlotCandidate;
use App\Modules\Directory\Models\User;
use App\Modules\Media\SignedMediaUrl;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Gate;

/** @mixin SlotCandidate */
final class CandidateResource extends JsonResource
{
    /** @return array{person: array{id: string, full_name: string|null, photo_thumb_url: string|null}, has_role: bool, conflicts: list<array{event_id: string|null, title: string, starts_at: string|null, ends_at: string|null}>} */
    public function toArray(Request $request): array
    {
        $candidate = $this->resource;
        assert($candidate instanceof SlotCandidate);
        $person = $candidate->person;
        $viewer = $request->user();
        assert($viewer instanceof User);
        $canViewPerson = Gate::forUser($viewer)->allows('view', $person);

        return [
            'person' => ['id' => $person->id, 'full_name' => $canViewPerson ? $person->fullName() : null,
                'photo_thumb_url' => $canViewPerson ? SignedMediaUrl::variant($person->photo, 'thumb') : null],
            'has_role' => $candidate->hasRole,
            'conflicts' => $candidate->conflicts,
        ];
    }
}
