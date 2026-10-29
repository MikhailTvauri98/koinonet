<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Http\Requests;

final class UpdateTemplateRequest extends TemplateRequest
{
    protected function creating(): bool
    {
        return false;
    }
}
