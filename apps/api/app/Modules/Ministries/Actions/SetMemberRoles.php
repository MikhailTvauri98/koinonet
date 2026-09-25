<?php

declare(strict_types=1);

namespace App\Modules\Ministries\Actions;

use App\Modules\Access\AuditLogger;
use App\Modules\Access\Models\Role;
use App\Modules\Ministries\Events\MemberRolesChanged;
use App\Modules\Ministries\Models\Ministry;
use App\Modules\Ministries\Models\MinistryMember;
use App\Support\DomainRuleException;
use Illuminate\Support\Facades\DB;

final readonly class SetMemberRoles
{
    public function __construct(private AuditLogger $audit) {}

    /** @param list<string> $roleIds */
    public function handle(Ministry $ministry, MinistryMember $member, array $roleIds): MinistryMember
    {
        if ($roleIds === []) {
            throw DomainRuleException::because(
                'member.last_role_cannot_be_removed',
                'У участника должна остаться хотя бы одна роль.',
            );
        }

        $roleIds = array_values(array_unique($roleIds));

        $ownedCount = Role::query()
            ->whereIn('id', $roleIds)
            ->where('ministry_id', $ministry->id)
            ->count();

        if ($ownedCount !== count($roleIds)) {
            throw DomainRuleException::because(
                'member.role_from_other_ministry',
                'Роль принадлежит другому служению.',
            );
        }

        /** @var list<string> $before */
        $before = $member->roles()->pluck('roles.id')->all();

        DB::transaction(function () use ($ministry, $member, $roleIds): void {
            $member->roles()->detach();
            $member->roles()->attach($roleIds, ['ministry_id' => $ministry->id]);
        });

        $this->audit->record('member.roles_changed', $member, [
            'ministry_id' => $ministry->id,
            'before' => $before,
            'after' => $roleIds,
        ]);
        MemberRolesChanged::dispatch($ministry->id, $member->person_id, $member->person->user?->id);

        return $member->load(['roles', 'person.photo']);
    }
}
