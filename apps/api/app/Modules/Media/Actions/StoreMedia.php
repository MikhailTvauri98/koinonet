<?php

declare(strict_types=1);

namespace App\Modules\Media\Actions;

use App\Modules\Directory\Models\User;
use App\Modules\Media\HeifImage;
use App\Modules\Media\Jobs\ProcessUploadedImage;
use App\Modules\Media\MediaKind;
use App\Modules\Media\MediaStatus;
use App\Modules\Media\Models\Media;
use App\Support\DomainRuleException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;

final readonly class StoreMedia
{
    private const DISK = 'media';

    public function handle(UploadedFile $file, User $uploader): Media
    {
        // Content-based detection (finfo under Symfony's File::getMimeType), never the
        // client's Content-Type header and never the uploaded filename's extension.
        $mime = (string) $file->getMimeType();

        $kind = MediaKind::forMime($mime);

        if ($kind === null) {
            throw DomainRuleException::because('media.type_not_allowed', 'Этот тип файла не поддерживается.');
        }

        $nameExtension = mb_strtolower(pathinfo($file->getClientOriginalName(), PATHINFO_EXTENSION));

        if (! in_array($nameExtension, (array) config('media.extensions'), true)) {
            throw DomainRuleException::because(
                'media.extension_not_allowed',
                'Медиафайл с таким расширением не принимается.',
            );
        }

        $extension = $kind->extensionForMime($mime)
            ?? throw new RuntimeException("media.limits config has no extension for mime {$mime}.");

        if ($file->getSize() > $kind->maxSize()) {
            throw DomainRuleException::because(
                'media.too_large',
                'Файл превышает допустимый размер для этого вида.',
            );
        }

        if (HeifImage::is($mime) && ! config('media.heic_supported')) {
            throw DomainRuleException::because(
                'media.heic_unsupported',
                'Изображения HEIC и HEIF сервер не принимает, выберите другой формат изображения.',
            );
        }

        $directory = now()->format('Y/m');
        $filename = sprintf('%s.%s', (string) Str::ulid(), $extension);
        $path = "{$directory}/{$filename}";

        $stored = Storage::disk(self::DISK)->putFileAs($directory, $file, $filename);

        if ($stored === false) {
            throw new RuntimeException('Could not write the uploaded file to the media disk.');
        }

        $media = Media::query()->create([
            'uploader_user_id' => $uploader->id,
            'disk' => self::DISK,
            'path' => $path,
            'original_name' => $file->getClientOriginalName(),
            'mime' => $mime,
            'size' => $file->getSize(),
            'kind' => $kind,
            'status' => $kind === MediaKind::Image ? MediaStatus::Processing : MediaStatus::Ready,
            'created_at' => now(),
        ]);

        if ($kind === MediaKind::Image) {
            ProcessUploadedImage::dispatch($media->id);
        }

        return $media;
    }
}
