<?php

declare(strict_types=1);

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

require __DIR__.'/../../vendor/autoload.php';

// Bootstrap metadata only, with an unreachable host. Never open a DB connection.
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
$config = $app->make('config')->all();
$config['database']['default'] = 'pgsql';
$config['database']['connections']['pgsql'] = [
    'driver' => 'pgsql', 'host' => '127.0.0.1', 'port' => 1,
    'database' => 'church_test', 'username' => 'unused', 'password' => 'unused',
    'url' => $argv[1],
];
if (($argv[2] ?? '') === 'split') {
    $config['database']['connections']['pgsql']['write'] = [['database' => 'unsafe_probe']];
}
if (($argv[2] ?? '') === 'sqlite') {
    $config['database']['default'] = 'sqlite';
    $config['database']['connections']['sqlite'] = ['driver' => 'sqlite', 'database' => ':memory:'];
}
$cache = tempnam(sys_get_temp_dir(), 'test-db-guard-');
file_put_contents($cache, '<?php return '.var_export($config, true).';');
putenv('APP_CONFIG_CACHE='.$cache);

try {
    $probe = new class('probe') extends TestCase
    {
        use RefreshDatabase;

        public function probe(): void
        {
            $this->setUp();
        }

        public function refreshDatabase(): void
        {
            // Sentinel replaces ALL migration/SQL work, including in the RED run.
            throw new LogicException('REFRESH_DATABASE_REACHED');
        }
    };
    $probe->probe();
} catch (Throwable $exception) {
    echo $exception->getMessage();
} finally {
    unlink($cache);
}
