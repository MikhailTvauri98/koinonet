<?php

declare(strict_types=1);

namespace App\Modules\Announcements\Http\Requests;

use App\Modules\Announcements\AnnouncementScope;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class IndexAnnouncementRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'scope' => ['sometimes', 'required', Rule::enum(AnnouncementScope::class)],
            'ministry' => ['sometimes', 'required', 'ulid'],
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ];
    }
}
