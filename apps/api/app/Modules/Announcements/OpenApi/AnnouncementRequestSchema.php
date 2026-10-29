<?php

declare(strict_types=1);

namespace App\Modules\Announcements\OpenApi;

use App\Modules\Announcements\AnnouncementScope;
use Dedoc\Scramble\Support\Generator\Types\Type;

/** Adds conditional and prohibited fields that Scramble cannot infer from validation. */
final class AnnouncementRequestSchema extends Type
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
            $schema['properties']['scope'] = false;
            $schema['properties']['ministry_id'] = false;

            return $schema;
        }

        return [...$schema, 'oneOf' => [
            ['properties' => [
                'scope' => ['const' => AnnouncementScope::Church->value],
                'ministry_id' => false,
            ]],
            ['required' => ['ministry_id'], 'properties' => [
                'scope' => ['const' => AnnouncementScope::Ministry->value],
                'ministry_id' => $schema['properties']['ministry_id'],
            ]],
        ]];
    }
}
