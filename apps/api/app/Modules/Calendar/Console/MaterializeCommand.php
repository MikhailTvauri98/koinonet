<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Console;

use App\Modules\Calendar\Actions\MaterializeTemplate;
use App\Modules\Calendar\Models\EventTemplate;
use App\Modules\Settings\ChurchSettings;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Builder;

final class MaterializeCommand extends Command
{
    protected $signature = 'calendar:materialize';

    protected $description = 'Создать события из активных шаблонов на горизонт календаря';

    public function handle(ChurchSettings $settings, MaterializeTemplate $materialize): int
    {
        $today = CarbonImmutable::now($settings->timezone())->startOfDay();
        $created = 0;
        foreach (EventTemplate::query()->where('active', true)->whereNull('archived_at')->whereNotNull('recurrence')
            ->whereDoesntHave('ministry', fn (Builder $query): Builder => $query->whereNotNull('archived_at'))->lazyById() as $template) {
            $created += $materialize->handle($template, $today);
        }
        $this->components->info("Создано событий: {$created}.");

        return self::SUCCESS;
    }
}
