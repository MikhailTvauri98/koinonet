<?php

declare(strict_types=1);

use App\Modules\Access\Models\AuditEntry;
use App\Modules\Calendar\Actions\CancelEvent;
use App\Modules\Calendar\Events\EventCancelled;
use App\Modules\Calendar\Models\Event;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event as EventBus;

uses(DatabaseMigrations::class);

it('delivers cancellation once after the outer commit and discards event and journal on rollback', function () {
    $event = Event::factory()->create();
    $delivered = [];
    EventBus::listen(EventCancelled::class, function (EventCancelled $cancelled) use (&$delivered): void {
        $delivered[] = [DB::transactionLevel(), $cancelled->eventId, $cancelled->reason];
    });
    try {
        DB::transaction(function () use ($event, &$delivered): void {
            app(CancelEvent::class)->handle($event, 'Погода', null);
            expect($delivered)->toBe([]);
            throw new RuntimeException('Outer rollback');
        });
    } catch (RuntimeException $exception) {
        expect($exception->getMessage())->toBe('Outer rollback');
    }
    expect($delivered)->toBe([])->and($event->refresh()->isCancelled())->toBeFalse()
        ->and(AuditEntry::query()->where('action', 'event.cancelled')->count())->toBe(0);
    DB::transaction(function () use ($event, &$delivered): void {
        app(CancelEvent::class)->handle($event, 'Погода', null);
        expect($delivered)->toBe([]);
    });
    expect($delivered)->toBe([[0, $event->id, 'Погода']])
        ->and(AuditEntry::query()->where('action', 'event.cancelled')->count())->toBe(1);
});
