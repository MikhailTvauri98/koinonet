<?php

declare(strict_types=1);

namespace Tests;

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\ConfigurationUrlParser;
use RuntimeException;

abstract class TestCase extends BaseTestCase
{
    public function createApplication(): Application
    {
        $app = parent::createApplication();
        $config = $app->make('config');
        $names = method_exists($this, 'connectionsToTransact') ? $this->connectionsToTransact() : [null];
        $names[] = null;

        foreach (array_unique($names) as $name) {
            $name ??= $config->get('database.default');
            $connection = $config->get('database.connections.'.$name);
            if (! is_array($connection)) {
                throw new RuntimeException('Unsafe test database configuration: missing connection.');
            }
            // Laravel's own parser includes URL path AND query overrides. It only
            // reads configuration: no connection or SQL is needed before traits.
            $resolved = (new ConfigurationUrlParser)->parseConfiguration($connection);
            // This test environment has no split connections. Refuse them rather
            // than allow a randomly selected read/write variant to bypass checks.
            $safe = ! array_key_exists('read', $resolved) && ! array_key_exists('write', $resolved)
                && (($resolved['driver'] ?? null) === 'sqlite'
                    ? ($resolved['database'] ?? null) === ':memory:'
                    : ($resolved['driver'] ?? null) === 'pgsql' && ($resolved['database'] ?? null) === 'church_test');
            if (! $safe) {
                // Never print URLs or credentials in a failed test log.
                throw new RuntimeException('Unsafe test database configuration: use church_test or SQLite :memory:.');
            }
        }

        return $app;
    }

    protected function setUp(): void
    {
        parent::setUp();

        config()->set('queue.default', 'sync');
    }

    /**
     * Sends the next requests as a different browser: it carries only these cookies,
     * comes from an address of its own, and nothing the previous request left in the
     * guard or the session store is seen.
     *
     * @param  array<string, string>  $cookies  decrypted values, the test client encrypts them
     */
    public function asAnotherBrowser(array $cookies): static
    {
        $this->defaultCookies = $cookies;
        // Login attempts are counted per address; a shared one would let these sign-ins
        // use up the limit of other tests, as the counter can outlive a test run.
        $this->withServerVariables(['REMOTE_ADDR' => fake()->unique()->ipv4()]);
        $this->app->make('auth')->forgetGuards();
        $this->app->make('session')->forgetDrivers();
        // A new guard takes its store from this singleton; left in place, it would
        // keep the previous browser's session and act on that session's row.
        $this->app->forgetInstance('session.store');

        return $this->withCredentials();
    }
}
