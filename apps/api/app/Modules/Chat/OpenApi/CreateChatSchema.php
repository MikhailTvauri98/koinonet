<?php

declare(strict_types=1);

namespace App\Modules\Chat\OpenApi;

use Dedoc\Scramble\Support\Generator\Types\Type;

/** Branch-specific required fields; irrelevant fields are ignored by validation. */
final class CreateChatSchema extends Type
{
    public function __construct()
    {
        parent::__construct('object');
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        $id = ['type' => 'string', 'format' => 'ulid'];

        return ['type' => 'object', 'required' => ['type'],
            'properties' => ['type' => ['type' => 'string', 'enum' => ['group', 'direct']]],
            'oneOf' => [
                ['required' => ['title', 'member_ids'], 'properties' => [
                    'type' => ['const' => 'group'],
                    'title' => ['type' => 'string', 'maxLength' => 100],
                    'member_ids' => ['type' => 'array', 'minItems' => 1, 'items' => $id],
                ]],
                ['required' => ['user_id'], 'properties' => ['type' => ['const' => 'direct'], 'user_id' => $id]],
            ],
        ];
    }
}
