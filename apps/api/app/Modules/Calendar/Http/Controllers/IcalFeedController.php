<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Http\Controllers;

use App\Modules\Calendar\IcalFeedBuilder;
use App\Modules\Directory\Models\User;
use Dedoc\Scramble\Attributes\Response as OpenApiResponse;
use Illuminate\Http\Response;

final class IcalFeedController
{
    #[OpenApiResponse(mediaType: 'text/calendar', type: 'string')]
    public function __invoke(string $token, IcalFeedBuilder $feed): Response
    {
        $user = User::query()->where('ical_token', $token)->whereNull('disabled_at')
            ->whereHas('person', fn ($person) => $person->whereNull('archived_at'))->firstOrFail();

        return response($feed->for($user), 200, [
            'Content-Type' => 'text/calendar; charset=UTF-8',
            'Cache-Control' => 'private, no-store',
        ]);
    }
}
