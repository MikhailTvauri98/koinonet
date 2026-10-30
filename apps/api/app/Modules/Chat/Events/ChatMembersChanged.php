<?php

declare(strict_types=1);

namespace App\Modules\Chat\Events;

use Illuminate\Foundation\Events\Dispatchable;

final readonly class ChatMembersChanged
{
    use Dispatchable;

    /** @param list<string> $added
     * @param  list<string>  $removed
     */
    public function __construct(public string $chatId, public array $added, public array $removed) {}
}
