<?php

declare(strict_types=1);

namespace App\Modules\Access\Models;

use Illuminate\Database\Eloquent\Model;

/** @property string $permission */
final class RolePermission extends Model
{
    protected $table = 'role_permissions';

    protected $guarded = [];

    public $incrementing = false;

    public $timestamps = false;
}
