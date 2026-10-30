<?php

declare(strict_types=1);

namespace App\Modules\Chat\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class AddMembersRequest extends FormRequest
{
    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return ['user_ids' => ['required', 'array', 'min:1'], 'user_ids.*' => ['required', 'string', 'ulid']];
    }
}
