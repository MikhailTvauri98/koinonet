<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Http\Requests;

use App\Modules\Calendar\EventOwnerType;
use App\Modules\Calendar\EventVisibility;
use App\Modules\Calendar\Models\EventTemplate;
use App\Modules\Calendar\RecurrenceRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;
use InvalidArgumentException;

class TemplateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function creating(): bool
    {
        return true;
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        $creating = $this->creating();
        $template = $this->route('template');
        $church = $creating ? $this->input('owner_type') === 'church' : $template instanceof EventTemplate && $template->owner_type === EventOwnerType::Church;
        $required = $creating ? ['required'] : ['sometimes', 'required'];

        return [
            'owner_type' => $creating ? ['required', Rule::enum(EventOwnerType::class)] : ['prohibited'],
            'ministry_id' => $creating ? ['required_if:owner_type,ministry', 'prohibited_if:owner_type,church', 'ulid', Rule::exists('ministries', 'id')->whereNull('archived_at')] : ['prohibited'],
            'title' => [...$required, 'string', 'max:200'],
            'description' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'location' => ['sometimes', 'nullable', 'string', 'max:200'],
            'visibility' => [...$required, Rule::enum(EventVisibility::class), Rule::notIn($church ? ['ministry'] : [])],
            'start_time' => [...$required, 'date_format:H:i'],
            'duration_minutes' => [...$required, 'integer', 'min:15', 'max:1440'],
            'recurrence' => ['sometimes', 'nullable', 'array'],
            'active' => ['sometimes', 'required', 'boolean'],
            'slots' => ['sometimes', 'array', 'list', 'max:30'],
            'slots.*.label' => ['nullable', 'string', 'max:100'],
            'slots.*.role_id' => ['nullable', 'ulid', Rule::exists('roles', 'id')],
            'slots.*.required_count' => ['required', 'integer', 'min:1', 'max:50'],
        ];
    }

    /** @return list<\Closure(Validator): void> */
    public function after(): array
    {
        return [function (Validator $validator): void {
            if ($validator->errors()->has('recurrence')) {
                return;
            }
            /** @var array<string, mixed>|null $recurrence */
            $recurrence = $this->input('recurrence');
            try {
                RecurrenceRule::fromArray($recurrence);
            } catch (InvalidArgumentException $exception) {
                $validator->errors()->add('recurrence', $exception->getMessage());
            }
        }];
    }
}
