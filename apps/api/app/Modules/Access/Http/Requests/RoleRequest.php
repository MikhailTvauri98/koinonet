<?php

declare(strict_types=1);

namespace App\Modules\Access\Http\Requests;

use App\Modules\Access\Permission;
use App\Modules\Access\RoleScope;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class RoleRequest extends FormRequest
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
            'scope' => $creating
                ? ['required', Rule::in([RoleScope::Global->value])]
                : ['prohibited'],
            'ministry_id' => ['prohibited'],
            'name' => [$creating ? 'required' : 'sometimes', 'string', 'max:100'],
            'description' => ['sometimes', 'nullable', 'string'],
            'permissions' => [$creating ? 'present' : 'sometimes', 'array'],
            'permissions.*' => ['required', 'distinct', Rule::enum(Permission::class)],
        ];
    }
}
