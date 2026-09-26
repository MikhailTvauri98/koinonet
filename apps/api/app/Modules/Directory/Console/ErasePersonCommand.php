<?php

declare(strict_types=1);

namespace App\Modules\Directory\Console;

use App\Modules\Access\AuditLogger;
use App\Modules\Directory\Contracts\AccountEraser;
use App\Modules\Directory\Events\PersonErased;
use App\Modules\Directory\Models\AccessLink;
use App\Modules\Directory\Models\Person;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

final class ErasePersonCommand extends Command
{
    protected $signature = 'people:erase {id : Идентификатор человека} {--force : Не спрашивать подтверждения}';

    protected $description = 'Обезличить человека по его просьбе: ФИО, контакты, заметка, фото и аккаунт стираются, история остаётся';

    public function handle(AuditLogger $audit): int
    {
        $person = Person::query()->find((string) $this->argument('id'));

        if ($person === null) {
            $this->components->error('Человек не найден.');

            return self::FAILURE;
        }

        $this->components->warn("Будут стёрты данные: {$person->fullName()}.");

        if ($this->option('force') !== true && ! $this->confirm('Стереть персональные данные безвозвратно?')) {
            $this->components->warn('Стирание отменено.');

            return self::FAILURE;
        }

        $userId = DB::transaction(function () use ($person, $audit): ?string {
            $user = $person->user()->lockForUpdate()->first();
            $userId = $user?->id;

            // The photo leaves the card first, so that Media's eraser below
            // already sees it as unused.
            $person->forceFill([
                'last_name' => 'Удалённый человек',
                'first_name' => '',
                'patronymic' => null,
                'phone' => null,
                'email' => null,
                'birth_date' => null,
                'note' => null,
                'photo_media_id' => null,
                'contacts_public' => false,
                'archived_at' => $person->archived_at ?? now(),
            ])->save();

            if ($user !== null) {
                DB::table('sessions')->where('user_id', $user->id)->delete();
                AccessLink::query()
                    ->where('created_by_user_id', $user->id)
                    ->update(['created_by_user_id' => null]);

                /** @var iterable<AccountEraser> $erasers */
                $erasers = app()->tagged('directory.account_erasers');

                foreach ($erasers as $eraser) {
                    $eraser->eraseAccount($user->id);
                }

                $user->delete();
            }

            AccessLink::query()->where('person_id', $person->id)->delete();

            $audit->record('person.erased', $person, ['user_erased' => $userId !== null]);

            return $userId;
        });

        PersonErased::dispatch($person->id, $userId);

        $this->components->info('Персональные данные стёрты. Освободившиеся файлы удалит ежедневная очистка.');

        return self::SUCCESS;
    }
}
