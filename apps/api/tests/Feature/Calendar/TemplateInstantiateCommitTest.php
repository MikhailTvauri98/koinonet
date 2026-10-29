<?php

declare(strict_types=1);

use App\Modules\Calendar\Actions\CreateEventFromTemplate;
use App\Modules\Calendar\Events\EventCreated;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Calendar\Models\EventTemplate;
use App\Modules\Calendar\Models\EventTemplateSlot;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event as EventBus;

uses(DatabaseMigrations::class);

it('publishes creation with none only after outer commit and rolls back the entire snapshot', function () {
    $template = EventTemplate::factory()->create();
    EventTemplateSlot::factory()->create(['template_id' => $template->id]);
    $delivered = [];
    EventBus::listen(EventCreated::class, function (EventCreated $created) use (&$delivered): void {
        $delivered[] = [DB::transactionLevel(), $created->eventId, $created->notify, EventSlot::query()->count()];
    });
    try {
        DB::transaction(function () use ($template, &$delivered): void {
            app(CreateEventFromTemplate::class)->handle($template, CarbonImmutable::parse('2026-11-08'), null);
            expect($delivered)->toBe([]);
            throw new RuntimeException('Outer rollback');
        });
    } catch (RuntimeException $exception) {
        expect($exception->getMessage())->toBe('Outer rollback');
    }
    expect($delivered)->toBe([])->and(Event::query()->count())->toBe(0)->and(EventSlot::query()->count())->toBe(0);
    $event = DB::transaction(function () use ($template, &$delivered): Event {
        $event = app(CreateEventFromTemplate::class)->handle($template, CarbonImmutable::parse('2026-11-08'), null);
        expect($delivered)->toBe([]);

        return $event;
    });
    expect($delivered)->toBe([[0, $event->id, 'none', 1]]);
});
