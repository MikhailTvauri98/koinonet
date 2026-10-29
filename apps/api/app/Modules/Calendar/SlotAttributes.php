<?php

declare(strict_types=1);

namespace App\Modules\Calendar;

use App\Modules\Access\Models\Role;
use App\Modules\Access\RoleScope;
use App\Modules\Ministries\Models\Ministry;
use App\Support\DomainRuleException;

final class SlotAttributes
{
    /** @return array{label: string, role_id: string|null} */
    public function resolve(?string $label, ?string $roleId): array
    {
        $role = $roleId === null ? null : Role::query()->find($roleId);
        if ($roleId !== null && ($role === null || $role->scope !== RoleScope::Ministry)) {
            throw DomainRuleException::because('slot.role_not_ministry', 'Слот требует роль служения.');
        }
        if ($role !== null && ! Ministry::query()->whereKey($role->ministry_id)->whereNull('archived_at')->exists()) {
            throw DomainRuleException::because('slot.role_archived_ministry', 'Нельзя выбрать роль архивного служения.');
        }
        $label = trim($label ?? '');
        $label = $label === '' ? $role?->name : $label;
        if ($label === null) {
            throw DomainRuleException::because('slot.label_required', 'Укажите подпись свободного слота.');
        }

        return ['label' => $label, 'role_id' => $role?->id];
    }
}
