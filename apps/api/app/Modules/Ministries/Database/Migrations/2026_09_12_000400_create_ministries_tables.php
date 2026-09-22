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
        Schema::create('ministries', function (Blueprint $table): void {
            $table->char('id', 26)->primary();
            $table->string('name', 100);
            $table->text('description')->nullable();
            $table->char('cover_media_id', 26)->nullable();
            $table->char('default_role_id', 26)->nullable();
            $table->timestampTz('archived_at')->nullable();
            $table->timestampsTz();

            $table->foreign('default_role_id')->references('id')->on('roles')->restrictOnDelete();
        });

        DB::statement('CREATE UNIQUE INDEX ministries_active_name_idx ON ministries (name) WHERE archived_at IS NULL');

        Schema::create('ministry_members', function (Blueprint $table): void {
            $table->char('id', 26)->primary();
            $table->char('ministry_id', 26);
            $table->char('person_id', 26);
            $table->timestampTz('joined_at');
            $table->char('added_by_user_id', 26)->nullable();

            $table->unique(['ministry_id', 'person_id']);
            $table->unique(['id', 'ministry_id']);
            $table->foreign('ministry_id')->references('id')->on('ministries')->restrictOnDelete();
            $table->foreign('person_id')->references('id')->on('people')->restrictOnDelete();
        });

        Schema::create('ministry_member_roles', function (Blueprint $table): void {
            $table->char('member_id', 26);
            $table->char('role_id', 26);
            $table->char('ministry_id', 26);

            $table->primary(['member_id', 'role_id']);
        });

        // Composite keys: a member always carries a role of their own ministry (invariant 6.3.8)
        DB::statement('ALTER TABLE ministry_member_roles ADD CONSTRAINT mmr_member_fk
            FOREIGN KEY (member_id, ministry_id) REFERENCES ministry_members (id, ministry_id) ON DELETE RESTRICT');
        DB::statement('ALTER TABLE ministry_member_roles ADD CONSTRAINT mmr_role_fk
            FOREIGN KEY (role_id, ministry_id) REFERENCES roles (id, ministry_id) ON DELETE RESTRICT');
    }

    public function down(): void
    {
        Schema::dropIfExists('ministry_member_roles');
        Schema::dropIfExists('ministry_members');
        Schema::dropIfExists('ministries');
    }
};
