<?php

declare(strict_types=1);

namespace App\Modules\Chat\Http\Requests;

use App\Modules\Chat\ChatAccess;
use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\Models\Message;
use App\Modules\Directory\Models\User;
use App\Support\DomainRuleException;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

final class SendMessageRequest extends FormRequest
{
    public function authorize(): bool
    {
        $chat = $this->route('chat');
        $user = $this->user();
        assert($chat instanceof Chat && $user instanceof User);
        // Reject non-members before archive or validation details are disclosed.
        if ($user->isDisabled() || app(ChatAccess::class)->member($user, $chat) === null) {
            return false;
        }
        if ($chat->archived_at !== null) {
            throw DomainRuleException::because('chat.archived', 'Чат архивирован, писать в него нельзя.');
        }

        return Gate::forUser($user)->allows('create', [Message::class, $chat]);
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            'body' => ['sometimes', 'nullable', 'string', 'max:4000'],
            'media_ids' => ['sometimes', 'array', 'list'],
            'media_ids.*' => ['required', 'ulid', 'distinct', Rule::exists('media', 'id')],
            'reply_to_id' => ['sometimes', 'nullable', 'ulid'],
        ];
    }
}
