<?php

declare(strict_types=1);

namespace App\Providers;

use App\Modules\Access\Contracts\MinistryPermissionSource;
use App\Modules\Access\EmptyMinistryPermissionSource;
use App\Modules\Access\Models\AuditEntry;
use App\Modules\Access\Policies\AuditPolicy;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->bind(MinistryPermissionSource::class, EmptyMinistryPermissionSource::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->loadMigrationsFrom(glob(app_path('Modules/*/Database/Migrations')) ?: []);
        Gate::policy(AuditEntry::class, AuditPolicy::class);
    }
}
