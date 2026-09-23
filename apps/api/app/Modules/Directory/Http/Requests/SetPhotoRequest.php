<?php

declare(strict_types=1);

namespace App\Modules\Directory\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class SetPhotoRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            'media_id' => ['required', 'string', 'ulid', Rule::exists('media', 'id')],
        ];
    }
}
