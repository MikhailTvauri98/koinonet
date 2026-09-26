<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Erasing an account (architecture 7.9) keeps the media it uploaded that
 * still belongs to someone else's object, a ministry cover for one, but
 * drops the link back to the deleted account: `uploader_user_id` becomes
 * null. The foreign key stays as it was.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('media', function (Blueprint $table): void {
            $table->char('uploader_user_id', 26)->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('media', function (Blueprint $table): void {
            $table->char('uploader_user_id', 26)->nullable(false)->change();
        });
    }
};
