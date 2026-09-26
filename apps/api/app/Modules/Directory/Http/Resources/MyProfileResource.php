<?php

declare(strict_types=1);

namespace App\Modules\Directory\Http\Resources;

use App\Modules\Directory\Models\Person;
use App\Modules\Media\SignedMediaUrl;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The "read" half of `PATCH /me/profile`: what the profile screen edits.
 * `GET /people/{id}` does not fit, since it never exposes `contacts_public`,
 * the very flag this screen toggles (see PersonResource for the visibility
 * rules that field would otherwise have to earn). Own profile is always
 * readable without any permission (architecture 6.1's "Всегда доступно без
 * прав" list), so this resource skips every visibility check PersonResource
 * carries for viewing *someone else's* card - there is no "someone else"
 * here, `$request->user()->person` is always the caller's own record.
 *
 * @mixin Person
 */
final class MyProfileResource extends JsonResource
{
    /**
     * @return array{
     *     photo_url: string|null,
     *     contacts: array{phone: string|null, email: string|null, birth_date: string|null},
     *     contacts_public: bool
     * }
     */
    public function toArray(Request $request): array
    {
        $person = $this->resource;
        assert($person instanceof Person);

        return [
            'photo_url' => SignedMediaUrl::variant($person->photo, 'thumb'),
            'contacts' => [
                'phone' => $person->phone,
                'email' => $person->email,
                'birth_date' => $person->birth_date?->format('Y-m-d'),
            ],
            'contacts_public' => $person->contacts_public,
        ];
    }
}
