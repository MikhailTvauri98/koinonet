<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use App\Modules\Calendar\Actions\CreateEventFromTemplate;
use App\Modules\Calendar\Actions\ReplaceTemplateSlots;
use App\Modules\Calendar\Actions\UpdateTemplate;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventTemplate;
use App\Modules\Calendar\Models\EventTemplateSlot;
use App\Modules\Settings\ChurchSettings;
use App\Support\DomainRuleException;
use Carbon\CarbonImmutable;
use Dedoc\Scramble\Generator;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('copies live template fields and slots into an independent event with exact UTC times', function () {
    $this->travelTo(CarbonImmutable::parse('2026-10-30T12:34:56.123456Z'));
    app(ChurchSettings::class)->put(['church.timezone' => 'Europe/Moscow']);
    $creator = actingAsUserWith([Permission::CalendarChurchManage]);
    $ministry = ministryWithRoles();
    $template = EventTemplate::factory()->create([
        'title' => 'Воскресное служение', 'description' => 'Описание', 'location' => 'Зал',
        'visibility' => 'assigned', 'start_time' => '10:00', 'duration_minutes' => 120,
    ]);
    $roleSlot = EventTemplateSlot::factory()->withRole($ministry->defaultRole)->create([
        'template_id' => $template->id, 'label' => 'Встречающие', 'required_count' => 2, 'sort_order' => 4,
    ]);
    $freeSlot = EventTemplateSlot::factory()->create(['template_id' => $template->id, 'label' => 'Звук', 'sort_order' => 7]);
    EventTemplateSlot::factory()->create(['template_id' => $template->id, 'archived_at' => now()]);

    $response = $this->postJson("/api/v1/templates/{$template->id}/create-event", ['date' => '2026-11-08'])
        ->assertCreated()->assertJsonPath('data.title', 'Воскресное служение')
        ->assertJsonPath('data.owner_type', 'church')->assertJsonPath('data.ministry', null)
        ->assertJsonPath('data.description', 'Описание')->assertJsonPath('data.location', 'Зал')
        ->assertJsonPath('data.visibility', 'assigned')->assertJsonPath('data.status', 'scheduled')
        ->assertJsonPath('data.template_id', $template->id)->assertJsonPath('data.occurrence_date', '2026-11-08')
        ->assertJsonPath('data.starts_at', '2026-11-08T07:00:00.000000Z')
        ->assertJsonPath('data.ends_at', '2026-11-08T09:00:00.000000Z')
        ->assertJsonCount(2, 'data.slots')->assertJsonPath('data.slots.0.label', 'Встречающие')
        ->assertJsonPath('data.slots.0.role.id', $ministry->default_role_id)
        ->assertJsonPath('data.slots.0.required_count', 2)->assertJsonPath('data.slots.0.sort_order', 4)
        ->assertJsonPath('data.slots.1.label', 'Звук')->assertJsonPath('data.slots.1.sort_order', 7)
        ->assertJsonPath('data.slots.1.role', null)->assertJsonCount(0, 'data.slots.0.assignments')
        ->assertJsonCount(0, 'data.slots.1.assignments')->assertJsonCount(0, 'data.attachments');
    $event = Event::query()->findOrFail($response->json('data.id'));
    expect($event->created_by_user_id)->toBe($creator->id)
        ->and($event->slots()->pluck('id')->all())->not->toContain($roleSlot->id, $freeSlot->id);
    app(UpdateTemplate::class)->handle($template, ['title' => 'Переименовано', 'location' => 'Другой зал']);
    app(ReplaceTemplateSlots::class)->handle($template, [['label' => 'Новый слот', 'required_count' => 3]]);
    expect($event->refresh()->title)->toBe('Воскресное служение')->and($event->location)->toBe('Зал')
        ->and($event->slots()->pluck('label')->all())->toBe(['Встречающие', 'Звук']);
});

it('rejects a duplicate occurrence including cancelled and archived events without modifying it', function (array $attributes) {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $template = EventTemplate::factory()->create();
    $id = $this->postJson("/api/v1/templates/{$template->id}/create-event", ['date' => '2026-11-08'])->assertCreated()->json('data.id');
    $existing = Event::query()->findOrFail($id);
    $existing->update($attributes);
    $before = $existing->fresh()->getAttributes();
    $this->postJson("/api/v1/templates/{$template->id}/create-event", ['date' => '2026-11-08'])
        ->assertUnprocessable()->assertJsonPath('code', 'event.occurrence_exists');
    expect(Event::query()->count())->toBe(1)->and($existing->fresh()->getAttributes())->toBe($before);
})->with([[[]], [['status' => 'cancelled', 'cancelled_at' => '2026-11-01T00:00:00Z']], [['archived_at' => '2026-11-01T00:00:00Z']]]);

it('allows different occurrence dates and inactive templates without recurrence', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $template = EventTemplate::factory()->inactive()->create(['recurrence' => null]);
    foreach (['2026-12-24', '2026-12-25'] as $date) {
        $this->postJson("/api/v1/templates/{$template->id}/create-event", ['date' => $date])->assertCreated()->assertJsonPath('data.occurrence_date', $date);
    }
    expect($template->refresh()->generated_until)->toBeNull()->and($template->active)->toBeFalse();
});

it('rejects archived templates', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $template = EventTemplate::factory()->archived()->create();
    $this->postJson("/api/v1/templates/{$template->id}/create-event", ['date' => '2026-11-08'])
        ->assertUnprocessable()->assertJsonPath('code', 'template.archived');
    expect(Event::query()->count())->toBe(0);
});

