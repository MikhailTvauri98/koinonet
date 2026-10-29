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
use App\Modules\Directory\Console\ErasePersonCommand;
use App\Modules\Directory\Console\InstallCommand;
use App\Modules\Directory\Contracts\SharedMinistryFinder;
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
use App\Modules\Ministries\Listeners\BumpMembershipPermissionCache;
use App\Modules\Ministries\Models\Ministry;
use App\Modules\Ministries\Policies\MinistryPolicy;
use App\Modules\Notifications\Http\Requests\MarkNotificationsReadRequest;
use App\Modules\Notifications\OpenApi\MarkNotificationsReadSchema;
use App\Modules\Settings\Models\Setting;
use App\Modules\Settings\Policies\SettingsPolicy;
use Dedoc\Scramble\Scramble;
use Dedoc\Scramble\Support\Generator\OpenApi;
use Dedoc\Scramble\Support\Generator\Schema;
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
        $this->app->tag(
            [AccessAccountEraser::class, MinistriesAccountEraser::class, MediaAccountEraser::class],
            'directory.account_erasers',
        );
        $this->app->when(MediaAccess::class)->needs('$resolvers')->giveTagged('media.owner_resolvers');
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Scramble::configure()->withDocumentTransformers(function (OpenApi $document): void {
            if ($document->components->hasSchema(MarkNotificationsReadRequest::class)) {
                $document->components->addSchema(MarkNotificationsReadRequest::class, Schema::fromType(new MarkNotificationsReadSchema));
            }

            foreach ($document->paths as $path) {
                if (trim($path->path, '/') === 'notifications/read') {
                    $path->operations['post']->requestBodyObject?->required();
                }
            }
        });
        $this->loadMigrationsFrom(glob(app_path('Modules/*/Database/Migrations')) ?: []);
        $this->commands([InstallCommand::class, ErasePersonCommand::class, PruneOrphanMediaCommand::class]);
        Gate::policy(AuditEntry::class, AuditPolicy::class);
        Gate::policy(Ministry::class, MinistryPolicy::class);
        Gate::policy(Person::class, PersonPolicy::class);
        Gate::policy(Role::class, RolePolicy::class);
        Gate::policy(Setting::class, SettingsPolicy::class);
        Event::listen(PersonRolesChanged::class, BumpPermissionCache::class);
        Event::listen(RoleDeleted::class, BumpPermissionCache::class);
        Event::listen(UserDisabled::class, BumpPermissionCache::class);
        Event::listen(UserEnabled::class, BumpPermissionCache::class);
        Event::listen(MemberAdded::class, BumpMembershipPermissionCache::class);
        Event::listen(MemberRemoved::class, BumpMembershipPermissionCache::class);
        Event::listen(MemberRolesChanged::class, BumpMembershipPermissionCache::class);
        Event::listen(MinistryArchived::class, BumpMembershipPermissionCache::class);
    }
}
