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
        Schema::create('event_templates', function (Blueprint $table) {
            $table->char('id', 26)->primary();
            $table->string('owner_type', 16);
            $table->char('ministry_id', 26)->nullable();
            $table->string('title', 200);
            $table->text('description')->nullable();
            $table->string('location', 200)->nullable();
            $table->string('visibility', 16);
            $table->time('start_time');
            $table->integer('duration_minutes');
            $table->jsonb('recurrence')->nullable();
            $table->boolean('active')->default(true);
            $table->date('generated_until')->nullable();
            $table->char('created_by_user_id', 26)->nullable();
            $table->timestampTz('archived_at')->nullable();
            $table->timestampsTz();

            $table->foreign('ministry_id')->references('id')->on('ministries')->restrictOnDelete();
            $table->foreign('created_by_user_id')->references('id')->on('users')->restrictOnDelete();
            $table->index(['owner_type', 'ministry_id']);
        });

        DB::statement("ALTER TABLE event_templates ADD CONSTRAINT event_templates_owner_check
            CHECK ((owner_type = 'church' AND ministry_id IS NULL) OR (owner_type = 'ministry' AND ministry_id IS NOT NULL))");
        DB::statement("ALTER TABLE event_templates ADD CONSTRAINT event_templates_visibility_check
            CHECK (visibility IN ('church', 'ministry', 'assigned') AND NOT (owner_type = 'church' AND visibility = 'ministry'))");
        DB::statement('ALTER TABLE event_templates ADD CONSTRAINT event_templates_duration_check CHECK (duration_minutes > 0)');

        Schema::create('events', function (Blueprint $table) {
            $table->char('id', 26)->primary();
            $table->string('owner_type', 16);
            $table->char('ministry_id', 26)->nullable();
            $table->char('template_id', 26)->nullable();
            $table->date('occurrence_date')->nullable();
            $table->string('title', 200);
            $table->text('description')->nullable();
            $table->string('location', 200)->nullable();
            $table->timestampTz('starts_at');
            $table->timestampTz('ends_at');
            $table->string('visibility', 16);
            $table->string('status', 16)->default('scheduled');
            $table->timestampTz('cancelled_at')->nullable();
            $table->string('cancel_reason', 500)->nullable();
            $table->char('created_by_user_id', 26)->nullable();
            $table->timestampTz('archived_at')->nullable();
            $table->timestampsTz();

            $table->foreign('ministry_id')->references('id')->on('ministries')->restrictOnDelete();
            $table->foreign('template_id')->references('id')->on('event_templates')->restrictOnDelete();
            $table->foreign('created_by_user_id')->references('id')->on('users')->restrictOnDelete();
            $table->index('starts_at');
            $table->index(['ministry_id', 'starts_at']);
        });

        DB::statement("ALTER TABLE events ADD CONSTRAINT events_owner_check
            CHECK ((owner_type = 'church' AND ministry_id IS NULL) OR (owner_type = 'ministry' AND ministry_id IS NOT NULL))");
        DB::statement("ALTER TABLE events ADD CONSTRAINT events_visibility_check
            CHECK (visibility IN ('church', 'ministry', 'assigned') AND NOT (owner_type = 'church' AND visibility = 'ministry'))");
        DB::statement("ALTER TABLE events ADD CONSTRAINT events_status_check CHECK (status IN ('scheduled', 'cancelled'))");
        DB::statement('ALTER TABLE events ADD CONSTRAINT events_time_check CHECK (ends_at > starts_at)');
        DB::statement('CREATE UNIQUE INDEX events_template_occurrence_idx ON events (template_id, occurrence_date) WHERE template_id IS NOT NULL');

        Schema::create('event_slots', function (Blueprint $table) {
            $table->char('id', 26)->primary();
            $table->char('event_id', 26);
            $table->string('label', 100);
            $table->string('resource_type', 16)->default('person');
            $table->char('role_id', 26)->nullable();
            $table->smallInteger('required_count');
            $table->integer('sort_order')->default(0);
            $table->timestampTz('archived_at')->nullable();
            $table->timestampsTz();

            $table->foreign('event_id')->references('id')->on('events')->restrictOnDelete();
            $table->foreign('role_id')->references('id')->on('roles')->restrictOnDelete();
            $table->index('event_id');
            $table->index('role_id');
        });

        DB::statement("ALTER TABLE event_slots ADD CONSTRAINT event_slots_resource_check CHECK (resource_type IN ('person'))");
        DB::statement('ALTER TABLE event_slots ADD CONSTRAINT event_slots_count_check CHECK (required_count > 0)');

        Schema::create('event_template_slots', function (Blueprint $table) {
            $table->char('id', 26)->primary();
            $table->char('template_id', 26);
            $table->string('label', 100);
            $table->string('resource_type', 16)->default('person');
            $table->char('role_id', 26)->nullable();
            $table->smallInteger('required_count');
            $table->integer('sort_order')->default(0);
            $table->timestampTz('archived_at')->nullable();
            $table->timestampsTz();

            $table->foreign('template_id')->references('id')->on('event_templates')->restrictOnDelete();
            $table->foreign('role_id')->references('id')->on('roles')->restrictOnDelete();
            $table->index('role_id');
        });

        DB::statement("ALTER TABLE event_template_slots ADD CONSTRAINT event_template_slots_resource_check CHECK (resource_type IN ('person'))");
        DB::statement('ALTER TABLE event_template_slots ADD CONSTRAINT event_template_slots_count_check CHECK (required_count > 0)');

        Schema::create('event_assignments', function (Blueprint $table) {
            $table->char('id', 26)->primary();
            $table->char('slot_id', 26);
            $table->string('resource_type', 16)->default('person');
            $table->char('person_id', 26)->nullable();
            $table->char('assigned_by_user_id', 26)->nullable();
            $table->timestampTz('created_at');
            $table->timestampTz('archived_at')->nullable();

            $table->foreign('slot_id')->references('id')->on('event_slots')->restrictOnDelete();
            $table->foreign('person_id')->references('id')->on('people')->restrictOnDelete();
            $table->foreign('assigned_by_user_id')->references('id')->on('users')->restrictOnDelete();

            $table->index('person_id');
        });

        DB::statement('CREATE UNIQUE INDEX event_assignments_active_person_idx ON event_assignments (slot_id, person_id) WHERE archived_at IS NULL');

        DB::statement("ALTER TABLE event_assignments ADD CONSTRAINT event_assignments_resource_check
            CHECK (resource_type = 'person' AND person_id IS NOT NULL)");

        Schema::create('event_reminders', function (Blueprint $table) {
            $table->char('event_id', 26);
            $table->string('kind', 8);
            $table->timestampTz('sent_at');
            $table->primary(['event_id', 'kind']);
            $table->foreign('event_id')->references('id')->on('events')->restrictOnDelete();
        });

        DB::statement("ALTER TABLE event_reminders ADD CONSTRAINT event_reminders_kind_check CHECK (kind IN ('h24', 'h2'))");
    }

    public function down(): void
    {
        Schema::dropIfExists('event_reminders');
        Schema::dropIfExists('event_assignments');
        Schema::dropIfExists('event_template_slots');
        Schema::dropIfExists('event_slots');
        Schema::dropIfExists('events');
        Schema::dropIfExists('event_templates');
    }
};