it('requires management permission rather than visibility', function () {
    actingAsUser();
    $template = EventTemplate::factory()->create();
    $this->postJson("/api/v1/templates/{$template->id}/create-event", ['date' => '2026-11-08'])->assertForbidden();
});

it('allows ministry managers only their ministry and copies the ministry owner', function () {
    $ministry = ministryWithRoles();
    $other = ministryWithRoles('Молодёжное');
    $actor = actingAsUser();
    memberOf($ministry, $actor->person, [$ministry->roles()->where('name', 'Лидер')->sole()->id]);
    $own = EventTemplate::factory()->ministry($ministry)->create();
    $foreign = EventTemplate::factory()->ministry($other)->create();
    $church = EventTemplate::factory()->create();
    $this->postJson("/api/v1/templates/{$own->id}/create-event", ['date' => '2026-11-08'])
        ->assertCreated()->assertJsonPath('data.owner_type', 'ministry')
        ->assertJsonPath('data.ministry.id', $ministry->id)->assertJsonPath('data.visibility', 'ministry');
    foreach ([$foreign, $church] as $template) {
        $this->postJson("/api/v1/templates/{$template->id}/create-event", ['date' => '2026-11-08'])->assertForbidden();
    }
});

it('rejects manual creation for an archived ministry even for its global manager', function () {
    actingAsUserWith([Permission::MinistriesManageAll]);
    $ministry = ministryWithRoles();
    $template = EventTemplate::factory()->ministry($ministry)->inactive()->create();
    $ministry->update(['archived_at' => now()]);
    $this->postJson("/api/v1/templates/{$template->id}/create-event", ['date' => '2026-11-08'])
        ->assertUnprocessable()->assertJsonPath('code', 'ministry.archived');
    expect(Event::query()->count())->toBe(0);
});

it('rejects archived ministry ownership in the reusable action', function () {
    $ministry = ministryWithRoles();
    $template = EventTemplate::factory()->ministry($ministry)->inactive()->create();
    $ministry->update(['archived_at' => now()]);
    expect(fn () => app(CreateEventFromTemplate::class)->handle($template, CarbonImmutable::parse('2026-11-08'), null))
        ->toThrow(fn (DomainRuleException $exception) => expect($exception->ruleCode)->toBe('ministry.archived'));
    expect(Event::query()->count())->toBe(0);
});

it('validates an exact calendar date', function (mixed $date) {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $template = EventTemplate::factory()->create();
    $this->postJson("/api/v1/templates/{$template->id}/create-event", ['date' => $date])
        ->assertUnprocessable()->assertJsonValidationErrors('date');
})->with([[null], [''], ['2026-02-30'], ['2026-2-03'], ['2026-11-08T00:00:00Z'], [['2026-11-08']]]);

it('reloads stale template fields and slots and uses a nullable explicit creator', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    app(ChurchSettings::class)->put(['church.timezone' => 'Pacific/Auckland']);
    $template = EventTemplate::factory()->create(['title' => 'До правки']);
    EventTemplateSlot::factory()->create(['template_id' => $template->id, 'label' => 'Старый']);
    $template->load('slots');
    app(UpdateTemplate::class)->handle($template, ['title' => 'После правки', 'start_time' => '00:15', 'duration_minutes' => 30]);
    app(ReplaceTemplateSlots::class)->handle($template, [['label' => 'Новый', 'required_count' => 2]]);
    $event = app(CreateEventFromTemplate::class)->handle($template, CarbonImmutable::parse('2026-12-24', 'Pacific/Auckland'), null);
    expect($event->title)->toBe('После правки')->and($event->created_by_user_id)->toBeNull()
        ->and($event->occurrence_date->toDateString())->toBe('2026-12-24')
        ->and($event->starts_at->toISOString())->toBe('2026-12-23T11:15:00.000000Z')
        ->and($event->ends_at->toISOString())->toBe('2026-12-23T11:45:00.000000Z')
        ->and($event->slots()->pluck('label')->all())->toBe(['Новый']);
});

it('rejects a stale action reference after template archiving', function () {
    $template = EventTemplate::factory()->create();
    EventTemplate::query()->whereKey($template->id)->update(['archived_at' => now()]);
    expect(fn () => app(CreateEventFromTemplate::class)->handle($template, CarbonImmutable::parse('2026-11-08'), null))
        ->toThrow(DomainRuleException::class, 'Шаблон архивирован.');
    expect(Event::query()->count())->toBe(0);
});

it('documents the chosen date input and created EventResource with domain errors', function () {
    $schema = app(Generator::class)();
    $operation = $schema['paths']['/templates/{template}/create-event']['post'];
    expect($operation['requestBody']['content']['application/json']['schema']['$ref'])->toBe('#/components/schemas/CreateEventFromTemplateRequest')
        ->and($schema['components']['schemas']['CreateEventFromTemplateRequest']['required'])->toBe(['date'])
        ->and($schema['components']['schemas']['CreateEventFromTemplateRequest']['properties']['date']['format'])->toBe('date')
        ->and($operation['responses']['201']['content']['application/json']['schema']['properties']['data']['$ref'])->toBe('#/components/schemas/EventResource')
        ->and($operation['responses']['422']['content']['application/json']['schema']['properties']['code']['enum'])->toBe(['event.occurrence_exists', 'template.archived', 'ministry.archived']);
});
