<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class CreateEventFromTemplateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return ['date' => ['required', 'date_format:Y-m-d']];
    }
}
