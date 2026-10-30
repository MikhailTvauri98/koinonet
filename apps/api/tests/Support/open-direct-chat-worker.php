<?php

declare(strict_types=1);

use App\Modules\Chat\Actions\OpenDirectChat;
use App\Modules\Directory\Models\User;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Support\Facades\DB;

require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
if (DB::connection()->getDatabaseName() !== 'church_test' || config('cache.default') !== 'array') {
    throw new RuntimeException('Unsafe direct-chat test environment.');
}
DB::statement("SET statement_timeout = '15000ms'");
$actor = User::query()->findOrFail($argv[1]);
$partner = User::query()->findOrFail($argv[2]);
echo 'PID='.DB::scalar('select pg_backend_pid()')."\n";
flush();

function waitForDirectChatBarrier(string $path): void
{
    $deadline = microtime(true) + 25;
    while (! is_file($path)) {
        if (microtime(true) >= $deadline) {
            throw new RuntimeException('Direct-chat barrier timed out: '.$path);
        }
        usleep(10000);
        clearstatcache(true, $path);
    }
}

if (isset($argv[4])) {
    waitForDirectChatBarrier($argv[4]);
}
DB::listen(function (QueryExecuted $query) use ($argv): void {
    if (str_contains($query->sql, 'from "users"') && str_contains($query->sql, 'for update')) {
        echo "LOCKED\n";
        flush();
        if (($argv[3] ?? '') !== '') {
            waitForDirectChatBarrier($argv[3]);
        }
    }
});
$result = app(OpenDirectChat::class)->handle($actor, $partner);
echo json_encode(['id' => $result['chat']->id, 'created' => $result['created']], JSON_THROW_ON_ERROR)."\n";
