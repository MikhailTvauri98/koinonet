<?php

declare(strict_types=1);

use App\Modules\Announcements\Actions\PublishAnnouncement;
use App\Modules\Announcements\Actions\UpdateAnnouncement;
use App\Modules\Announcements\AnnouncementScope;
use App\Modules\Announcements\Events\AnnouncementPublished;
use App\Modules\Announcements\Models\Announcement;
use App\Modules\Directory\Models\User;
use App\Modules\Media\Models\Media;
use App\Modules\Media\Models\MediaAttachment;
use App\Support\DomainRuleException;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Storage;

// Real transaction manager: RefreshDatabase's enclosing rollback would hide commit callbacks.
uses(DatabaseMigrations::class);

beforeEach(fn () => Storage::fake('media'));

it('removes detached originals and variants only after the outer commit and preserves them on rollback', function () {
    $author = User::factory()->create();
    $keep = Media::factory()->create(['uploader_user_id' => $author->id]);
    $drop = Media::factory()->create(['uploader_user_id' => $author->id, 'variants' => ['thumb' => 'thumb.webp', 'large' => 'large.webp']]);
    foreach ($drop->storedPaths() as $path) {
        Storage::disk('media')->put($path, 'bytes');
    }
    $announcement = app(PublishAnnouncement::class)->handle($author, [
        'scope' => AnnouncementScope::Church, 'title' => 'Собрание', 'body' => 'Текст', 'media_ids' => [$keep->id, $drop->id],
    ]);
    $replace = function () use ($announcement, $author, $keep, $drop): void {
        app(UpdateAnnouncement::class)->handle($announcement, ['media_ids' => [$keep->id]], $author);
        expect(Media::query()->whereKey($drop->id)->exists())->toBeFalse();
        Storage::disk('media')->assertExists($drop->storedPaths());
    };
    try {
        DB::transaction(function () use ($replace): void {
            $replace();
            throw new RuntimeException('Outer rollback');
        });
    } catch (RuntimeException $exception) {
        expect($exception->getMessage())->toBe('Outer rollback');
    }
    expect(Media::query()->whereKey($drop->id)->exists())->toBeTrue()
        ->and(MediaAttachment::query()->orderBy('sort_order')->pluck('media_id')->all())->toBe([$keep->id, $drop->id]);
    Storage::disk('media')->assertExists($drop->storedPaths());

    DB::transaction($replace);
    expect(MediaAttachment::query()->pluck('media_id')->all())->toBe([$keep->id]);
    Storage::disk('media')->assertMissing($drop->storedPaths());

    app(UpdateAnnouncement::class)->handle($announcement, ['media_ids' => []], $author);
    expect(MediaAttachment::query()->count())->toBe(0)->and(Media::query()->whereKey($keep->id)->exists())->toBeFalse();
});

it('does not deliver publication after failed attachment sync and delivers complete links after commit', function () {
    $author = User::factory()->create();
    $own = Media::factory()->create(['uploader_user_id' => $author->id]);
    $foreign = Media::factory()->create();
    $delivered = [];
    Event::listen(AnnouncementPublished::class, function (AnnouncementPublished $event) use (&$delivered): void {
        $delivered[] = [DB::transactionLevel(), MediaAttachment::query()->where('attachable_id', $event->announcementId)->pluck('media_id')->all()];
    });
    $attributes = ['scope' => AnnouncementScope::Church, 'title' => 'Собрание', 'body' => 'Текст'];
    expect(fn () => app(PublishAnnouncement::class)->handle($author, [...$attributes, 'media_ids' => [$own->id, $foreign->id]]))
        ->toThrow(DomainRuleException::class);
    expect($delivered)->toBe([])->and(Announcement::query()->count())->toBe(0)
        ->and(MediaAttachment::query()->count())->toBe(0);
    DB::transaction(function () use ($author, $attributes, $own, &$delivered): void {
        app(PublishAnnouncement::class)->handle($author, [...$attributes, 'media_ids' => [$own->id]]);
        expect($delivered)->toBe([]);
    });
    expect($delivered)->toBe([[0, [$own->id]]]);
});
