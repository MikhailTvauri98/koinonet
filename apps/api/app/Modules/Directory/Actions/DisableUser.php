<?php

declare(strict_types=1);

namespace App\Modules\Directory\Actions;

use App\Modules\Access\AuditLogger;
use App\Modules\Directory\Events\UserDisabled;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use App\Support\DomainRuleException;
use Illuminate\Support\Facades\DB;

final readonly class DisableUser
{
    public function __construct(private AuditLogger $audit) {}

    public function handle(Person $person): User
    {
        $user = DB::transaction(function () use ($person): User {
            $user = User::query()->where('person_id', $person->id)->lockForUpdate()->first();

            if ($user === null) {
                throw DomainRuleException::because('user.no_account', 'У человека нет аккаунта.');
            }

            if (! $user->isDisabled()) {
                $user->forceFill(['disabled_at' => now()])->save();
            }

            DB::table('sessions')->where('user_id', $user->id)->delete();
            $this->audit->record('user.disabled', $user, ['person_id' => $person->id]);

            return $user;
        });

        UserDisabled::dispatch($user->id, $user->person_id);

        return $user;
    }
}
