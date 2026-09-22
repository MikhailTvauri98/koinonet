<?php

declare(strict_types=1);

namespace App\Modules\Media;

enum MediaKind: string
{
    case Image = 'image';
    case Video = 'video';
    case File = 'file';

    /**
     * Resolve the kind from a content-detected MIME type, null when no
     * kind's whitelist (config('media.limits')) contains it.
     */
    public static function forMime(string $mime): ?self
    {
        foreach (self::cases() as $kind) {
            if (array_key_exists($mime, $kind->allowedMimes())) {
                return $kind;
            }
        }

        return null;
    }

    /** The canonical stored extension for a MIME already known to belong to this kind. */
    public function extensionForMime(string $mime): ?string
    {
        return $this->allowedMimes()[$mime] ?? null;
    }

    public function maxSize(): int
    {
        return (int) config("media.limits.{$this->value}.max_size");
    }

    /** @return array<string, string> mime => extension */
    private function allowedMimes(): array
    {
        /** @var array<string, string> $mimes */
        $mimes = config("media.limits.{$this->value}.mimes", []);

        return $mimes;
    }
}
