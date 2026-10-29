<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Push;

final class PushResult
{
    public function __construct(public readonly bool $success, public readonly ?int $status) {}
}
