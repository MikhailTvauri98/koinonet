<?php

declare(strict_types=1);

namespace App\Providers;

use App\Modules\Access\Actions\AccessAccountEraser;
use App\Modules\Access\Contracts\MinistryPermissionSource;
use App\Modules\Access\Contracts\RoleCarrierDetacher;
use App\Modules\Access\Events\PersonRolesChanged;
use App\Modules\Access\Events\RoleDeleted;
use App\Modules\Access\Listeners\BumpPermissionCache;
use App\Modules\Access\Models\AuditEntry;
use App\Modules\Access\Models\Role;
use App\Modules\Access\Policies\AuditPolicy;
use App\Modules\Access\Policies\RolePolicy;
use App\Modules\Announcements\Actions\AnnouncementsAccountEraser;
use App\Modules\Announcements\AnnouncementMediaOwnerResolver;
use App\Modules\Announcements\Events\AnnouncementPublished;
use App\Modules\Announcements\Http\Requests\StoreAnnouncementRequest;
use App\Modules\Announcements\Http\Requests\UpdateAnnouncementRequest;
use App\Modules\Announcements\Models\Announcement;
use App\Modules\Announcements\OpenApi\AnnouncementRequestSchema;
use App\Modules\Announcements\Policies\AnnouncementPolicy;
use App\Modules\Calendar\Access\CalendarRoleUsageSource;
use App\Modules\Calendar\Actions\CalendarAccountEraser;
use App\Modules\Calendar\Actions\DetachHistoricalRoleReferences;
use App\Modules\Calendar\Console\MaterializeCommand;
use App\Modules\Calendar\Console\SendRemindersCommand;
use App\Modules\Calendar\EventMediaOwnerResolver;
use App\Modules\Calendar\Events\AssignmentCreated;
use App\Modules\Calendar\Events\AssignmentRemoved;
use App\Modules\Calendar\Events\EventCancelled;
use App\Modules\Calendar\Events\EventChanged;
use App\Modules\Calendar\Events\EventCreated;
use App\Modules\Calendar\Events\EventReminderDue;
use App\Modules\Calendar\Http\Requests\StoreEventRequest;
use App\Modules\Calendar\Http\Requests\TemplateRequest;
use App\Modules\Calendar\Http\Requests\UpdateEventRequest;
use App\Modules\Calendar\Http\Requests\UpdateTemplateRequest;
use App\Modules\Calendar\Http\Resources\EventTemplateResource;
use App\Modules\Calendar\Listeners\OnMinistryArchived;
use App\Modules\Calendar\Models\Event as CalendarEvent;
use App\Modules\Calendar\Models\EventAssignment;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Calendar\Models\EventTemplate;
use App\Modules\Calendar\OpenApi\EventRequestSchema;
use App\Modules\Calendar\OpenApi\TemplateSchema;
use App\Modules\Calendar\Policies\EventAssignmentPolicy;
use App\Modules\Calendar\Policies\EventPolicy;
use App\Modules\Calendar\Policies\EventSlotPolicy;
use App\Modules\Calendar\Policies\EventTemplatePolicy;
use App\Modules\Chat\Actions\ChatAccountEraser;
use App\Modules\Chat\Console\BackfillChatsCommand;
use App\Modules\Chat\Listeners\AddNewUserToChats;
use App\Modules\Chat\Listeners\ArchiveChatOnMinistryArchived;
use App\Modules\Chat\Listeners\CreateMinistryChatOnCreated;
use App\Modules\Chat\Listeners\SyncMinistryChatOnMembership;
use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\Models\Message;
use App\Modules\Chat\Policies\ChatPolicy;
use App\Modules\Directory\Console\ErasePersonCommand;
use App\Modules\Directory\Console\InstallCommand;
use App\Modules\Directory\Contracts\SharedMinistryFinder;
use App\Modules\Directory\Events\UserCreated;
use App\Modules\Directory\Events\UserDisabled;
use App\Modules\Directory\Events\UserEnabled;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Policies\PersonPolicy;
use App\Modules\Media\Actions\MediaAccountEraser;
use App\Modules\Media\Console\PruneOrphanMediaCommand;
use App\Modules\Media\MediaAccess;
use App\Modules\Ministries\Access\DatabaseMinistryPermissionSource;
use App\Modules\Ministries\Access\DatabaseSharedMinistryFinder;
use App\Modules\Ministries\Actions\DetachRoleFromMembers;
use App\Modules\Ministries\Actions\MinistriesAccountEraser;
use App\Modules\Ministries\Events\MemberAdded;
use App\Modules\Ministries\Events\MemberRemoved;
use App\Modules\Ministries\Events\MemberRolesChanged;
use App\Modules\Ministries\Events\MinistryArchived;
use App\Modules\Ministries\Events\MinistryCreated;
use App\Modules\Ministries\Listeners\BumpMembershipPermissionCache;
use App\Modules\Ministries\Models\Ministry;
use App\Modules\Ministries\Policies\MinistryPolicy;
use App\Modules\Notifications\Actions\NotificationsAccountEraser;
use App\Modules\Notifications\Console\GenerateVapidKeysCommand;
use App\Modules\Notifications\Http\Requests\MarkNotificationsReadRequest;
use App\Modules\Notifications\Http\Requests\UpdateNotificationSettingsRequest;
use App\Modules\Notifications\Listeners\NotifyAboutAnnouncement;
use App\Modules\Notifications\Listeners\NotifyAboutAssignment;
use App\Modules\Notifications\Listeners\NotifyAboutEventCancellation;
use App\Modules\Notifications\Listeners\NotifyAboutEventChange;
use App\Modules\Notifications\Listeners\NotifyAboutNewEvent;
use App\Modules\Notifications\Listeners\NotifyAboutReminder;
use App\Modules\Notifications\Listeners\RemovePushSubscriptionsOnDisable;
use App\Modules\Notifications\OpenApi\MarkNotificationsReadSchema;
use App\Modules\Notifications\OpenApi\NotificationSettingsSchema;
use App\Modules\Notifications\Push\MinishlinkPushTransport;
use App\Modules\Notifications\Push\PushTransport;
use App\Modules\Settings\Models\Setting;
use App\Modules\Settings\Policies\SettingsPolicy;
use Dedoc\Scramble\Scramble;
use Dedoc\Scramble\Support\Generator\OpenApi;
use Dedoc\Scramble\Support\Generator\RequestBodyObject;
use Dedoc\Scramble\Support\Generator\Schema;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->bind(MinistryPermissionSource::class, DatabaseMinistryPermissionSource::class);
        $this->app->bind(SharedMinistryFinder::class, DatabaseSharedMinistryFinder::class);
        $this->app->bind(RoleCarrierDetacher::class, DetachRoleFromMembers::class);
        $this->app->tag([CalendarRoleUsageSource::class], 'access.role_usage_sources');
        $this->app->tag([DetachHistoricalRoleReferences::class], 'access.role_reference_detachers');
        $this->app->bind(PushTransport::class, MinishlinkPushTransport::class);
        $this->app->tag(
            [AccessAccountEraser::class, MinistriesAccountEraser::class, MediaAccountEraser::class, NotificationsAccountEraser::class, AnnouncementsAccountEraser::class, CalendarAccountEraser::class, ChatAccountEraser::class],
            'directory.account_erasers',
        );
        $this->app->when(MediaAccess::class)->needs('$resolvers')->giveTagged('media.owner_resolvers');
        $this->app->tag([AnnouncementMediaOwnerResolver::class, EventMediaOwnerResolver::class], 'media.owner_resolvers');
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Relation::morphMap([
            'announcement' => Announcement::class,
            'message' => Message::class,
            'event' => CalendarEvent::class,
            'event_template' => EventTemplate::class,
        ]);
        Scramble::configure()->withDocumentTransformers(function (OpenApi $document): void {
            // Resource schemas use their short variant name; request schemas use the class name.
            foreach ([TemplateRequest::class => true, UpdateTemplateRequest::class => false, class_basename(EventTemplateResource::class) => null] as $class => $creating) {
                if ($document->components->hasSchema($class)) {
                    $inferred = $document->components->getSchema($class)->type;
                    $document->components->addSchema($class, Schema::fromType(new TemplateSchema($inferred, $creating)));
                }
            }
            foreach ([StoreEventRequest::class => true, UpdateEventRequest::class => false] as $request => $creating) {
                if ($document->components->hasSchema($request)) {
                    $inferred = $document->components->getSchema($request)->type;
                    $document->components->addSchema($request, Schema::fromType(new EventRequestSchema($inferred, $creating)));
                }
            }
            foreach ([StoreAnnouncementRequest::class => true, UpdateAnnouncementRequest::class => false] as $request => $creating) {
                if ($document->components->hasSchema($request)) {
                    $inferred = $document->components->getSchema($request)->type;
                    $document->components->addSchema($request, Schema::fromType(new AnnouncementRequestSchema($inferred, $creating)));
                }
            }
            if ($document->components->hasSchema(MarkNotificationsReadRequest::class)) {
                $document->components->addSchema(MarkNotificationsReadRequest::class, Schema::fromType(new MarkNotificationsReadSchema));
            }
            if ($document->components->hasSchema(UpdateNotificationSettingsRequest::class)) {
                $inferred = $document->components->getSchema(UpdateNotificationSettingsRequest::class)->type;
                $document->components->addSchema(UpdateNotificationSettingsRequest::class, Schema::fromType(new NotificationSettingsSchema($inferred)));
            }

            foreach ($document->paths as $path) {
                if (trim($path->path, '/') === 'notifications/read') {
                    $path->operations['post']->requestBodyObject?->required();
                }

                // Scramble defaults DELETE form validation to query parameters,
                // while this endpoint accepts the browser subscription as JSON.
                if (trim($path->path, '/') === 'push-subscriptions' && isset($path->operations['delete'])) {
                    $delete = $path->operations['delete'];
                    $delete->addRequestBodyObject(RequestBodyObject::make()
                        ->setContent('application/json', Schema::createFromParameters($delete->parameters))
                        ->required());
                    $delete->parameters = [];
                }
            }
        });
        $this->loadMigrationsFrom(glob(app_path('Modules/*/Database/Migrations')) ?: []);
        $this->commands([InstallCommand::class, ErasePersonCommand::class, PruneOrphanMediaCommand::class, GenerateVapidKeysCommand::class, MaterializeCommand::class, SendRemindersCommand::class, BackfillChatsCommand::class]);
        Gate::policy(AuditEntry::class, AuditPolicy::class);
        Gate::policy(Announcement::class, AnnouncementPolicy::class);
        Gate::policy(CalendarEvent::class, EventPolicy::class);
        Gate::policy(Chat::class, ChatPolicy::class);
        Gate::policy(EventSlot::class, EventSlotPolicy::class);
        Gate::policy(EventAssignment::class, EventAssignmentPolicy::class);
        Gate::policy(EventTemplate::class, EventTemplatePolicy::class);
        Gate::policy(Ministry::class, MinistryPolicy::class);
        Gate::policy(Person::class, PersonPolicy::class);
        Gate::policy(Role::class, RolePolicy::class);
        Gate::policy(Setting::class, SettingsPolicy::class);
        Event::listen(PersonRolesChanged::class, BumpPermissionCache::class);
        Event::listen(RoleDeleted::class, BumpPermissionCache::class);
        Event::listen(AnnouncementPublished::class, NotifyAboutAnnouncement::class);
        Event::listen(AssignmentCreated::class, NotifyAboutAssignment::class);
        Event::listen(AssignmentRemoved::class, NotifyAboutAssignment::class);
        Event::listen(EventChanged::class, NotifyAboutEventChange::class);
        Event::listen(EventCancelled::class, NotifyAboutEventCancellation::class);
        Event::listen(EventCreated::class, NotifyAboutNewEvent::class);
        Event::listen(EventReminderDue::class, NotifyAboutReminder::class);
        Event::listen(UserDisabled::class, BumpPermissionCache::class);
        Event::listen(UserDisabled::class, RemovePushSubscriptionsOnDisable::class);
        Event::listen(UserEnabled::class, BumpPermissionCache::class);
        Event::listen(MemberAdded::class, BumpMembershipPermissionCache::class);
        Event::listen(MemberRemoved::class, BumpMembershipPermissionCache::class);
        Event::listen(MemberRolesChanged::class, BumpMembershipPermissionCache::class);
        Event::listen(MinistryArchived::class, BumpMembershipPermissionCache::class);
        Event::listen(MinistryArchived::class, OnMinistryArchived::class);
        Event::listen(MinistryCreated::class, CreateMinistryChatOnCreated::class);
        Event::listen(MemberAdded::class, SyncMinistryChatOnMembership::class);
        Event::listen(MemberRemoved::class, SyncMinistryChatOnMembership::class);
        Event::listen(UserCreated::class, AddNewUserToChats::class);
        Event::listen(MinistryArchived::class, ArchiveChatOnMinistryArchived::class);
    }
}
