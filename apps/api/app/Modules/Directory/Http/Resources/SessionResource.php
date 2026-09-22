<?php

declare(strict_types=1);

namespace App\Modules\Directory\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Carbon;
use stdClass;

final class SessionResource extends JsonResource
{
    /**
     * @return array{
     *     id: string,
     *     ip_address: string|null,
     *     user_agent: string|null,
     *     last_activity: string,
     *     current: bool
     * }
     */
    public function toArray(Request $request): array
    {
        $session = $this->resource;
        assert($session instanceof stdClass);

        $id = (string) $session->id;
        $ip = $session->ip_address;
        $agent = $session->user_agent;

        return [
            'id' => $id,
            'ip_address' => $ip === null ? null : (string) $ip,
            'user_agent' => $agent === null ? null : (string) $agent,
            'last_activity' => Carbon::createFromTimestampUTC((int) $session->last_activity)->toISOString(),
            'current' => $id === $request->session()->getId(),
        ];
    }
}
