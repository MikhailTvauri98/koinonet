<?php

declare(strict_types=1);

namespace App\Modules\Ministries\Http\Requests;

use App\Modules\Ministries\MinistryColor;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class MinistryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        $creating = $this->isMethod('post');

        return [
            'name' => [$creating ? 'required' : 'sometimes', 'string', 'max:100'],
            'color' => $creating
                ? ['required', Rule::enum(MinistryColor::class)]
                : ['sometimes', 'filled', Rule::enum(MinistryColor::class)],
            'description' => ['sometimes', 'nullable', 'string'],
            'default_role_id' => $creating
                ? ['prohibited']
                : ['sometimes', 'string', 'ulid', Rule::exists('roles', 'id')],
        ];
    }
}
