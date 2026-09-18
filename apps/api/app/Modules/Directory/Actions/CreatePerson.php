<?php

declare(strict_types=1);

namespace App\Modules\Directory\Actions;

use App\Modules\Access\AuditLogger;
use App\Modules\Directory\Events\PersonCreated;
use App\Modules\Directory\Models\Person;
use App\Support\Phone;

final readonly class CreatePerson
{
    public function __construct(private AuditLogger $audit) {}

    /**
     * @param  array<string, mixed>  $attributes
     * @return array{person: Person, warnings: list<array{code: string, message: string}>}
     */
    public function handle(array $attributes): array
    {
        $attributes['phone'] = Phone::normalize($attributes['phone'] ?? null);
        $attributes['email'] = self::normalizeEmail($attributes['email'] ?? null);

        $warnings = [];

        if ($attributes['phone'] !== null
            && Person::query()->where('phone', $attributes['phone'])->exists()) {
            $warnings[] = [
                'code' => 'person.duplicate_phone',
                'message' => 'Человек с таким телефоном уже есть.',
            ];
        }

        if ($attributes['email'] !== null
            && Person::query()->where('email', $attributes['email'])->exists()) {
            $warnings[] = [
                'code' => 'person.duplicate_email',
                'message' => 'Человек с такой почтой уже есть.',
            ];
        }

        $person = Person::query()->create($attributes);
        $this->audit->record('person.created', $person);
        PersonCreated::dispatch($person->id);

        return ['person' => $person, 'warnings' => $warnings];
    }

    private static function normalizeEmail(mixed $email): ?string
    {
        if ($email === null) {
            return null;
        }

        return mb_strtolower(trim((string) $email));
    }
}
