<?php

declare(strict_types=1);

namespace App\Modules\Directory\Actions;

use App\Modules\Access\AuditLogger;
use App\Modules\Directory\AccessLinkKind;
use App\Modules\Directory\Models\AccessLink;
use App\Modules\Directory\Models\Person;
use App\Support\DomainRuleException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final readonly class CreatePasswordResetLink
{
    public function __construct(private AuditLogger $audit) {}

    /** @return array{link: AccessLink, url: string} */
    public function handle(Person $person): array
    {
        return DB::transaction(function () use ($person): array {
            $person = Person::query()->whereKey($person->id)->lockForUpdate()->sole();

            if ($person->user()->doesntExist()) {
                throw DomainRuleException::because(
                    'password_reset.person_has_no_account',
                    'У человека нет аккаунта.',
                );
            }

            AccessLink::query()
                ->where('person_id', $person->id)
                ->where('kind', AccessLinkKind::PasswordReset)
                ->whereNull('used_at')
                ->whereNull('revoked_at')
                ->lockForUpdate()
                ->update(['revoked_at' => now()]);

            $token = Str::random(48);
            $link = AccessLink::query()->create([
                'person_id' => $person->id,
                'kind' => AccessLinkKind::PasswordReset,
                'token_hash' => hash('sha256', $token),
                'created_by_user_id' => auth()->id(),
                'expires_at' => now()->addDay(),
                'created_at' => now(),
            ]);

            $this->audit->record('person.password_reset_link_created', $person);

            return [
                'link' => $link,
                'url' => rtrim((string) config('app.frontend_url'), '/')."/password-reset/{$token}",
            ];
        });
    }
}
