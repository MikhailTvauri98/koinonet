<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE roles ADD CONSTRAINT roles_ministry_fk
            FOREIGN KEY (ministry_id) REFERENCES ministries (id) ON DELETE RESTRICT');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE roles DROP CONSTRAINT roles_ministry_fk');
    }
};
