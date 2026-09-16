<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('roles', function (Blueprint $table): void {
            $table->char('id', 26)->primary();
            $table->string('scope', 16);
            $table->char('ministry_id', 26)->nullable();
            $table->string('name', 100);
            $table->text('description')->nullable();
            $table->boolean('is_system')->default(false);
            $table->timestampsTz();
            $table->unique(['id', 'ministry_id']);
        });

        DB::statement("ALTER TABLE roles ADD CONSTRAINT roles_scope_check
            CHECK ((scope = 'global' AND ministry_id IS NULL)
                OR (scope = 'ministry' AND ministry_id IS NOT NULL))");
        DB::statement("CREATE UNIQUE INDEX roles_global_name_idx ON roles (name) WHERE scope = 'global'");
        DB::statement("CREATE UNIQUE INDEX roles_ministry_name_idx ON roles (ministry_id, name) WHERE scope = 'ministry'");
        DB::statement('CREATE UNIQUE INDEX roles_single_system_idx ON roles ((true)) WHERE is_system');

        Schema::create('role_permissions', function (Blueprint $table): void {
            $table->char('role_id', 26);
            $table->string('permission', 64);
            $table->primary(['role_id', 'permission']);
            $table->foreign('role_id')->references('id')->on('roles')->restrictOnDelete();
        });

        Schema::create('person_roles', function (Blueprint $table): void {
            $table->char('person_id', 26);
            $table->char('role_id', 26);
            $table->char('assigned_by_user_id', 26)->nullable();
            $table->timestampTz('created_at');
            $table->primary(['person_id', 'role_id']);
            $table->foreign('person_id')->references('id')->on('people')->restrictOnDelete();
            $table->foreign('role_id')->references('id')->on('roles')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('person_roles');
        Schema::dropIfExists('role_permissions');
        Schema::dropIfExists('roles');
    }
};
