<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use App\Modules\Media\Models\Media;
use Dedoc\Scramble\Generator;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('keeps write permission separate from reading the mutation response', function (string $operation, bool $canRead) {
    $permission = in_array($operation, ['disable', 'enable'], true) ? Permission::PeopleInvite : Permission::PeopleManage;
    $viewer = actingAsUserWith([$permission, ...($canRead ? [Permission::PeopleView] : [])]);
    $attributes = ['last_name' => 'Иванов', 'first_name' => 'Иван', 'patronymic' => null, 'status' => 'guest'];
    $person = Person::factory()->create([
        ...$attributes, 'phone' => '+79123456789', 'contacts_public' => true, 'note' => 'Скрытая заметка',
        'archived_at' => $operation === 'restore' ? now() : null,
    ]);
    $account = User::factory()->for($person)->create(['disabled_at' => $operation === 'enable' ? now() : null]);
    $media = Media::factory()->create(['uploader_user_id' => $viewer->id, 'kind' => 'image']);
    $this->getJson("/api/v1/people/{$person->id}")->assertStatus($canRead ? 200 : 403);
    $path = "/api/v1/people/{$person->id}";

    $response = match ($operation) {
        'create' => $this->postJson('/api/v1/people', $attributes),
        'empty update' => $this->patchJson($path, []),
        'update' => $this->patchJson($path, ['status' => 'member']),
        'photo' => $this->putJson("{$path}/photo", ['media_id' => $media->id]),
        default => $this->postJson("{$path}/{$operation}"),
    };
    $response->assertStatus($operation === 'create' ? 201 : 200);
    if ($operation === 'create') {
        $response->assertJsonPath('warnings', []);
    }
    $id = $operation === 'create' ? $response->json('data.id') : $person->id;
    if ($canRead) {
        $response->assertJsonPath('data.id', $id)->assertJsonPath('data.full_name', 'Иванов Иван')
            ->assertJsonStructure(['data' => ['status', 'archived', 'has_account', 'user_id', 'photo_url']]);
    } else {
        $response->assertJsonPath('data', ['id' => $id]);
    }

    match ($operation) {
        'create' => expect(Person::findOrFail($id)->last_name)->toBe('Иванов'),
        'update' => expect($person->fresh()->status->value)->toBe('member'),
        'empty update' => expect($person->fresh()->status->value)->toBe('guest'),
        'archive' => expect($person->fresh()->archived_at)->not->toBeNull(),
        'restore' => expect($person->fresh()->archived_at)->toBeNull(),
        'photo' => expect($person->fresh()->photo_media_id)->toBe($media->id),
        'disable' => expect($account->fresh()->disabled_at)->not->toBeNull(),
        'enable' => expect($account->fresh()->disabled_at)->toBeNull(),
    };
})->with(['create', 'empty update', 'update', 'archive', 'restore', 'photo', 'disable', 'enable'])
    ->with(['writer only' => false, 'writer and reader' => true]);

it('keeps the full response for a writers own person without people.view', function () {
    $viewer = actingAsUserWith([Permission::PeopleManage]);
    $this->patchJson("/api/v1/people/{$viewer->person_id}", [])
        ->assertOk()->assertJsonPath('data.id', $viewer->person_id)
        ->assertJsonStructure(['data' => ['full_name', 'status', 'user_id', 'contacts']]);
});

it('documents both mutation responses while preserving creation warnings and the full read schema', function () {
    $schema = app(Generator::class)();
    $endpoints = [
        ['/people', 'post', 201],
        ['/people/{person}', 'patch', 200],
        ['/people/{person}/archive', 'post', 200],
        ['/people/{person}/restore', 'post', 200],
        ['/people/{person}/photo', 'put', 200],
        ['/people/{person}/disable', 'post', 200],
        ['/people/{person}/enable', 'post', 200],
    ];
    foreach ($endpoints as [$path, $method, $status]) {
        $response = $schema['paths'][$path][$method]['responses'][$status]['content']['application/json']['schema'];
        $references = [];
        foreach ($response['anyOf'] ?? [$response] as $variant) {
            expect($variant['required'])->toContain('data');
            $data = $variant['properties']['data'];
            foreach ($data['anyOf'] ?? [$data] as $resource) {
                $references[] = $resource['$ref'];
            }
            if ($status === 201) {
                expect($variant['required'])->toContain('warnings');
                $warnings = $variant['properties']['warnings'];
                expect($warnings['type'])->toBe('array');
                $codes = array_column(array_column($warnings['items']['anyOf'], 'properties'), 'code');
                expect(array_column($codes, 'const'))->toEqualCanonicalizing(['person.duplicate_phone', 'person.duplicate_email']);
            }
        }
        expect($references)->toEqualCanonicalizing(['#/components/schemas/PersonResource', '#/components/schemas/PersonReferenceResource']);
    }
    $reference = $schema['components']['schemas']['PersonReferenceResource'];
    expect($reference['required'])->toBe(['id'])
        ->and(array_keys($reference['properties']))->toBe(['id']);
    $read = $schema['paths']['/people/{person}']['get']['responses'][200]['content']['application/json']['schema'];
    expect($read['properties']['data']['allOf'][0]['$ref'])->toBe('#/components/schemas/PersonResource')
        ->and($read['properties']['data']['allOf'][1]['required'])->toEqualCanonicalizing(['global_roles', 'ministries']);
    $full = $schema['components']['schemas']['PersonResource'];
    expect($full['required'])->toContain('full_name', 'status', 'user_id')
        ->and($full['properties']['user_id']['type'])->toEqualCanonicalizing(['string', 'null']);
});
