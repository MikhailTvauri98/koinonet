<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class MarkNotificationsReadRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [
            'ids' => ['required_without:all', 'missing_with:all', 'array', 'list', 'min:1'],
            'ids.*' => ['required', 'uuid'],
            'all' => ['sometimes', 'required', 'missing_with:ids', 'boolean:strict', 'accepted'],
        ];
    }
}
