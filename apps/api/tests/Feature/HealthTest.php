<?php

declare(strict_types=1);

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;

it('reports database and redis availability', function () {
    DB::shouldReceive('select')->with('select 1')->andReturn([(object) ['result' => 1]]);

    $redis = Mockery::mock();
    $redis->shouldReceive('ping')->andReturn('PONG');
    Redis::shouldReceive('connection')->andReturn($redis);

    $this->getJson('/api/v1/health')
        ->assertOk()
        ->assertJson(['status' => 'ok', 'database' => true, 'redis' => true]);
});

it('reports degraded when the database is unavailable', function () {
    DB::shouldReceive('select')->with('select 1')->andThrow(new RuntimeException('database unavailable'));

    $redis = Mockery::mock();
    $redis->shouldReceive('ping')->andReturn('PONG');
    Redis::shouldReceive('connection')->andReturn($redis);

    $this->getJson('/api/v1/health')
        ->assertStatus(503)
        ->assertJson(['status' => 'degraded', 'database' => false, 'redis' => true]);
});

it('reports degraded when redis is unavailable', function () {
    DB::shouldReceive('select')->with('select 1')->andReturn([(object) ['result' => 1]]);
    Redis::shouldReceive('connection')->andThrow(new RuntimeException('redis unavailable'));

    $this->getJson('/api/v1/health')
        ->assertStatus(503)
        ->assertJson(['status' => 'degraded', 'database' => true, 'redis' => false]);
});

it('reports degraded when redis rejects the ping', function () {
    DB::shouldReceive('select')->with('select 1')->andReturn([(object) ['result' => 1]]);

    $redis = Mockery::mock();
    $redis->shouldReceive('ping')->andReturn(false);
    Redis::shouldReceive('connection')->andReturn($redis);

    $this->getJson('/api/v1/health')
        ->assertStatus(503)
        ->assertJson(['status' => 'degraded', 'database' => true, 'redis' => false]);
});
