<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Actions;

use App\Modules\Calendar\Models\EventTemplate;
use App\Modules\Calendar\ResourceType;
use App\Modules\Calendar\SlotAttributes;
use App\Support\DomainRuleException;
use Illuminate\Support\Facades\DB;

final readonly class ReplaceTemplateSlots
{
    public function __construct(private SlotAttributes $definition) {}

    /** @param list<array{label?: string|null, role_id?: string|null, required_count: int}> $slots */
    public function handle(EventTemplate $template, array $slots): void
    {
        DB::transaction(function () use ($template, $slots): void {
            $template = EventTemplate::query()->lockForUpdate()->findOrFail($template->id);
            if ($template->archived_at !== null) {
                throw DomainRuleException::because('template.archived', 'Архивный шаблон изменить нельзя.');
            }
            $template->slots()->whereNull('archived_at')->update(['archived_at' => now()]);
            foreach ($slots as $position => $slot) {
                $template->slots()->create([
                    ...$this->definition->resolve($slot['label'] ?? null, $slot['role_id'] ?? null),
                    'required_count' => $slot['required_count'],
                    'sort_order' => $position,
                    'resource_type' => ResourceType::Person,
                ]);
            }
        });
    }
}
