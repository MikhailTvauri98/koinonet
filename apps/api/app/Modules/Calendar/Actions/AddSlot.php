<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Actions;

use App\Modules\Access\Models\Role;
use App\Modules\Access\RoleScope;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Calendar\ResourceType;
use App\Modules\Ministries\Models\Ministry;
use App\Support\DomainRuleException;

final class AddSlot
{
    /** @param array{label?: string|null, role_id?: string|null, required_count: int, sort_order?: int} $attributes */
    public function handle(Event $event, array $attributes): EventSlot
    {
        $role = isset($attributes['role_id']) ? Role::query()->find($attributes['role_id']) : null;
        if (isset($attributes['role_id']) && ($role === null || $role->scope !== RoleScope::Ministry
            || ! Ministry::query()->whereKey($role->ministry_id)->whereNull('archived_at')->exists())) {
            throw DomainRuleException::because('slot.role_not_ministry', 'Слот требует роль действующего служения.');
        }
        $label = $attributes['label'] ?? $role?->name;
        if ($label === null || trim($label) === '') {
            throw DomainRuleException::because('slot.label_required', 'Укажите подпись свободного слота.');
        }

        return $event->slots()->create([
            'label' => $label,
            'resource_type' => ResourceType::Person,
            'role_id' => $role?->id,
            'required_count' => $attributes['required_count'],
            'sort_order' => $attributes['sort_order'] ?? 0,
        ]);
    }
}
