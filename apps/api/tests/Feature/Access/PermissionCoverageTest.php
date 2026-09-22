<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use Symfony\Component\Finder\Finder;

it('has an authorization test mentioning every permission key', function (Permission $permission) {
    // PermissionCatalogTest snapshots every key's value as literal data, not behavior — a new
    // key would "pass" there just by being added to the snapshot array, without a single
    // forbidden/allowed test. Excluded so this guard can't be satisfied for free.
    $files = Finder::create()->files()->in(base_path('tests'))->name('*.php')
        ->notName('PermissionCoverageTest.php')
        ->notName('PermissionCatalogTest.php');

    $corpus = '';
    foreach ($files as $file) {
        $corpus .= $file->getContents();
    }

    expect(str_contains($corpus, 'Permission::'.$permission->name) || str_contains($corpus, $permission->value))
        ->toBeTrue("Для права {$permission->value} нет ни одного теста.");
})->with(Permission::cases());
