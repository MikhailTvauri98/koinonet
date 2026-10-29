<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Http\Requests;

use App\Modules\Notifications\NotificationCategory;
use Dedoc\Scramble\Attributes\BodyParameter;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

#[BodyParameter(
    'settings',
    description: 'Перечисленные категории изменяются, остальные сохраняют состояние. Объект должен содержать хотя бы одну категорию.',
    required: true,
    type: 'array{announcements?: bool, chat?: bool, assignments?: bool, reminders?: bool}',
    infer: false,
)]
final class UpdateNotificationSettingsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [
            'settings' => ['required', 'array'],
            'settings.*' => ['boolean'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            $settings = $this->input('settings');

            if (! is_array($settings)) {
                return;
            }

            foreach (array_keys($settings) as $category) {
                if (NotificationCategory::tryFrom((string) $category) === null) {
                    $validator->errors()->add('settings.'.$category, 'Неизвестная категория уведомлений.');
                }
            }
        });
    }
}
