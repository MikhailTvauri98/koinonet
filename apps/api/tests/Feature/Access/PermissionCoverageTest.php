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

    // Whole tokens only: `people.view` is not mentioned by `people.view_contacts`, nor
    // `Permission::RolesManage` by `Permission::RolesManageGlobal`.
    $byCase = '/Permission::'.$permission->name.'(?!\w)/';
    $byValue = '/(?<![\w.])'.preg_quote($permission->value, '/').'(?![\w.])/';

    expect(preg_match($byCase, $corpus) === 1 || preg_match($byValue, $corpus) === 1)
        ->toBeTrue("Для права {$permission->value} нет ни одного теста.");
})->with(Permission::cases());
