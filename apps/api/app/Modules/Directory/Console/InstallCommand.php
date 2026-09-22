<?php

declare(strict_types=1);

namespace App\Modules\Directory\Console;

use App\Modules\Access\Actions\EnsureAdministratorRole;
use App\Modules\Access\Actions\SetPersonRoles;
use App\Modules\Access\Models\Role;
use App\Modules\Directory\Actions\CreatePerson;
use App\Modules\Directory\Models\User;
use App\Modules\Directory\PersonStatus;
use App\Modules\Settings\ChurchSettings;
use App\Support\DomainRuleException;
use App\Support\Phone;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;

final class InstallCommand extends Command
{
    protected $signature = 'app:install
        {--church-name= : Название церкви}
        {--timezone= : Часовой пояс церкви, например Europe/Moscow}
        {--phone-region= : Регион телефонов двумя буквами, например RU}
        {--last-name= : Фамилия первого администратора}
        {--first-name= : Имя первого администратора}
        {--login= : Телефон или электронная почта для входа}
        {--password= : Пароль первого администратора}';

    protected $description = 'Первичная установка: настройки церкви, роль «Администратор», первый человек с аккаунтом';

    public function handle(
        ChurchSettings $settings,
        EnsureAdministratorRole $ensureAdministratorRole,
        CreatePerson $createPerson,
        SetPersonRoles $setPersonRoles,
    ): int {
        if (Role::query()->where('is_system', true)->exists()) {
            $this->components->error('Система уже установлена: роль «Администратор» существует.');

            return self::FAILURE;
        }

        $input = [
            'church_name' => $this->given('Название церкви', 'church-name'),
            'timezone' => $this->given('Часовой пояс церкви', 'timezone'),
            'phone_region' => $this->given('Регион телефонов двумя буквами', 'phone-region'),
            'last_name' => $this->given('Фамилия администратора', 'last-name'),
            'first_name' => $this->given('Имя администратора', 'first-name'),
            'login' => $this->given('Телефон или почта для входа', 'login'),
            'password' => $this->givenPassword(),
        ];

        $validator = Validator::make($input, [
            'church_name' => ['required', 'string', 'max:100'],
            'timezone' => ['required', 'timezone:all'],
            'phone_region' => ['required', 'string', 'size:2', 'alpha'],
            'last_name' => ['required', 'string', 'max:100'],
            'first_name' => ['required', 'string', 'max:100'],
            'login' => ['required', 'string', 'max:254'],
            'password' => ['required', 'string', 'min:8', 'max:255'],
        ]);

        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $message) {
                $this->components->error((string) $message);
            }

            return self::FAILURE;
        }

        $region = mb_strtoupper((string) $input['phone_region']);

        try {
            $credentials = self::credentials((string) $input['login'], $region);
        } catch (DomainRuleException $exception) {
            $this->components->error($exception->getMessage());

            return self::FAILURE;
        }

        DB::transaction(function () use (
            $settings,
            $ensureAdministratorRole,
            $createPerson,
            $setPersonRoles,
            $input,
            $region,
            $credentials,
        ): void {
            $settings->put([
                'church.name' => (string) $input['church_name'],
                'church.timezone' => (string) $input['timezone'],
                'church.phone_region' => $region,
            ]);

            $role = $ensureAdministratorRole->handle();

            $person = $createPerson->handle([
                'last_name' => (string) $input['last_name'],
                'first_name' => (string) $input['first_name'],
                'status' => PersonStatus::Member,
            ])['person'];

            $setPersonRoles->handle($person, [$role->id]);

            User::query()->create([
                'person_id' => $person->id,
                ...$credentials,
                'password' => Hash::make((string) $input['password']),
            ]);
        });

        $this->components->info('Установка завершена. Войдите под указанным логином.');

        return self::SUCCESS;
    }

    /** @return array{phone: string|null, email: string|null} */
    private static function credentials(string $login, string $region): array
    {
        $login = trim($login);

        return filter_var($login, FILTER_VALIDATE_EMAIL)
            ? ['phone' => null, 'email' => mb_strtolower($login)]
            : ['phone' => Phone::normalize($login, $region), 'email' => null];
    }

    private function given(string $question, string $option): string
    {
        $value = $this->option($option);

        return is_string($value) && $value !== ''
            ? $value
            : (string) $this->components->ask($question);
    }

    private function givenPassword(): string
    {
        $value = $this->option('password');

        return is_string($value) && $value !== ''
            ? $value
            : (string) $this->secret('Пароль администратора');
    }
}
