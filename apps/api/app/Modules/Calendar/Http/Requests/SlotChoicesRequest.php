<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Http\Requests;

use App\Modules\Calendar\EventOwnerType;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class SlotChoicesRequest extends FormRequest
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
            'ministry_id' => ['required_if:owner_type,ministry', 'prohibited_if:owner_type,church', 'nullable', 'ulid', Rule::exists('ministries', 'id')->whereNull('archived_at')],
        ];
    }
}
