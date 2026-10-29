<?php

declare(strict_types=1);

namespace App\Modules\Calendar\OpenApi;

use Dedoc\Scramble\Support\Generator\Types\Type;

/** Owner-dependent and prohibited fields that Scramble cannot infer. */
final class EventRequestSchema extends Type
{
    public function __construct(private readonly Type $inferred, private readonly bool $creating)
    {
        parent::__construct('object');
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        /** @var array{properties: array<string, mixed>} $schema */
        $schema = $this->inferred->toArray();
        $schema['properties']['media_ids']['items']['format'] = 'ulid';
        if (! $this->creating) {
            foreach (['owner_type', 'ministry_id', 'slots', 'notify'] as $field) {
                $schema['properties'][$field] = false;
            }

            return $schema;
        }
        $schema['properties']['ministry_id']['format'] = 'ulid';
        $schema['properties']['slots']['items']['properties']['role_id']['format'] = 'ulid';
        $schema['properties']['notify'] = ['type' => 'string', 'enum' => ['none', 'ministry', 'all'], 'default' => 'none'];

        return [...$schema, 'oneOf' => [
            ['properties' => [
                'owner_type' => ['const' => 'church'],
                'ministry_id' => false,
                'visibility' => ['enum' => ['church', 'assigned']],
                'notify' => ['enum' => ['none', 'all']],
            ]],
            ['required' => ['ministry_id'], 'properties' => [
                'owner_type' => ['const' => 'ministry'],
                'notify' => ['enum' => ['none', 'ministry']],
            ]],
        ]];
    }
}
