<?php

declare(strict_types=1);

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
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
