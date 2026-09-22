<?php

declare(strict_types=1);

namespace App\Modules\Directory\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class UpdateLoginRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [
            'login' => ['required', 'string', 'max:254'],
            'current_password' => ['required', 'string'],
        ];
    }
}
