<?php

declare(strict_types=1);

namespace App\Modules\Ministries\Actions;

use App\Modules\Access\AuditLogger;
use App\Modules\Directory\Models\Person;
use App\Modules\Ministries\Events\MemberAdded;
use App\Modules\Ministries\Models\Ministry;
use App\Modules\Ministries\Models\MinistryMember;
use App\Support\DomainRuleException;
use Illuminate\Support\Facades\DB;

final class AddMember
{
    /** @param list<string> $roleIds дополнительные роли сверх роли по умолчанию */
    public function handle(Ministry $ministry, Person $person, array $roleIds = []): MinistryMember
    {
        if ($person->archived_at !== null) {
            throw DomainRuleException::because('member.person_archived', 'Человек архивирован.');
        }

        if ($ministry->members()->where('person_id', $person->id)->exists()) {
            throw DomainRuleException::because('member.already_in_ministry', 'Человек уже в служении.');
        }

        $member = DB::transaction(function () use ($ministry, $person, $roleIds) {
            $member = $ministry->members()->create([
                'person_id' => $person->id,
                'joined_at' => now(),
                'added_by_user_id' => auth()->id(),
            ]);

            $defaultRoleId = $ministry->default_role_id;
            assert($defaultRoleId !== null);

            $this->attachRoles($ministry, $member, array_values(array_unique([$defaultRoleId, ...$roleIds])));

            return $member;
        });

        app(AuditLogger::class)->record('member.added', $member, ['ministry_id' => $ministry->id]);
        MemberAdded::dispatch($ministry->id, $person->id, $person->user?->id);

        return $member->load(['roles', 'person.photo']);
    }

    /** @param list<string> $roleIds */
    private function attachRoles(Ministry $ministry, MinistryMember $member, array $roleIds): void
    {
        $member->roles()->attach($roleIds, ['ministry_id' => $ministry->id]);
    }
}
