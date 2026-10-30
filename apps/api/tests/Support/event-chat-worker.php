<?php

declare(strict_types=1);

use App\Modules\Calendar\Actions\AssignPerson;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Chat\Actions\CreateEventChat;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Support\Facades\DB;

require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
if (DB::connection()->getDatabaseName() !== 'church_test' || config('cache.default') !== 'array') {
    throw new RuntimeException('Unsafe event-chat test environment.');
}
DB::statement("SET statement_timeout = '15000ms'");
$actor = User::query()->findOrFail($argv[2]);
echo 'PID='.DB::scalar('select pg_backend_pid()')."\n";
flush();

function waitForEventChatBarrier(string $path): void
{
    $deadline = microtime(true) + 25;
    while (! is_file($path)) {
        if (microtime(true) >= $deadline) {
            throw new RuntimeException('Event-chat barrier timed out: '.$path);
        }
        usleep(10000);
        clearstatcache(true, $path);
    }
}

if ($argv[1] === 'create') {
    DB::listen(function (QueryExecuted $query) use ($argv): void {
        if (str_contains($query->sql, 'select distinct "person_id" from "event_assignments"')) {
            echo "SNAPSHOT\n";
            flush();
            waitForEventChatBarrier($argv[4]);
        }
    });
    $result = app(CreateEventChat::class)->handle(Event::query()->findOrFail($argv[3]), $actor);
    echo json_encode(['id' => $result['chat']->id, 'created' => $result['created']], JSON_THROW_ON_ERROR)."\n";
} else {
    waitForEventChatBarrier($argv[5]);
    app(AssignPerson::class)->handle($actor, EventSlot::query()->findOrFail($argv[3]), Person::query()->findOrFail($argv[4]));
    echo "ASSIGNED\n";
}
