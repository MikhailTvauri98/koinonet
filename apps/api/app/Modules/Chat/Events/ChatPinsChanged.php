<?php

declare(strict_types=1);

namespace App\Modules\Chat\Events;

use Illuminate\Foundation\Events\Dispatchable;

final readonly class ChatPinsChanged
{
    use Dispatchable;

    public function __construct(public string $chatId) {}
}
