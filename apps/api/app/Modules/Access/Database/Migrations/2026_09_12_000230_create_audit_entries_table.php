<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('audit_entries', function (Blueprint $table): void {
            $table->char('id', 26)->primary();
            $table->char('actor_user_id', 26)->nullable();
            $table->string('action', 64);
            $table->string('subject_type', 64)->nullable();
            $table->char('subject_id', 26)->nullable();
            $table->jsonb('payload')->nullable();
            $table->string('ip', 45)->nullable();
            $table->timestampTz('created_at');

            $table->index(['created_at', 'id']);
            $table->index('actor_user_id');
            $table->index('action');
            $table->index(['subject_type', 'subject_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_entries');
    }
};
