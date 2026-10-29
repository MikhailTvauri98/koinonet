<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Pagination\Cursor;
use Illuminate\Support\Facades\Validator;

final class NotificationCursor implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value) || preg_match('/\A[A-Za-z0-9_-]+\z/', $value) !== 1) {
            $fail('Недопустимый курсор уведомлений.');

            return;
        }

        $parameters = Cursor::fromEncoded($value)?->toArray() ?? [];
        $validator = Validator::make($parameters, [
            'created_at' => ['required', 'string', 'date_format:Y-m-d H:i:s'],
            'id' => ['required', 'string', 'uuid'],
            '_pointsToNextItems' => ['required', 'boolean:strict'],
        ]);

        // PHP accepts year zero, but PostgreSQL timestamps do not.
        if ($validator->fails() || str_starts_with($parameters['created_at'], '0000-')) {
            $fail('Недопустимый курсор уведомлений.');
        }
    }
}
