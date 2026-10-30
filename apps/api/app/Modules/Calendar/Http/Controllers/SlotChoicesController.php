<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Http\Controllers;

use App\Modules\Access\RoleScope;
use App\Modules\Calendar\EventOwnerType;
use App\Modules\Calendar\Http\Requests\SlotChoicesRequest;
use App\Modules\Calendar\Http\Resources\SlotChoicesResource;
use App\Modules\Calendar\Models\Event;
use App\Modules\Ministries\Models\Ministry;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;

final class SlotChoicesController
{
    public function __invoke(SlotChoicesRequest $request): AnonymousResourceCollection
    {
        Gate::authorize('create', [Event::class, EventOwnerType::from($request->string('owner_type')->toString()), $request->input('ministry_id')]);

        return SlotChoicesResource::collection(Ministry::query()->whereNull('archived_at')->with(['roles' => fn ($query) => $query->where('scope', RoleScope::Ministry)->orderBy('name')])->orderBy('name')->get());
    }
}
