<?php

declare(strict_types=1);

namespace App\Modules\Chat\Http\Requests;

use App\Modules\Chat\Models\Chat;
use App\Modules\Directory\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;

final class MuteRequest extends FormRequest
{
    public function authorize(): bool
    {
        $chat = $this->route('chat');
        $user = $this->user();

        return $chat instanceof Chat && $user instanceof User && Gate::forUser($user)->allows('mute', $chat);
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return ['until' => ['sometimes', 'required', 'string', 'date', 'regex:/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/', 'after:now']];
    }
}
