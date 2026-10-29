<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class AssignRequest extends FormRequest
{
    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return ['person_id' => ['required', 'ulid', 'exists:people,id']];
    }
}
