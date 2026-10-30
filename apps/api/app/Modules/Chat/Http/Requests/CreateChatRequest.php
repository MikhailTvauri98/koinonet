<?php

declare(strict_types=1);

namespace App\Modules\Chat\Http\Requests;

use App\Modules\Chat\Models\Chat;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;

final class CreateChatRequest extends FormRequest
{
    public function authorize(): bool
    {
        return Gate::allows($this->input('type') === 'direct' ? 'openDirect' : 'create', Chat::class);
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [
            'type' => ['required', 'in:group,direct'],
            'title' => ['exclude_unless:type,group', 'required', 'string', 'max:100'],
            'member_ids' => ['exclude_unless:type,group', 'required', 'array', 'min:1'],
            'member_ids.*' => ['required', 'string', 'ulid'],
            'user_id' => ['exclude_unless:type,direct', 'required', 'string', 'ulid', 'exists:users,id'],
        ];
    }
}
