<?php

declare(strict_types=1);

namespace App\Modules\Notifications\OpenApi;

use Dedoc\Scramble\Support\Generator\Types\Type;

/** Constraints enforced by required/array validation and the category validator. */
final class NotificationSettingsSchema extends Type
{
    public function __construct(private readonly Type $inferred)
    {
        parent::__construct('object');
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        /** @var array{properties: array<string, mixed>} $schema */
        $schema = $this->inferred->toArray();
        $schema['properties']['settings']['minProperties'] = 1;
        $schema['properties']['settings']['additionalProperties'] = false;

        return $schema;
    }
}
