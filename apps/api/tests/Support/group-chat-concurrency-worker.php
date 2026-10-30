<?php

declare(strict_types=1);

use App\Modules\Chat\Actions\SendMessage;
use App\Modules\Chat\Actions\UpdateGroupChat;
use App\Modules\Chat\Events\ChatMetadataChanged;
use App\Modules\Chat\Events\MessageSent;
use App\Modules\Chat\Models\Chat;
use App\Modules\Directory\Models\User;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;

require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
if (DB::connection()->getDatabaseName() !== 'church_test' || config('cache.default') !== 'array') {
    throw new RuntimeException('Unsafe group-chat concurrency test environment.');
}
DB::statement("SET statement_timeout = '15000ms'");
Event::fake([MessageSent::class, ChatMetadataChanged::class]);
$actor = User::query()->findOrFail($argv[2]);
$chat = Chat::query()->findOrFail($argv[3]);
echo 'PID='.DB::scalar('select pg_backend_pid()')."\nREADY\n";
flush();

function waitForGroupChatBarrier(string $path): void
{
    $deadline = microtime(true) + 25;
    while (! is_file($path)) {
        if (microtime(true) >= $deadline) {
            throw new RuntimeException('Group-chat concurrency barrier timed out: '.$path);
        }
        usleep(10000);
        clearstatcache(true, $path);
    }
}

try {
    if ($argv[1] === 'send') {
        $paused = false;
        DB::listen(function (QueryExecuted $query) use ($argv, &$paused): void {
            if (! $paused && str_contains($query->sql, 'from "chats"') && str_contains($query->sql, 'for update')) {
                $paused = true;
                echo "CHAT_LOCKED\n";
                flush();
                waitForGroupChatBarrier($argv[4]);
            }
        });
        app(SendMessage::class)->handle($actor, $chat, 'Параллельное сообщение', [], null);
        echo "SENT\n";
    } else {
        waitForGroupChatBarrier($argv[4]);
        DB::listen(function (QueryExecuted $query): void {
            if (str_contains($query->sql, 'from "users"') && str_contains($query->sql, 'for ')) {
                echo "USER_LOCKED\n";
                flush();
            }
        });
        app(UpdateGroupChat::class)->handle($actor, $chat, 'Новое');
        echo "RENAMED\n";
    }

} catch (Throwable $exception) {
    fwrite(STDERR, (string) $exception);
    exit(1);
}
