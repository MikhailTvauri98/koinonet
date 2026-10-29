<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Http\Requests;

use App\Modules\Settings\ChurchSettings;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

final class IndexEventRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $today = CarbonImmutable::today(app(ChurchSettings::class)->timezone());
        $this->mergeIfMissing([
            'from' => $today->toDateString(),
            'to' => $today->addDays(28)->toDateString(),
            'scope' => 'church',
        ]);
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'from' => ['sometimes', 'required', 'date_format:Y-m-d'],
            'to' => ['sometimes', 'required', 'date_format:Y-m-d', 'after_or_equal:from'],
            'scope' => ['sometimes', 'required', 'string', 'regex:/\A(?:church|mine|ministry:[0-7][0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{25})\z/'],
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:200'],
        ];
    }

    /** @return list<\Closure(Validator): void> */
    public function after(): array
    {
        return [function (Validator $validator): void {
            if ($validator->errors()->has('from') || $validator->errors()->has('to')) {
                return;
            }
            $from = CarbonImmutable::parse($this->string('from')->toString(), 'UTC');
            $to = CarbonImmutable::parse($this->string('to')->toString(), 'UTC');
            if ($to->greaterThan($from->addDays(92))) {
                $validator->errors()->add('to', 'Диапазон не должен превышать 93 календарных дня.');
            }
        }];
    }
}
