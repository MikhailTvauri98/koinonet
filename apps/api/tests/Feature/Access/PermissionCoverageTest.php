<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use Symfony\Component\Finder\Finder;

it('has an authorization test mentioning every permission key', function (Permission $permission) {
    $files = Finder::create()->files()->in(base_path('tests'))->name('*.php')
        ->notName('PermissionCoverageTest.php');

    $corpus = '';
    foreach ($files as $file) {
        $corpus .= $file->getContents();
    }

    expect(str_contains($corpus, 'Permission::'.$permission->name) || str_contains($corpus, $permission->value))
        ->toBeTrue("Для права {$permission->value} нет ни одного теста.");
})->with(Permission::cases());
