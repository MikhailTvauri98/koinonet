<?php

declare(strict_types=1);

use App\Modules\Access\Models\AuditEntry;
use App\Modules\Access\Permission;
use App\Modules\Calendar\Events\EventCancelled;
use App\Modules\Calendar\Listeners\OnMinistryArchived;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventAssignment;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Calendar\Models\EventTemplate;
use App\Modules\Calendar\Models\EventTemplateSlot;
use App\Modules\Ministries\Events\MinistryArchived;
use App\Support\DomainRuleException;
use Carbon\CarbonImmutable;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Events\CallQueuedListener;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Queue\Jobs\SyncJob;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event as EventBus;
use Illuminate\Support\Facades\Queue;

uses(RefreshDatabase::class);

it('cancels only unarchived unfinished scheduled ministry events through the archive endpoint', function () {
    $this->travelTo(CarbonImmutable::now()->startOfSecond());
    EventBus::fake([EventCancelled::class]);
    $ministry = ministryWithRoles();
    $other = ministryWithRoles('Молодёжное');
    $future = Event::factory()->ministry($ministry)->create();
    $ongoing = Event::factory()->ministry($ministry)->between(CarbonImmutable::now()->subHour(), CarbonImmutable::now()->addHour())->create();
    $ended = Event::factory()->ministry($ministry)->between(CarbonImmutable::now()->subHour(), CarbonImmutable::now())->create();
    $past = Event::factory()->ministry($ministry)->between(CarbonImmutable::now()->subDays(3), CarbonImmutable::now()->subDays(3)->addHour())->create();
    $archived = Event::factory()->ministry($ministry)->create(['archived_at' => now()]);
    $cancelled = Event::factory()->ministry($ministry)->cancelled()->create(['cancel_reason' => 'Погода']);
    $foreign = Event::factory()->ministry($other)->create();
    $church = Event::factory()->create();
    $unchanged = collect([$ended, $past, $archived, $cancelled, $foreign, $church])->mapWithKeys(fn (Event $event) => [$event->id => $event->refresh()->getAttributes()]);
    $template = EventTemplate::factory()->ministry($ministry)->weekly(7)->create();
    $inactive = EventTemplate::factory()->ministry($ministry)->inactive()->create();
    $archivedTemplate = EventTemplate::factory()->ministry($ministry)->inactive()->archived()->create();
    $foreignTemplate = EventTemplate::factory()->ministry($other)->weekly(7)->create();
    $churchTemplate = EventTemplate::factory()->weekly(7)->create();
    $slot = EventSlot::factory()->for($future)->create();
    $assignment = EventAssignment::factory()->for($slot)->create();
    $templateSlot = EventTemplateSlot::factory()->create(['template_id' => $template->id]);
    $history = [$slot->refresh()->getAttributes(), $assignment->refresh()->getAttributes(), $templateSlot->refresh()->getAttributes(), $inactive->refresh()->getAttributes(), $archivedTemplate->refresh()->getAttributes()];
    $actor = actingAsUserWith([Permission::MinistriesCreate]);

    $this->postJson("/api/v1/ministries/{$ministry->id}/archive")->assertOk();

    foreach ([$future, $ongoing] as $event) {
        expect($event->refresh()->isCancelled())->toBeTrue()
            ->and($event->cancel_reason)->toBe('Служение архивировано')
            ->and($event->cancelled_at)->not->toBeNull();
        $entry = AuditEntry::query()->where('action', 'event.cancelled')->where('subject_id', $event->id)->sole();
        expect($entry->actor_user_id)->toBeNull()->and($entry->payload)->toBe(['reason' => 'Служение архивировано']);
    }
    foreach ([$ended, $past, $archived, $cancelled, $foreign, $church] as $event) {
        expect($event->refresh()->getAttributes())->toBe($unchanged[$event->id]);
    }
    expect($template->refresh()->active)->toBeFalse()
        ->and($foreignTemplate->refresh()->active)->toBeTrue()->and($churchTemplate->refresh()->active)->toBeTrue()
        ->and([$slot->refresh()->getAttributes(), $assignment->refresh()->getAttributes(), $templateSlot->refresh()->getAttributes(), $inactive->refresh()->getAttributes(), $archivedTemplate->refresh()->getAttributes()])->toBe($history)
        ->and(AuditEntry::query()->where('action', 'ministry.archived')->sole()->actor_user_id)->toBe($actor->id);
    EventBus::assertDispatchedTimes(EventCancelled::class, 2);
});

