<?php

declare(strict_types=1);

namespace App\Modules\Ministries\Actions;

use App\Modules\Access\Actions\CreateRole;
use App\Modules\Access\AuditLogger;
use App\Modules\Access\Permission;
use App\Modules\Access\PermissionScope;
use App\Modules\Access\RoleScope;
use App\Modules\Ministries\Events\MinistryCreated;
use App\Modules\Ministries\Models\Ministry;
use App\Support\DomainRuleException;
use Illuminate\Support\Facades\DB;

final readonly class CreateMinistry
{
    public function __construct(
        private CreateRole $createRole,
        private AuditLogger $audit,
    ) {}

    public function handle(string $name, ?string $description = null): Ministry
    {
        $taken = Ministry::query()
            ->whereNull('archived_at')
            ->where('name', $name)
            ->exists();

        if ($taken) {
            throw DomainRuleException::because('ministry.name_taken', 'Служение с таким названием уже есть.');
        }

        $ministry = DB::transaction(function () use ($name, $description): Ministry {
            $ministry = Ministry::query()->create(['name' => $name, 'description' => $description]);

            $this->createRole->handle(
                RoleScope::Ministry,
                $ministry->id,
                'Лидер',
                null,
                Permission::ofScope(PermissionScope::Ministry),
            );

            $member = $this->createRole->handle(RoleScope::Ministry, $ministry->id, 'Участник', null, []);

            $ministry->forceFill(['default_role_id' => $member->id])->save();

            return $ministry;
        });

        $this->audit->record('ministry.created', $ministry, ['name' => $ministry->name]);
        MinistryCreated::dispatch($ministry->id);

        return $ministry->refresh();
    }
}
