<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use App\Modules\Access\PermissionScope;

it('contains the implemented permission keys', function () {
    expect(array_column(Permission::cases(), 'value'))->toBe([
        'chat.moderate',
        'chats.moderate_all',
        'people.view',
        'people.view_contacts',
        'people.view_notes',
        'people.manage',
        'people.invite',
        'ministries.create',
        'ministries.view_all',
        'ministries.manage_all',
        'roles.manage_global',
        'settings.manage',
        'audit.view',
        'announcements.church.publish',
        'calendar.church.manage',
        'members.manage',
        'members.view_contacts',
        'roles.manage',
        'ministry.edit',
        'announcements.publish',
        'events.manage',
        'slots.assign',
    ]);
});

it('supports global and ministry permission scopes', function () {
    expect(array_column(PermissionScope::cases(), 'value'))->toBe(['global', 'ministry']);
});

it('gives every permission a scope, a label and a description', function (Permission $permission) {
    expect($permission->label())->not->toBe('')
        ->and($permission->description())->not->toBe('')
        ->and($permission->scope())->toBeInstanceOf(PermissionScope::class);
})->with(Permission::cases());

it('keeps permission keys under 64 characters', function (Permission $permission) {
    expect(strlen($permission->value))->toBeLessThanOrEqual(64);
})->with(Permission::cases());

it('exposes both scopes', function () {
    expect(Permission::ofScope(PermissionScope::Global))->not->toBeEmpty()
        ->and(Permission::ofScope(PermissionScope::Ministry))->not->toBeEmpty();
});
