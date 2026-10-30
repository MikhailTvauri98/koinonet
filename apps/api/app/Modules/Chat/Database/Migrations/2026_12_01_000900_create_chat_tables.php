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
        Schema::create('chats', function (Blueprint $table) {
            $table->char('id', 26)->primary();
            $table->string('type', 16);
            $table->char('ministry_id', 26)->nullable()->unique();
            $table->char('event_id', 26)->nullable()->unique();
            $table->string('direct_key', 53)->nullable()->unique();
            $table->string('title', 100)->nullable();
            $table->char('avatar_media_id', 26)->nullable();
            $table->char('created_by_user_id', 26)->nullable();
            $table->char('last_message_id', 26)->nullable();
            $table->timestampTz('last_message_at')->nullable();
            $table->timestampTz('archived_at')->nullable();
            $table->timestampsTz();

            $table->foreign('ministry_id')->references('id')->on('ministries')->restrictOnDelete();
            $table->foreign('event_id')->references('id')->on('events')->restrictOnDelete();
            $table->foreign('avatar_media_id')->references('id')->on('media')->restrictOnDelete();
            $table->foreign('created_by_user_id')->references('id')->on('users')->restrictOnDelete();
            $table->index('last_message_at');
        });

        DB::statement("ALTER TABLE chats ADD CONSTRAINT chats_type_check CHECK (
    (type = 'ministry' AND ministry_id IS NOT NULL AND event_id IS NULL AND direct_key IS NULL)
 OR (type = 'event'    AND event_id IS NOT NULL AND ministry_id IS NULL AND direct_key IS NULL)
 OR (type = 'group'    AND ministry_id IS NULL AND event_id IS NULL AND direct_key IS NULL AND title IS NOT NULL)
 OR (type = 'direct'   AND direct_key IS NOT NULL AND ministry_id IS NULL AND event_id IS NULL))");

        Schema::create('chat_members', function (Blueprint $table) {
            $table->char('chat_id', 26);
            $table->char('user_id', 26);
            $table->boolean('is_owner')->default(false);
            $table->timestampTz('muted_until')->nullable();
            $table->char('last_read_message_id', 26)->nullable();
            $table->timestampTz('joined_at');
            $table->primary(['chat_id', 'user_id']);
            $table->foreign('chat_id')->references('id')->on('chats')->restrictOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->restrictOnDelete();
            $table->index('user_id');
        });

        Schema::create('messages', function (Blueprint $table) {
            $table->char('id', 26)->primary();
            $table->char('chat_id', 26);
            $table->char('sender_user_id', 26)->nullable();     // null после стирания отправителя
            $table->text('body')->nullable();
            $table->char('reply_to_id', 26)->nullable();
            $table->timestampTz('edited_at')->nullable();
            $table->timestampTz('deleted_at')->nullable();
            $table->timestampTz('created_at', 6);

            $table->foreign('chat_id')->references('id')->on('chats')->restrictOnDelete();
            $table->foreign('sender_user_id')->references('id')->on('users')->restrictOnDelete();

        });

        DB::statement('ALTER TABLE messages ADD CONSTRAINT messages_body_length_check CHECK (body IS NULL OR char_length(body) <= 4000)');

        Schema::table('messages', function (Blueprint $table) {
            $table->foreign('reply_to_id')->references('id')->on('messages')->restrictOnDelete();
        });

        Schema::table('chats', function (Blueprint $table) {
            $table->foreign('last_message_id')->references('id')->on('messages')->restrictOnDelete();
        });

        Schema::create('chat_pinned_messages', function (Blueprint $table) {
            $table->char('chat_id', 26);
            $table->char('message_id', 26)->unique();
            $table->char('pinned_by_user_id', 26)->nullable();
            $table->timestampTz('pinned_at');
            $table->primary(['chat_id', 'message_id']);
            $table->foreign('chat_id')->references('id')->on('chats')->restrictOnDelete();
            $table->foreign('message_id')->references('id')->on('messages')->restrictOnDelete();
            $table->foreign('pinned_by_user_id')->references('id')->on('users')->restrictOnDelete();
        });
        DB::statement('CREATE INDEX messages_chat_history_index ON messages (chat_id, created_at DESC, id DESC)');

    }

    public function down(): void
    {
        Schema::dropIfExists('chat_pinned_messages');
        Schema::table('chats', function (Blueprint $table) {
            $table->dropForeign(['last_message_id']);
        });
        Schema::dropIfExists('messages');
        Schema::dropIfExists('chat_members');
        Schema::dropIfExists('chats');
    }
};
