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

    /**
     * Whether a file's name may end in this extension (lower case): any
     * spelling of any allowed type of any kind, since the content can land
     * in another kind than the name suggests.
     */
    public static function allowsNameExtension(string $extension): bool
    {
        foreach (self::cases() as $kind) {
            foreach ($kind->allowedMimes() as $extensions) {
                if (in_array($extension, $extensions, true)) {
                    return true;
                }
            }
        }

        return false;
    }

    /** The canonical stored extension for a MIME already known to belong to this kind. */
    public function extensionForMime(string $mime): ?string
    {
        return $this->allowedMimes()[$mime][0] ?? null;
    }

    public function maxSize(): int
    {
        return (int) config("media.limits.{$this->value}.max_size");
    }

    /** @return array<string, list<string>> mime => the extensions its files may carry, the stored one first */
    private function allowedMimes(): array
    {
        /** @var array<string, list<string>> $mimes */
        $mimes = config("media.limits.{$this->value}.mimes", []);

        return $mimes;
    }
}
