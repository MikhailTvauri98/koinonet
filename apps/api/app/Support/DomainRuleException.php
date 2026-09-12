<?php

declare(strict_types=1);

namespace App\Support;

use RuntimeException;

final class DomainRuleException extends RuntimeException
{
    private function __construct(public readonly string $ruleCode, string $message)
    {
        parent::__construct($message);
    }

    public static function because(string $code, string $message): self
    {
        return new self($code, $message);
    }
}
