<?php

declare(strict_types=1);

namespace App\Modules\Announcements\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class UpdateAnnouncementRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            'scope' => ['prohibited'],
            'ministry_id' => ['prohibited'],
            'title' => ['sometimes', 'required', 'string', 'max:200'],
            'body' => ['sometimes', 'required', 'string', 'max:20000'],
            'pinned' => ['sometimes', 'boolean'],
            'hide_after' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
            'notify_on_publish' => ['sometimes', 'boolean'],
            'media_ids' => ['sometimes', 'array'],
        ];
    }
}
