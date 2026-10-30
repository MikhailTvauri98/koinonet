<?php

declare(strict_types=1);

namespace App\Modules\Chat\Http\Requests;

use App\Modules\Chat\Models\Message;
use App\Modules\Directory\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;

final class EditMessageRequest extends FormRequest
{
    public function authorize(): bool
    {
        $message = $this->route('message');
        $user = $this->user();
        assert($message instanceof Message && $user instanceof User);

        return Gate::forUser($user)->allows('update', $message);
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return ['body' => ['present', 'nullable', 'string', 'max:4000']];
    }
}
