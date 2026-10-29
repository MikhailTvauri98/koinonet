<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Access;

use App\Modules\Access\Contracts\RoleUsageSource;
use App\Modules\Access\Models\Role;
use App\Modules\Calendar\EventAccess;
use App\Modules\Calendar\EventStatus;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventTemplate;
use App\Modules\Settings\ChurchSettings;
use Illuminate\Database\Eloquent\Builder;

final readonly class CalendarRoleUsageSource implements RoleUsageSource
{
    public function __construct(private EventAccess $access, private ChurchSettings $settings) {}

    public function blockersFor(Role $role): array
    {
        $viewer = auth()->user();
        $blockers = [];
        $events = Event::query()->where('status', EventStatus::Scheduled)
            ->whereNull('archived_at')->where('ends_at', '>', now())
            ->whereHas('slots', fn (Builder $slots) => $slots->whereNull('archived_at')->where('role_id', $role->id))
            ->orderBy('starts_at')->orderBy('id')->get();

        foreach ($events as $event) {
            $blockers[] = [
                'type' => 'event_slot',
                'id' => $event->id,
                'title' => $viewer !== null && $this->access->canView($viewer, $event)
                    ? $event->title.', '.$event->starts_at->setTimezone($this->settings->timezone())->format('d.m.Y')
                    : 'Скрытое событие',
            ];
        }

        $templates = EventTemplate::query()->where('active', true)->whereNull('archived_at')
            ->whereHas('slots', fn (Builder $slots) => $slots->whereNull('archived_at')->where('role_id', $role->id))
            ->orderBy('id')->get();

        foreach ($templates as $template) {
            $blockers[] = [
                'type' => 'template_slot',
                'id' => $template->id,
                'title' => $viewer !== null && $this->access->canViewTemplate($viewer, $template)
                    ? $template->title : 'Скрытый шаблон',
            ];
        }

        return $blockers;
    }
}
