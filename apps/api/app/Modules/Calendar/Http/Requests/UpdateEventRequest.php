<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Http\Requests;

use App\Modules\Calendar\EventOwnerType;
use App\Modules\Calendar\EventVisibility;
use App\Modules\Calendar\Models\Event;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

final class UpdateEventRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        $event = $this->route('event');
        $churchEvent = $event instanceof Event && $event->owner_type === EventOwnerType::Church;

        return [
            'owner_type' => ['prohibited'],
            'ministry_id' => ['prohibited'],
            'slots' => ['prohibited'],
            'notify' => ['prohibited'],
            'media_ids' => ['prohibited'],
            'title' => ['sometimes', 'required', 'string', 'max:200'],
            'description' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'location' => ['sometimes', 'nullable', 'string', 'max:200'],
            'starts_at' => ['sometimes', 'required', 'date'],
            'ends_at' => ['sometimes', 'required', 'date'],
            'visibility' => ['sometimes', 'required', Rule::enum(EventVisibility::class), Rule::notIn($churchEvent ? ['ministry'] : [])],
        ];
    }

    /** @return list<\Closure(Validator): void> */
    public function after(): array
    {
        return [function (Validator $validator): void {
            if ($validator->errors()->isNotEmpty() || (! $this->has('starts_at') && ! $this->has('ends_at'))) {
                return;
            }
            $event = $this->route('event');
            assert($event instanceof Event);
            $start = $this->has('starts_at') ? CarbonImmutable::parse($this->string('starts_at')->toString()) : $event->starts_at;
            $end = $this->has('ends_at') ? CarbonImmutable::parse($this->string('ends_at')->toString()) : $event->ends_at;
            if ($end->lessThanOrEqualTo($start)) {
                $validator->errors()->add('ends_at', 'Конец события должен быть позже начала.');
            }
        }];
    }
}
