<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Http\Controllers;

use App\Modules\Directory\Models\User;
use App\Modules\Notifications\Actions\SetNotificationSettings;
use App\Modules\Notifications\Http\Requests\UpdateNotificationSettingsRequest;
use App\Modules\Notifications\Http\Resources\NotificationSettingResource;
use App\Modules\Notifications\NotificationCategory;
use App\Modules\Notifications\NotificationPreferences;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

final readonly class NotificationSettingsController
{
    public function __construct(private NotificationPreferences $preferences) {}

    /** @return AnonymousResourceCollection<NotificationSettingResource> */
    public function index(Request $request): AnonymousResourceCollection
    {
        $user = $request->user();
        assert($user instanceof User);
        $settings = $this->preferences->all($user);

        return NotificationSettingResource::collection(array_map(
            fn (NotificationCategory $category): array => [
                'category' => $category->value,
                'label' => $category->label(),
                'enabled' => $settings[$category->value],
            ],
            NotificationCategory::cases(),
        ));
    }

    /** @return AnonymousResourceCollection<NotificationSettingResource> */
    public function update(UpdateNotificationSettingsRequest $request, SetNotificationSettings $action): AnonymousResourceCollection
    {
        $user = $request->user();
        assert($user instanceof User);
        /** @var array<string, bool> $settings */
        $settings = $request->validated('settings');
        $action->handle($user, $settings);

        return $this->index($request);
    }
}