it('queues the registered listener and tolerates repeated deliveries without another cancellation', function () {
    EventBus::fake([EventCancelled::class]);
    Queue::fake();
    $ministry = ministryWithRoles();
    $event = Event::factory()->ministry($ministry)->create();
    $template = EventTemplate::factory()->ministry($ministry)->create();
    actingAsUserWith([Permission::MinistriesCreate]);

    $this->postJson("/api/v1/ministries/{$ministry->id}/archive")->assertOk();

    expect($event->refresh()->isCancelled())->toBeFalse()->and($template->refresh()->active)->toBeTrue();
    Queue::assertPushed(CallQueuedListener::class, fn (CallQueuedListener $job) => $job->class === OnMinistryArchived::class);
    $job = Queue::pushed(CallQueuedListener::class, fn (CallQueuedListener $job) => $job->class === OnMinistryArchived::class)->sole();
    $job = unserialize(serialize($job));
    $job->setJob(new SyncJob(app(), '{}', 'sync', 'default'));
    $job->handle(app());
    $cancelled = $event->refresh()->getAttributes();
    $deactivated = $template->refresh()->getAttributes();
    $job->handle(app());

    expect($event->refresh()->isCancelled())->toBeTrue()->and($event->getAttributes())->toBe($cancelled)
        ->and($template->refresh()->active)->toBeFalse()->and($template->getAttributes())->toBe($deactivated)
        ->and(AuditEntry::query()->where('action', 'event.cancelled')->sole()->actor_user_id)->toBeNull();
    EventBus::assertDispatchedTimes(EventCancelled::class, 1);
});

it('rechecks event eligibility after acquiring the event lock', function (string $change) {
    $this->travelTo(CarbonImmutable::now()->startOfSecond());
    EventBus::fake([EventCancelled::class]);
    $ministry = ministryWithRoles();
    $event = Event::factory()->ministry($ministry)->create();
    $changed = false;
    $attributes = match ($change) {
        'ended' => ['starts_at' => now()->subHour(), 'ends_at' => now()],
        'archived' => ['archived_at' => now()],
        'cancelled' => ['status' => 'cancelled', 'cancelled_at' => now(), 'cancel_reason' => 'Погода'],
    };
    DB::connection()->beforeExecuting(function (string $sql) use (&$changed, $event, $attributes): void {
        if (! $changed && str_contains($sql, 'from "events"') && str_contains($sql, 'for update')) {
            $changed = true;
            // Simulate a committed change between candidate selection and the locked reread.
            DB::table('events')->where('id', $event->id)->update($attributes);
        }
    });

    app(OnMinistryArchived::class)->handle(new MinistryArchived($ministry->id));

    expect($changed)->toBeTrue()->and(AuditEntry::query()->where('action', 'event.cancelled')->count())->toBe(0);
    foreach ($attributes as $attribute => $value) {
        $event->refresh();
        if ($value instanceof DateTimeInterface) {
            expect($event->getAttribute($attribute)->equalTo($value))->toBeTrue();
        } else {
            expect($event->getRawOriginal($attribute))->toBe($value);
        }
    }
    EventBus::assertNotDispatched(EventCancelled::class);
})->with(['ended', 'archived', 'cancelled']);

it('locks the parent template in a transaction before deactivating it', function () {
    $ministry = ministryWithRoles();
    $template = EventTemplate::factory()->ministry($ministry)->create();
    $locked = [];
    $writes = [];
    DB::listen(function (QueryExecuted $query) use (&$locked, &$writes): void {
        if (str_contains($query->sql, 'from "event_templates"') && str_contains($query->sql, 'for update')) {
            expect(DB::transactionLevel())->toBeGreaterThan(0);
            $locked = array_merge($locked, $query->bindings);
        }
        if (str_starts_with($query->sql, 'update "event_templates"')) {
            $writes[] = $locked;
        }
    });

    app(OnMinistryArchived::class)->handle(new MinistryArchived($ministry->id));

    expect($template->refresh()->active)->toBeFalse()->and($writes)->toHaveCount(1)
        ->and($writes[0])->toContain($template->id);
});

it('propagates unrelated cancellation failures so the queue can retry', function () {
    $ministry = ministryWithRoles();
    Event::factory()->ministry($ministry)->create();
    DB::connection()->beforeExecuting(function (string $sql): void {
        if (str_contains($sql, 'from "events"') && str_contains($sql, 'for update')) {
            throw DomainRuleException::because('event.unrelated', 'Другая ошибка отмены');
        }
    });

    expect(fn () => app(OnMinistryArchived::class)->handle(new MinistryArchived($ministry->id)))
        ->toThrow(DomainRuleException::class, 'Другая ошибка отмены');
});
