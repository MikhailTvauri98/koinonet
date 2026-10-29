<?php

declare(strict_types=1);

namespace App\Modules\Announcements;

final class MarkdownCleaner
{
    public function clean(string $markdown): string
    {
        // strip_tags must not mistake Markdown's angle-bracket URLs for HTML.
        $urls = [];
        $prefix = "\x1A".bin2hex(random_bytes(8));
        $text = preg_replace_callback('~<([a-z][a-z0-9+.-]*:[^<>\s]*|[^<>\s]+@[^<>\s]+)>~i', function (array $match) use (&$urls, $prefix): string {
            $key = $prefix.count($urls)."\x1A";
            $urls[$key] = $this->safeDestination($match[1]) ? $match[0] : $match[1];

            return $key;
        }, $markdown) ?? $markdown;
        $text = strtr(strip_tags($text), $urls);

        // Balanced groups consume the entire destination, including nested parentheses.
        $pattern = '~(?(DEFINE)(?<label>\[(?:[^\[\]\\\\]|\\\\.|(?&label))*\])(?<target>\((?:[^()\\\\]|\\\\.|(?&target))*\)))(?<image>!?)(?<text>(?&label))(?<url>(?&target))~u';
        $text = preg_replace_callback($pattern, function (array $match): string {
            $label = substr($match['text'], 1, -1);
            if ($match['image'] === '!') {
                return $label;
            }

            $destination = substr($match['url'], 1, -1);

            return $this->safeDestination($destination) ? $match[0] : $match['text'].'()';
        }, $text) ?? $text;

        // Images using reference or shortcut syntax still become their alt text.
        $text = preg_replace('~!\[([^\]\n]*)\](?:\[[^\]\n]*\])?~u', '$1', $text) ?? $text;
        $text = preg_replace_callback('~^( {0,3}\[[^\]\n]+\]:)[ \t]*(?:\r?\n[ \t]*)?(.*)$~mu', function (array $match): string {
            return $this->safeDestination($match[2]) ? $match[0] : $match[1].' <>';
        }, $text) ?? $text;

        return trim($text);
    }

    private function safeDestination(string $destination): bool
    {
        $destination = ltrim($destination);
        if (str_starts_with($destination, '<')) {
            $destination = substr($destination, 1, (strpos($destination, '>') ?: strlen($destination)) - 1);
        } else {
            $destination = preg_split('/\s/u', $destination, 2)[0];
        }
        $destination = html_entity_decode($destination, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $destination = preg_replace('/\\\\([[:punct:]])/', '$1', $destination) ?? $destination;
        $destination = preg_replace('/[\x00-\x20\x7f]/', '', $destination) ?? $destination;

        if (preg_match('/^([a-z][a-z0-9+.-]*):/i', $destination, $scheme) !== 1) {
            return true; // Absolute paths, fragments, queries, and ordinary relative paths.
        }

        return in_array(strtolower($scheme[1]), ['http', 'https', 'mailto', 'tel'], true);
    }
}
