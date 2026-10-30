<?php

declare(strict_types=1);

namespace App\Modules\Chat\Events;

use Illuminate\Foundation\Events\Dispatchable;

final readonly class MessageEdited
{
    use Dispatchable;

    public function __construct(public string $chatId, public string $messageId) {}
}
