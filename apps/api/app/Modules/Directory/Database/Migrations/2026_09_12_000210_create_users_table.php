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
        Schema::create('users', function (Blueprint $table): void {
            $table->char('id', 26)->primary();
            $table->char('person_id', 26)->unique();
            $table->string('phone', 20)->nullable()->unique();
            $table->string('email', 254)->nullable()->unique();
            $table->string('password');
            $table->rememberToken();
            $table->string('ical_token', 64)->unique();
            $table->timestampTz('last_login_at')->nullable();
            $table->timestampTz('disabled_at')->nullable();
            $table->timestampsTz();

            $table->foreign('person_id')->references('id')->on('people')->restrictOnDelete();
        });

        DB::statement('ALTER TABLE users ADD CONSTRAINT users_login_present_check
            CHECK (phone IS NOT NULL OR email IS NOT NULL)');
    }

    public function down(): void
    {
        Schema::dropIfExists('users');
    }
};
