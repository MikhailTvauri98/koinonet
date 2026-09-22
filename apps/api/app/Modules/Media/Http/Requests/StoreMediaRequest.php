<?php

declare(strict_types=1);

namespace App\Modules\Media\Http\Requests;

use App\Modules\Media\MediaPurpose;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class StoreMediaRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            'file' => ['required', 'file'],
            // Required by the upload contract (architecture 7.8) but not a column on
            // `media` (architecture 5.8 lists its full composition) - it only states
            // what the caller intends to do with the file. Whether the file actually
            // fits that intent (e.g. an image for `person_photo`) is checked later,
            // when task 23's binding endpoints attach it to its target.
            'purpose' => ['required', Rule::enum(MediaPurpose::class)],
        ];
    }
}
