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
        Schema::create('media', function (Blueprint $table): void {
            $table->char('id', 26)->primary();
            $table->char('uploader_user_id', 26);
            $table->string('disk', 32);
            $table->string('path');
            $table->string('original_name');
            $table->string('mime', 128);
            $table->bigInteger('size');
            $table->string('kind', 16);
            $table->integer('width')->nullable();
            $table->integer('height')->nullable();
            $table->jsonb('variants')->nullable();
            $table->string('status', 16);
            $table->timestampTz('created_at');

            $table->foreign('uploader_user_id')->references('id')->on('users')->restrictOnDelete();
            $table->index('created_at');
        });

        DB::statement("ALTER TABLE media ADD CONSTRAINT media_kind_check CHECK (kind IN ('image', 'video', 'file'))");
        DB::statement("ALTER TABLE media ADD CONSTRAINT media_status_check
            CHECK (status IN ('processing', 'ready', 'failed'))");

        Schema::create('media_attachments', function (Blueprint $table): void {
            $table->char('id', 26)->primary();
            $table->char('media_id', 26)->unique(); // a file belongs to exactly one object
            $table->string('attachable_type', 64);
            $table->char('attachable_id', 26);
            $table->integer('sort_order')->default(0);
            $table->timestampTz('created_at');

            $table->foreign('media_id')->references('id')->on('media')->restrictOnDelete();
            $table->index(['attachable_type', 'attachable_id']);
        });

        // Direct references: person photo and ministry cover (section 5.8).
        // Created here because the media table they point at appears here.
        Schema::table('people', function (Blueprint $table): void {
            $table->char('photo_media_id', 26)->nullable();
            $table->foreign('photo_media_id')->references('id')->on('media')->restrictOnDelete();
        });

        Schema::table('ministries', function (Blueprint $table): void {
            $table->foreign('cover_media_id')->references('id')->on('media')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('ministries', function (Blueprint $table): void {
            $table->dropForeign(['cover_media_id']);
        });

        Schema::table('people', function (Blueprint $table): void {
            $table->dropForeign(['photo_media_id']);
            $table->dropColumn('photo_media_id');
        });

        Schema::dropIfExists('media_attachments');
        Schema::dropIfExists('media');
    }
};
