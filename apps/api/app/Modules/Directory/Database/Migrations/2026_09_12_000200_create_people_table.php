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
        DB::statement('CREATE EXTENSION IF NOT EXISTS pg_trgm');

        Schema::create('people', function (Blueprint $table): void {
            $table->char('id', 26)->primary();
            $table->string('last_name', 100);
            $table->string('first_name', 100);
            $table->string('patronymic', 100)->nullable();
            $table->string('phone', 20)->nullable();
            $table->string('email', 254)->nullable();
            $table->date('birth_date')->nullable();
            $table->string('status', 16);
            $table->text('note')->nullable();
            $table->boolean('contacts_public')->default(false);
            $table->timestampTz('archived_at')->nullable();
            $table->timestampsTz();
        });

        DB::statement("ALTER TABLE people ADD CONSTRAINT people_status_check
            CHECK (status IN ('member', 'attendee', 'guest'))");
        DB::statement("CREATE INDEX people_name_trgm_idx ON people
            USING gin (lower(last_name || ' ' || first_name) gin_trgm_ops)");
        DB::statement('CREATE INDEX people_active_idx ON people (last_name, first_name) WHERE archived_at IS NULL');
    }

    public function down(): void
    {
        Schema::dropIfExists('people');
    }
};
