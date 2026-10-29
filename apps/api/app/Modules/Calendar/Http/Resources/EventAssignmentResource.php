<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Http\Resources;

use App\Modules\Calendar\Models\EventAssignment;
use App\Modules\Directory\Models\User;
use App\Modules\Media\SignedMediaUrl;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Gate;

/** @mixin EventAssignment */
final class EventAssignmentResource extends JsonResource
{
    /** @return array{id: string, person: array{id: string, full_name: string|null, photo_thumb_url: string|null}, created_at: string} */
    public function toArray(Request $request): array
    {
        $assignment = $this->resource;
        assert($assignment instanceof EventAssignment);
        $person = $assignment->person;
        assert($person !== null);
        $viewer = $request->user();
        assert($viewer instanceof User);
        $canViewPerson = Gate::forUser($viewer)->allows('view', $person);

        return [
            'id' => $assignment->id,
            'person' => [
                'id' => $person->id,
                'full_name' => $canViewPerson ? $person->fullName() : null,
                'photo_thumb_url' => $canViewPerson ? SignedMediaUrl::variant($person->photo, 'thumb') : null,
            ],
            /** @format date-time */
            'created_at' => $assignment->created_at->toISOString(),
        ];
    }
}
