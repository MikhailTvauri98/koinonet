<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Console;

use App\Modules\Calendar\Actions\RecordReminder;
use App\Modules\Calendar\EventStatus;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\ReminderKind;
use App\Modules\Settings\ChurchSettings;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Database\Query\Builder;

final class SendRemindersCommand extends Command
{
    protected $signature = 'calendar:send-reminders';

    protected $description = 'Напомнить назначенным о событиях за сутки и за два часа';

    public function handle(ChurchSettings $settings, RecordReminder $record): int
    {
        $now = CarbonImmutable::now('UTC')->startOfSecond();
        $offsets = (array) $settings->all()['calendar.reminder_offsets'];
        foreach ($offsets as $value) {
            $kind = ReminderKind::from($value);
            $from = $now->add($kind->offset());
            foreach (Event::query()->where('status', EventStatus::Scheduled)->whereNull('archived_at')
                ->where('starts_at', '>=', $from)->where('starts_at', '<', $from->addMinutes(5))
                ->whereNotExists(fn (Builder $query) => $query->selectRaw('1')->from('event_reminders')
                    ->whereColumn('event_reminders.event_id', 'events.id')->where('kind', $kind->value))
                ->lazyById() as $event) {
                $record->handle($event, $kind, $now);
            }
        }

        return self::SUCCESS;
    }
}
