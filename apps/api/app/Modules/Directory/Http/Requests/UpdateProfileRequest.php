<?php

declare(strict_types=1);

namespace App\Modules\Directory\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class UpdateProfileRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [
            'phone' => ['sometimes', 'nullable', 'string', 'max:100'],
            'email' => ['sometimes', 'nullable', 'email', 'max:254'],
            'birth_date' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
            'contacts_public' => ['sometimes', 'boolean'],
            'last_name' => ['prohibited'],
            'first_name' => ['prohibited'],
            'patronymic' => ['prohibited'],
            'status' => ['prohibited'],
            'note' => ['prohibited'],
        ];
    }
}
