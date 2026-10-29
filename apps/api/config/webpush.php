<?php

declare(strict_types=1);

return [
    'vapid' => [
        'subject' => env('VAPID_SUBJECT', 'mailto:admin@example.com'),
        'public_key' => env('VAPID_PUBLIC_KEY'),
        'private_key' => env('VAPID_PRIVATE_KEY'),
    ],
    'ttl' => 86400,
    'max_failures' => 10,
    'icon' => '/icons/icon-192.png',
];
