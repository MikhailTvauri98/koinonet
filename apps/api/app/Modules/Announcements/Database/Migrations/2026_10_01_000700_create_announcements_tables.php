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
        Schema::create('announcements', function (Blueprint $table): void {
            $table->char('id', 26)->primary();
            $table->string('scope', 16);
            $table->char('ministry_id', 26)->nullable();
            $table->char('author_user_id', 26)->nullable();
            $table->string('title', 200);
            $table->text('body');
            $table->timestampTz('pinned_at')->nullable();
            $table->date('hide_after')->nullable();
            $table->boolean('notify_on_publish')->default(true);
            $table->timestampTz('published_at');
            $table->timestampTz('archived_at')->nullable();
            $table->timestampsTz();
            $table->foreign('ministry_id')->references('id')->on('ministries')->restrictOnDelete();
            $table->foreign('author_user_id')->references('id')->on('users')->restrictOnDelete();
            $table->index(['scope', 'ministry_id', 'published_at']);
        });
        DB::statement("ALTER TABLE announcements ADD CONSTRAINT announcements_scope_check CHECK (
            (scope = 'church' AND ministry_id IS NULL) OR (scope = 'ministry' AND ministry_id IS NOT NULL)
        )");
        Schema::create('announcement_views', function (Blueprint $table): void {
            $table->char('announcement_id', 26);
            $table->char('user_id', 26);
            $table->timestampTz('viewed_at');
            $table->primary(['announcement_id', 'user_id']);
            $table->foreign('announcement_id')->references('id')->on('announcements')->restrictOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('announcement_views');
        Schema::dropIfExists('announcements');
    }
};
