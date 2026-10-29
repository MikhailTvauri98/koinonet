<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Http\Requests;

use App\Modules\Calendar\EventOwnerType;
use App\Modules\Calendar\EventVisibility;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class StoreEventRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            'owner_type' => ['required', Rule::enum(EventOwnerType::class)],
            'ministry_id' => ['required_if:owner_type,ministry', 'prohibited_if:owner_type,church', 'ulid', Rule::exists('ministries', 'id')->whereNull('archived_at')],
            'title' => ['required', 'string', 'max:200'],
            'description' => ['nullable', 'string', 'max:5000'],
            'location' => ['nullable', 'string', 'max:200'],
            'starts_at' => ['required', 'date'],
            'ends_at' => ['required', 'date', 'after:starts_at'],
            'visibility' => ['required', Rule::enum(EventVisibility::class), Rule::notIn($this->input('owner_type') === 'church' ? ['ministry'] : [])],
            'slots' => ['sometimes', 'array', 'list', 'max:30'],
            'slots.*.label' => ['nullable', 'string', 'max:100'],
            'slots.*.role_id' => ['nullable', 'ulid', Rule::exists('roles', 'id')],
            'slots.*.required_count' => ['required', 'integer', 'min:1', 'max:50'],
            'notify' => ['sometimes', Rule::in($this->input('owner_type') === 'church' ? ['none', 'all'] : ['none', 'ministry'])],
            'media_ids' => ['sometimes', 'array', 'list'],
            'media_ids.*' => ['required', 'ulid', 'distinct', Rule::exists('media', 'id')],
        ];
    }
}
