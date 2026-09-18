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

final readonly class CreateInvitation
{
    public function __construct(private AuditLogger $audit) {}

    /** @return array{link: AccessLink, url: string} */
    public function handle(Person $person): array
    {
        return DB::transaction(function () use ($person): array {
            $person = Person::query()->whereKey($person->id)->lockForUpdate()->sole();

            if ($person->archived_at !== null) {
                throw DomainRuleException::because('invite.person_archived', 'Человек архивирован.');
            }

            if ($person->user()->exists()) {
                throw DomainRuleException::because('invite.person_has_account', 'У человека уже есть аккаунт.');
            }

            if ($person->globalRoles()->doesntExist()) {
                throw DomainRuleException::because(
                    'invite.person_has_no_global_role',
                    'Сначала выдайте человеку хотя бы одну глобальную роль.',
                );
            }

            AccessLink::query()
                ->where('person_id', $person->id)
                ->where('kind', AccessLinkKind::Invite)
                ->whereNull('used_at')
                ->whereNull('revoked_at')
                ->lockForUpdate()
                ->update(['revoked_at' => now()]);

            $token = Str::random(48);
            $link = AccessLink::query()->create([
                'person_id' => $person->id,
                'kind' => AccessLinkKind::Invite,
                'token_hash' => hash('sha256', $token),
                'created_by_user_id' => auth()->id(),
                'expires_at' => now()->addDays(7),
                'created_at' => now(),
            ]);

            $this->audit->record('person.invited', $person);

            return [
                'link' => $link,
                'url' => rtrim((string) config('app.frontend_url'), '/')."/invite/{$token}",
            ];
        });
    }
}
