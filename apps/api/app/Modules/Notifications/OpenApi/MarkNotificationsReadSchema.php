<?php

declare(strict_types=1);

namespace App\Modules\Notifications\OpenApi;

use Dedoc\Scramble\Support\Generator\Types\Type;

/** Describes the mutually exclusive selection that conditional validation rules cannot infer. */
final class MarkNotificationsReadSchema extends Type
{
    public function __construct()
    {
        parent::__construct('object');
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'oneOf' => [
                [
                    'type' => 'object',
                    'required' => ['ids'],
                    'properties' => [
                        'ids' => ['type' => 'array', 'minItems' => 1, 'items' => ['type' => 'string', 'format' => 'uuid']],
                        'all' => false,
                    ],
                ],
                [
                    'type' => 'object',
                    'required' => ['all'],
                    'properties' => ['all' => ['type' => 'boolean', 'const' => true], 'ids' => false],
                ],
            ],
        ];
    }
}
