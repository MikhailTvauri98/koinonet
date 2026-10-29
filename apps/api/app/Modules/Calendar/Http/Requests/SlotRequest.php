<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class SlotRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            'label' => ['nullable', 'string', 'max:100'],
            'role_id' => ['nullable', 'ulid', Rule::exists('roles', 'id')],
            'required_count' => ['required', 'integer', 'min:1', 'max:50'],
        ];
    }
}
