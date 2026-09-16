<?php

declare(strict_types=1);

use App\Modules\Settings\ChurchSettings;
use App\Support\DomainRuleException;
use App\Support\Phone;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

uses(TestCase::class, RefreshDatabase::class);

it('normalises a local number using the church region', function () {
    app(ChurchSettings::class)->put(['church.phone_region' => 'RU']);

    expect(Phone::normalize('8 (912) 345-67-89'))->toBe('+79123456789');
});

it('passes through null', function () {
    expect(Phone::normalize(null))->toBeNull();
});

it('rejects gibberish with the phone invalid code', function () {
    try {
        Phone::normalize('позвони мне');
    } catch (DomainRuleException $exception) {
        expect($exception->ruleCode)->toBe('phone.invalid');

        return;
    }

    $this->fail('Expected invalid phone input to be rejected.');
});
