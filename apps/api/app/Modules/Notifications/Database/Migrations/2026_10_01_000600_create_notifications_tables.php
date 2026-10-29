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
        Schema::create('notifications', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('type');
            $table->string('notifiable_type', 64);
            $table->char('notifiable_id', 26);
            $table->jsonb('data');
            $table->timestampTz('read_at')->nullable();
            $table->timestampsTz();
            $table->index(['notifiable_type', 'notifiable_id', 'created_at']);
        });

        DB::statement('CREATE INDEX notifications_unread_idx ON notifications (notifiable_id) WHERE read_at IS NULL');

        Schema::create('notification_settings', function (Blueprint $table): void {
            $table->char('user_id', 26);
            $table->string('category', 20);
            $table->boolean('enabled');
            $table->primary(['user_id', 'category']);
            $table->foreign('user_id')->references('id')->on('users')->restrictOnDelete();
        });

        DB::statement("ALTER TABLE notification_settings ADD CONSTRAINT notification_settings_category_check
            CHECK (category IN ('announcements', 'chat', 'assignments', 'reminders'))");

        Schema::create('push_subscriptions', function (Blueprint $table): void {
            $table->char('id', 26)->primary();
            $table->char('user_id', 26);
            $table->text('endpoint')->unique();
            $table->string('public_key', 255);
            $table->string('auth_token', 255);
            $table->string('content_encoding', 16)->default('aes128gcm');
            $table->string('user_agent', 255)->nullable();
            $table->timestampTz('created_at');
            $table->timestampTz('last_success_at')->nullable();
            $table->smallInteger('failures')->default(0);
            $table->foreign('user_id')->references('id')->on('users')->restrictOnDelete();
            $table->index('user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('push_subscriptions');
        Schema::dropIfExists('notification_settings');
        Schema::dropIfExists('notifications');
    }
};
