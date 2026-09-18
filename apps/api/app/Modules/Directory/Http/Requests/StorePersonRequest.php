<?php

declare(strict_types=1);

namespace App\Modules\Directory\Http\Requests;

use App\Modules\Directory\PersonStatus;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class StorePersonRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            'last_name' => ['required', 'string', 'max:100'],
            'first_name' => ['required', 'string', 'max:100'],
            'patronymic' => ['sometimes', 'nullable', 'string', 'max:100'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:100'],
            'email' => ['sometimes', 'nullable', 'email', 'max:254'],
            'birth_date' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
            'status' => ['required', Rule::enum(PersonStatus::class)],
            'note' => ['sometimes', 'nullable', 'string'],
        ];
    }
}
