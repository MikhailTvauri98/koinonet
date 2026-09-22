<?php

declare(strict_types=1);

namespace App\Modules\Ministries\Actions;

use App\Modules\Ministries\Models\Ministry;
use App\Support\DomainRuleException;

final class UpdateMinistry
{
    /** @param array{name?: string, description?: string|null} $attributes */
    public function handle(Ministry $ministry, array $attributes): Ministry
    {
        if ($ministry->archived_at !== null) {
            throw DomainRuleException::because(
                'ministry.archived',
                'Архивное служение изменить нельзя.',
            );
        }

        $name = $attributes['name'] ?? null;

        if ($name !== null && $name !== $ministry->name) {
            $taken = Ministry::query()
                ->whereKeyNot($ministry->id)
                ->whereNull('archived_at')
                ->where('name', $name)
                ->exists();

            if ($taken) {
                throw DomainRuleException::because('ministry.name_taken', 'Служение с таким названием уже есть.');
            }
        }

        $ministry->fill($attributes)->save();

        return $ministry;
    }
}
