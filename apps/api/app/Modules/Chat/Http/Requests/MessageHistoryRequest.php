<?php

declare(strict_types=1);

namespace App\Modules\Chat\Http\Requests;

use App\Modules\Chat\Models\Chat;
use App\Modules\Directory\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;

final class MessageHistoryRequest extends FormRequest
{
    public function authorize(): bool
    {
        $chat = $this->route('chat');
        $user = $this->user();
        assert($chat instanceof Chat && $user instanceof User);

        return Gate::forUser($user)->allows('view', $chat);
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [
            'before' => ['sometimes', 'required', 'string', 'prohibits:after'],
            'after' => ['sometimes', 'required', 'string', 'prohibits:before'],
            'limit' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ];
    }
}
