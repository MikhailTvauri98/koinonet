<?php

declare(strict_types=1);

use App\Modules\Access\AuditLogger;
use App\Modules\Access\Models\AuditEntry;
use App\Modules\Access\Permission;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

it('records the actor, request ip, subject and payload', function () {
    $user = actingAsUser();
    $subject = Person::factory()->create();
    request()->server->set('REMOTE_ADDR', '203.0.113.10');

    app(AuditLogger::class)->record('person.archived', $subject, [
        'before' => null,
        'after' => 'archived',
    ]);

    $entry = AuditEntry::query()->sole();

    expect($entry->actor_user_id)->toBe($user->id)
        ->and($entry->action)->toBe('person.archived')
        ->and($entry->subject_id)->toBe($subject->id)
        ->and($entry->subject_type)->toBe('person')
        ->and($entry->payload['after'])->toBe('archived')
        ->and($entry->ip)->toBe('203.0.113.10');
});

it('records a console action without an actor', function () {
    app(AuditLogger::class)->record('settings.changed');

    expect(AuditEntry::query()->sole()->actor_user_id)->toBeNull();
});

it('denies the journal without audit view', function () {
    actingAsUser();

    $this->getJson('/api/v1/audit')->assertForbidden();
});

it('shows the journal with audit view', function () {
    actingAsUserWith([Permission::AuditView]);
    AuditEntry::factory()->count(3)->create();

    $this->getJson('/api/v1/audit')
        ->assertOk()
        ->assertJsonCount(3, 'data')
        ->assertJsonStructure([
            'data' => [[
                'id',
                'action',
                'actor',
                'subject_type',
                'subject_id',
                'payload',
                'ip',
                'created_at',
            ]],
            'next_cursor',
        ]);
});

it('filters the journal by action', function () {
    actingAsUserWith([Permission::AuditView]);
    AuditEntry::factory()->create(['action' => 'role.created']);
    AuditEntry::factory()->create(['action' => 'person.archived']);

    $this->getJson('/api/v1/audit?action=role.created')
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.action', 'role.created');
});

it('filters the journal by actor', function () {
    actingAsUserWith([Permission::AuditView]);
    $actor = User::factory()->create();
    AuditEntry::factory()->create(['actor_user_id' => $actor->id]);
    AuditEntry::factory()->create(['actor_user_id' => User::factory()->create()->id]);

    $this->getJson('/api/v1/audit?actor='.$actor->id)
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.actor.id', $actor->id);
});

it('filters the journal by subject', function () {
    actingAsUserWith([Permission::AuditView]);
    $subjectId = (string) Str::ulid();
    AuditEntry::factory()->create([
        'subject_type' => 'person',
        'subject_id' => $subjectId,
    ]);
    AuditEntry::factory()->create([
        'subject_type' => 'role',
        'subject_id' => $subjectId,
    ]);

    $this->getJson('/api/v1/audit?subject_type=person&subject_id='.$subjectId)
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.subject_type', 'person')
        ->assertJsonPath('data.0.subject_id', $subjectId);
});

it('filters the journal by period', function () {
    actingAsUserWith([Permission::AuditView]);
    AuditEntry::factory()->create(['created_at' => Carbon::parse('2026-09-10T12:00:00Z')]);
    AuditEntry::factory()->create(['created_at' => Carbon::parse('2026-09-12T12:00:00Z')]);
    AuditEntry::factory()->create(['created_at' => Carbon::parse('2026-09-14T12:00:00Z')]);

    $query = http_build_query([
        'from' => '2026-09-12T00:00:00Z',
        'to' => '2026-09-13T23:59:59Z',
    ]);

    $this->getJson('/api/v1/audit?'.$query)
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.created_at', '2026-09-12T12:00:00.000000Z');
});

it('paginates the journal with a cursor', function () {
    actingAsUserWith([Permission::AuditView]);
    AuditEntry::factory()->count(51)->create();

    $first = $this->getJson('/api/v1/audit')
        ->assertOk()
        ->assertJsonCount(50, 'data');

    $cursor = $first->json('next_cursor');
    expect($cursor)->toBeString()->not->toBeEmpty();

    $this->getJson('/api/v1/audit?cursor='.urlencode($cursor))
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('next_cursor', null);
});
