<?php

declare(strict_types=1);

use App\Modules\Announcements\MarkdownCleaner;

it('keeps the allowed markdown subset', function () {
    $md = "# Собрание\n\nВ **воскресенье** в *10:00*.\n\n- пункт\n- ещё\n\n[Карта](https://maps.example/x)";

    expect((new MarkdownCleaner)->clean($md))->toBe($md);
});

it('strips raw html', function () {
    expect((new MarkdownCleaner)->clean('Привет <script>alert(1)</script><b>мир</b>'))->toBe('Привет alert(1)мир');
});

it('neutralises unsafe link schemes', function () {
    expect((new MarkdownCleaner)->clean('[тык](javascript:alert(1))'))->toBe('[тык]()');
});

it('keeps mailto, tel and relative links', function () {
    $md = '[почта](mailto:a@b.c) [тел](tel:+79123456789) [внутри](/announcements/1)';

    expect((new MarkdownCleaner)->clean($md))->toBe($md);
});

it('turns images into their alt text', function () {
    expect((new MarkdownCleaner)->clean('![схема](https://x/y.png)'))->toBe('схема');
});

it('keeps balanced destinations and ordinary relative links', function (string $markdown) {
    expect((new MarkdownCleaner)->clean($markdown))->toBe($markdown);
})->with([
    '[карта](https://example.com/a_(b))',
    '[внутри](../announcements/1) [рядом](./one) [путь](one/two) [фрагмент](#part) [query](?page=2)',
    '[карта](<https://example.com/a_(b)> "Карта")',
    '[карта][map]'."\n\n".'[map]: https://example.com/a_(b)',
    "[внутри][relative]\n\n[relative]:\n ../announcements/1",
]);

it('neutralises forbidden schemes including reference links', function (string $markdown, string $expected) {
    expect((new MarkdownCleaner)->clean($markdown))->toBe($expected);
})->with([
    ['[x](JaVaScRiPt:alert(foo(1)))', '[x]()'],
    ['[x](data:text/html,hello)', '[x]()'],
    ['[x](vbscript:one)', '[x]()'],
    ['[x](javascript&#58;alert(1))', '[x]()'],
    ["[x][bad]\n\n[bad]: javascript:alert(1)", "[x][bad]\n\n[bad]: <>"],
    ["[x][bad]\n\n[bad]:\n javascript:alert(1)", "[x][bad]\n\n[bad]: <>"],
]);

it('removes image syntax with balanced destinations and references', function () {
    expect((new MarkdownCleaner)->clean('![схема](https://x/a_(b).png)'))->toBe('схема')
        ->and((new MarkdownCleaner)->clean("![схема][image]\n\n[image]: https://x/y.png"))
        ->toBe("схема\n\n[image]: https://x/y.png");
});

it('neutralises unsafe autolinks and keeps allowed autolinks', function () {
    expect((new MarkdownCleaner)->clean('<javascript:alert(1)>'))->toBe('javascript:alert(1)')
        ->and((new MarkdownCleaner)->clean('<https://example.com>'))->toBe('<https://example.com>');
});
