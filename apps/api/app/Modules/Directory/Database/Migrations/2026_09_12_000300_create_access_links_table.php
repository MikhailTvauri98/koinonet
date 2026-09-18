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
        Schema::create('access_links', function (Blueprint $table): void {
            $table->char('id', 26)->primary();
            $table->char('person_id', 26);
            $table->string('kind', 20);
            $table->string('token_hash', 64)->unique();
            $table->char('created_by_user_id', 26)->nullable();
            $table->timestampTz('expires_at');
            $table->timestampTz('used_at')->nullable();
            $table->timestampTz('revoked_at')->nullable();
            $table->timestampTz('created_at');

            $table->index(['person_id', 'kind']);
            $table->foreign('person_id')->references('id')->on('people')->restrictOnDelete();
            $table->foreign('created_by_user_id')->references('id')->on('users')->restrictOnDelete();
        });

        DB::statement("ALTER TABLE access_links ADD CONSTRAINT access_links_kind_check
            CHECK (kind IN ('invite', 'password_reset'))");
    }

    public function down(): void
    {
        Schema::dropIfExists('access_links');
    }
};
