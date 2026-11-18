<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Http\Controllers;

use App\Modules\Calendar\IcalFeedBuilder;
use App\Modules\Calendar\Models\Event;
use App\Modules\Directory\Models\User;
use Dedoc\Scramble\Attributes\Response as OpenApiResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;

final class EventIcsController
{
    #[OpenApiResponse(mediaType: 'text/calendar', type: 'string')]
    public function __invoke(Request $request, Event $event, IcalFeedBuilder $feed): Response
    {
        Gate::authorize('view', $event);
        $user = $request->user();
        assert($user instanceof User);

        return response($feed->forEvent($event, $user->person), 200, [
            'Content-Type' => 'text/calendar; charset=UTF-8',
            'Content-Disposition' => "attachment; filename=\"event-{$event->id}.ics\"",
            'Cache-Control' => 'private, no-store',
        ]);
    }
}
