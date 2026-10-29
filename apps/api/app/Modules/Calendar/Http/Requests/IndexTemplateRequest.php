<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class IndexTemplateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'scope' => ['sometimes', 'required', 'string', 'regex:/\A(?:church|ministry:[0-7][0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{25})\z/'],
            'archived' => ['sometimes', 'boolean'],
        ];
    }
}
