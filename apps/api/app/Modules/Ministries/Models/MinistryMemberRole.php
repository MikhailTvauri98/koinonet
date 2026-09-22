<?php

declare(strict_types=1);

namespace App\Modules\Ministries\Models;

use Illuminate\Database\Eloquent\Relations\Pivot;

/**
 * @property string $member_id
 * @property string $role_id
 * @property string $ministry_id
 */
final class MinistryMemberRole extends Pivot
{
    public $incrementing = false;

    public $timestamps = false;

    protected $table = 'ministry_member_roles';

    protected $guarded = [];
}
