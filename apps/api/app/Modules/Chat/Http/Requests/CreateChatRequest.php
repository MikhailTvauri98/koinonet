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
        return Gate::allows('create', Chat::class);
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return ['type' => ['required', 'in:group'], 'title' => ['required', 'string', 'max:100'], 'member_ids' => ['required', 'array', 'min:1'], 'member_ids.*' => ['required', 'string', 'ulid']];
    }
}
