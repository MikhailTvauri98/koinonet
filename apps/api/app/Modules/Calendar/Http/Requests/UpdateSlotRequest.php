<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Http\Requests;

final class UpdateSlotRequest extends SlotRequest
{
    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return array_replace(parent::rules(), [
            'required_count' => ['sometimes', 'integer', 'min:1', 'max:50'],
        ]);
    }
}
