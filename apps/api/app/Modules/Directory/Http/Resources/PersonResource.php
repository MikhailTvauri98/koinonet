<?php

declare(strict_types=1);

namespace App\Modules\Directory\Http\Resources;

use App\Modules\Access\Models\Role;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use App\Modules\Directory\PersonVisibility;
use App\Modules\Media\SignedMediaUrl;
use App\Modules\Ministries\Models\Ministry;
use App\Modules\Ministries\Models\MinistryMember;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Gate;

/** @mixin Person */
final class PersonResource extends JsonResource
{
    // A permitted write does not grant permission to read its resulting card.
    // Keep the full read schema distinct from a write-only acknowledgement.
    public static function forMutation(Person $person): self|PersonReferenceResource
    {
        return Gate::allows('view', $person)
            ? new self($person->loadCardFlags())
            : new PersonReferenceResource($person);
    }

    /**
     * @return array{
     *     id: string,
     *     last_name: string,
     *     first_name: string,
     *     patronymic: string|null,
     *     full_name: string,
     *     status: string,
     *     archived: bool,
     *     has_account: bool,
     *     user_id: string|null,
     *     has_global_roles: bool,
     *     account_disabled: bool,
     *     photo_url: string|null,
     *     contacts?: array{phone: string|null, email: string|null, birth_date: string|null},
     *     note?: string|null,
     *     global_roles?: list<array{id: string, name: string}>,
     *     ministries?: list<array{id: string, name: string}>
     * }
     */
    public function toArray(Request $request): array
    {
        $person = $this->resource;
        assert($person instanceof Person);
        $viewer = $request->user();
        assert($viewer instanceof User);
        $visibility = app(PersonVisibility::class);
        $userId = $person->user?->id;

        return [
            'id' => $person->id,
            'last_name' => $person->last_name,
            'first_name' => $person->first_name,
            'patronymic' => $person->patronymic,
            'full_name' => $person->fullName(),
            'status' => $person->status->value,
            'archived' => $person->archived_at !== null,
            // Reads authorize the card, own-profile responses concern the
            // caller, and mutation responses select this resource only after
            // PersonPolicy::view succeeds (see forMutation).
            'photo_url' => SignedMediaUrl::variant($person->photo, 'thumb'),
            'has_account' => (bool) $person->getAttribute('user_exists'),
            'user_id' => $userId === null ? null : (string) $userId,
            'has_global_roles' => (bool) $person->getAttribute('global_roles_exists'),
            'account_disabled' => (bool) $person->getAttribute('account_disabled'),
            'global_roles' => $this->whenLoaded('globalRoles', fn (): array => $person->globalRoles
                ->sortBy('name')->values()
                ->map(fn (Role $role): array => ['id' => $role->id, 'name' => $role->name])->all()),
            'ministries' => $this->whenLoaded('ministryMemberships', fn (): array => $person->ministryMemberships
                ->map(fn (MinistryMember $member): ?Ministry => $member->ministry)
                ->filter(fn (?Ministry $ministry): bool => $ministry !== null
                    && $ministry->archived_at === null
                    && Gate::forUser($viewer)->allows('view', $ministry))
                ->sortBy('name')->values()
                ->map(fn (Ministry $ministry): array => ['id' => $ministry->id, 'name' => $ministry->name])->all()),
            'contacts' => $this->when(
                $visibility->canSeeContacts($viewer, $person),
                [
                    'phone' => $person->phone,
                    'email' => $person->email,
                    'birth_date' => $person->birth_date?->format('Y-m-d'),
                ],
            ),
            'note' => $this->when(
                $visibility->canSeeNotes($viewer, $person),
                $person->note,
            ),
        ];
    }
}
