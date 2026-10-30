<?php

declare(strict_types=1);

namespace App\Modules\Chat\Console;

use App\Modules\Chat\Actions\CreateMinistryChat;
use App\Modules\Ministries\Models\Ministry;
use Illuminate\Console\Command;

final class BackfillChatsCommand extends Command
{
    protected $signature = 'chat:backfill';

    protected $description = 'Досоздать чаты активных служений и участие аккаунтов';

    public function handle(CreateMinistryChat $create): int
    {
        Ministry::query()->whereNull('archived_at')->each(fn (Ministry $ministry) => $create->handle($ministry));

        return self::SUCCESS;
    }
}
