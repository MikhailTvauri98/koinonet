<?php

declare(strict_types=1);

namespace App\Modules\Calendar\OpenApi;

use Dedoc\Scramble\Support\Generator\Types\Type;

/** Strict recurrence variants and conditional request rules beyond Scramble inference. */
final class TemplateSchema extends Type
{
    public function __construct(private readonly Type $inferred, private readonly ?bool $creating)
    {
        parent::__construct('object');
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        /** @var array{properties: array<string, mixed>, required?: list<string>} $schema */
        $schema = $this->inferred->toArray();
        $schema['properties']['recurrence'] = ['anyOf' => [self::recurrence(), ['type' => 'null']]];
        $schema['properties']['start_time'] = ['type' => 'string', 'pattern' => '^([01][0-9]|2[0-3]):[0-5][0-9]$', 'example' => '10:00'];
        if ($this->creating === null) {
            return $schema;
        }
        $schema['properties']['slots']['items']['properties']['role_id']['format'] = 'ulid';
        if (! $this->creating) {
            $schema['properties']['owner_type'] = false;
            $schema['properties']['ministry_id'] = false;
            unset($schema['required']);

            return $schema;
        }
        $schema['properties']['ministry_id']['format'] = 'ulid';

        return [...$schema, 'oneOf' => [
            ['properties' => [
                'owner_type' => ['const' => 'church'],
                'ministry_id' => false,
                'visibility' => ['enum' => ['church', 'assigned']],
            ]],
            ['required' => ['ministry_id'], 'properties' => ['owner_type' => ['const' => 'ministry']]],
        ]];
    }

    /** @return array<string, mixed> */
    private static function recurrence(): array
    {
        $weekday = ['type' => 'integer', 'minimum' => 1, 'maximum' => 7];

        return ['oneOf' => [
            ['type' => 'object', 'required' => ['type', 'weekday'], 'additionalProperties' => false, 'properties' => [
                'type' => ['type' => 'string', 'const' => 'weekly'], 'weekday' => $weekday,
            ]],
            ['type' => 'object', 'required' => ['type', 'weekday', 'anchor_date'], 'additionalProperties' => false, 'properties' => [
                'type' => ['type' => 'string', 'const' => 'biweekly'], 'weekday' => $weekday, 'anchor_date' => ['type' => 'string', 'format' => 'date'],
            ]],
            ['type' => 'object', 'required' => ['type', 'weekday', 'nth'], 'additionalProperties' => false, 'properties' => [
                'type' => ['type' => 'string', 'const' => 'monthly_nth_weekday'], 'weekday' => $weekday, 'nth' => ['type' => 'integer', 'enum' => [-1, 1, 2, 3, 4, 5]],
            ]],
        ]];
    }
}
