<?php

declare(strict_types=1);

use App\Modules\Announcements\Actions\PublishAnnouncement;
use App\Modules\Announcements\AnnouncementScope;
use App\Modules\Announcements\Events\AnnouncementPublished;
use App\Modules\Announcements\Models\Announcement;
use App\Modules\Directory\Models\User;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;

// No RefreshDatabase wrapping transaction: exercise the production transaction manager.
uses(DatabaseMigrations::class);

it('delivers publication only after the outermost commit and never after rollback', function () {
    $author = User::factory()->create();
    $delivered = [];
    Event::listen(AnnouncementPublished::class, function (AnnouncementPublished $event) use (&$delivered): void {
        $delivered[] = [$event->announcementId, DB::transactionLevel(), Announcement::query()->whereKey($event->announcementId)->exists()];
    });
    $attributes = ['scope' => AnnouncementScope::Church, 'title' => 'Собрание', 'body' => 'Текст'];

    $announcement = DB::transaction(function () use ($author, $attributes, &$delivered) {
        $announcement = DB::transaction(fn () => app(PublishAnnouncement::class)->handle($author, $attributes));
        expect($delivered)->toBe([]);

        return $announcement;
    });
    expect($delivered)->toBe([[$announcement->id, 0, true]]);

    $rolledBackId = null;
    try {
        DB::transaction(function () use ($author, $attributes, &$rolledBackId): void {
            $rolledBackId = DB::transaction(fn () => app(PublishAnnouncement::class)->handle($author, $attributes))->id;
            throw new RuntimeException('Attachment validation failed');
        });
    } catch (RuntimeException $exception) {
        expect($exception->getMessage())->toBe('Attachment validation failed');
    }
    expect($delivered)->toHaveCount(1)
        ->and(Announcement::query()->whereKey($rolledBackId)->exists())->toBeFalse();

    $immediate = app(PublishAnnouncement::class)->handle($author, $attributes);
    expect($delivered)->toBe([[$announcement->id, 0, true], [$immediate->id, 0, true]]);
});
