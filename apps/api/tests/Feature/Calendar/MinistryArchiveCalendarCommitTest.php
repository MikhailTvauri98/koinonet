<?php

declare(strict_types=1);

use App\Modules\Access\Models\AuditEntry;
use App\Modules\Calendar\Events\EventCancelled;
use App\Modules\Calendar\Listeners\OnMinistryArchived;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventTemplate;
use App\Modules\Ministries\Events\MinistryArchived;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event as EventBus;

uses(DatabaseMigrations::class);

it('preserves after commit cancellation delivery and discards it on outer rollback', function () {
    $ministry = ministryWithRoles();
    $event = Event::factory()->ministry($ministry)->create();
    $template = EventTemplate::factory()->ministry($ministry)->create();
    $delivered = [];
    EventBus::listen(EventCancelled::class, function (EventCancelled $cancelled) use (&$delivered): void {
        $delivered[] = [DB::transactionLevel(), $cancelled->eventId, $cancelled->reason];
    });
    try {
        DB::transaction(function () use ($ministry, &$delivered): void {
            app(OnMinistryArchived::class)->handle(new MinistryArchived($ministry->id));
            expect($delivered)->toBe([]);
            throw new RuntimeException('Outer rollback');
        });
    } catch (RuntimeException $exception) {
        expect($exception->getMessage())->toBe('Outer rollback');
    }
    expect($delivered)->toBe([])->and($event->refresh()->isCancelled())->toBeFalse()
        ->and($template->refresh()->active)->toBeTrue()
        ->and(AuditEntry::query()->where('action', 'event.cancelled')->count())->toBe(0);

    app(OnMinistryArchived::class)->handle(new MinistryArchived($ministry->id));

    expect($delivered)->toBe([[0, $event->id, 'Служение архивировано']])
        ->and($event->refresh()->isCancelled())->toBeTrue()->and($template->refresh()->active)->toBeFalse()
        ->and(AuditEntry::query()->where('action', 'event.cancelled')->count())->toBe(1);
});
