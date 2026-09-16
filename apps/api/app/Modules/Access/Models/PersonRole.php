<?php

declare(strict_types=1);

namespace App\Modules\Access\Models;

use Illuminate\Database\Eloquent\Model;

final class PersonRole extends Model
{
    protected $table = 'person_roles';

    protected $guarded = [];

    public $incrementing = false;

    public $timestamps = false;
}
