<?php

declare(strict_types=1);

use App\Modules\Calendar\Actions\MaterializeTemplate;
use App\Modules\Calendar\Events\EventCreated;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Calendar\Models\EventTemplate;
use App\Modules\Calendar\Models\EventTemplateSlot;
use App\Modules\Settings\ChurchSettings;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event as EventBus;

uses(DatabaseMigrations::class);

it('commits the whole materialization and watermark before publishing none and rolls everything back on failure', function () {
    app(ChurchSettings::class)->put(['calendar.horizon_weeks' => 1]);
    $template = EventTemplate::factory()->weekly(7)->create();
    EventTemplateSlot::factory()->create(['template_id' => $template->id]);
    $today = CarbonImmutable::parse('2026-11-02');
    $delivered = [];
    EventBus::listen(EventCreated::class, function (EventCreated $created) use (&$delivered, $template): void {
        $delivered[] = [DB::transactionLevel(), $created->notify, EventSlot::query()->count(), $template->fresh()->generated_until->toDateString()];
    });
    try {
        DB::transaction(function () use ($template, $today, &$delivered): void {
            expect(app(MaterializeTemplate::class)->handle($template, $today))->toBe(1)->and($delivered)->toBe([]);
            throw new RuntimeException('Outer rollback');
        });
    } catch (RuntimeException $exception) {
        expect($exception->getMessage())->toBe('Outer rollback');
    }
    expect($delivered)->toBe([])->and(Event::query()->count())->toBe(0)->and(EventSlot::query()->count())->toBe(0)
        ->and($template->fresh()->generated_until)->toBeNull();
    expect(app(MaterializeTemplate::class)->handle($template, $today))->toBe(1)
        ->and($delivered)->toBe([[0, 'none', 1, '2026-11-09']]);
});
