<?php

declare(strict_types=1);

namespace App\Modules\Announcements\Http\Requests;

use App\Modules\Announcements\AnnouncementScope;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class StoreAnnouncementRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            'scope' => ['required', Rule::enum(AnnouncementScope::class)],
            'ministry_id' => ['required_if:scope,ministry', 'prohibited_if:scope,church', 'ulid', Rule::exists('ministries', 'id')],
            'title' => ['required', 'string', 'max:200'],
            'body' => ['required', 'string', 'max:20000'],
            'pinned' => ['sometimes', 'boolean'],
            'hide_after' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
            'notify_on_publish' => ['sometimes', 'boolean'],
            'media_ids' => ['sometimes', 'array', 'list'],
            'media_ids.*' => ['required', 'ulid', 'distinct', Rule::exists('media', 'id')],
        ];
    }
}
