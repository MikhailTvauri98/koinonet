<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Console;

use Illuminate\Console\Command;
use Minishlink\WebPush\VAPID;

final class GenerateVapidKeysCommand extends Command
{
    protected $signature = 'webpush:vapid';

    protected $description = 'Generate Web Push VAPID keys for the environment';

    public function handle(): int
    {
        $keys = VAPID::createVapidKeys();
        $this->line('VAPID_PUBLIC_KEY='.$keys['publicKey']);
        $this->line('VAPID_PRIVATE_KEY='.$keys['privateKey']);

        return self::SUCCESS;
    }
}
