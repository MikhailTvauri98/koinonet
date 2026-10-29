<?php

declare(strict_types=1);

use App\Modules\Calendar\Actions\RemoveSlot;
use App\Modules\Calendar\Events\AssignmentRemoved;
use App\Modules\Calendar\Models\EventAssignment;
use App\Modules\Calendar\Models\EventSlot;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;

uses(DatabaseMigrations::class);

it('delivers slot removal after the outer commit and discards it on rollback', function () {
    $slot = EventSlot::factory()->create();
    $assignment = EventAssignment::factory()->for($slot)->create();
    $delivered = [];
    Event::listen(AssignmentRemoved::class, function (AssignmentRemoved $event) use (&$delivered): void {
        $delivered[] = [DB::transactionLevel(), $event->personId, $event->actorUserId];
    });
    try {
        DB::transaction(function () use ($slot, &$delivered): void {
            app(RemoveSlot::class)->handle($slot);
            expect($delivered)->toBe([]);
            throw new RuntimeException('Outer rollback');
        });
    } catch (RuntimeException $exception) {
        expect($exception->getMessage())->toBe('Outer rollback');
    }
    expect($delivered)->toBe([])->and($slot->refresh()->archived_at)->toBeNull()->and($assignment->refresh()->archived_at)->toBeNull();
    DB::transaction(function () use ($slot, &$delivered): void {
        app(RemoveSlot::class)->handle($slot);
        expect($delivered)->toBe([]);
    });
    expect($delivered)->toBe([[0, $assignment->person_id, null]]);
});
