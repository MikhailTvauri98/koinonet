<?php

declare(strict_types=1);

namespace App\Modules\Directory\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class AcceptAccessLinkRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [
            'login' => ['sometimes', 'string', 'max:254'],
            'password' => ['required', 'string', 'min:8', 'max:255', 'confirmed'],
        ];
    }
}
