<?php
// Copy to config/config.php and fill in. config.php is git-ignored.
return [
    'debug' => false,
    'timezone' => 'Asia/Kolkata',
    'base_path' => '/api',               // URL folder the API lives under (e.g. https://app.yourdomain.com/api)

    'db' => [
        'host' => 'localhost',
        'port' => 3306,
        'name' => 'keshav',
        'user' => 'keshav_user',
        'pass' => 'CHANGE_ME',
    ],

    // Generate with: php -r "echo bin2hex(random_bytes(32));"
    'jwt_secret' => 'CHANGE_ME_TO_A_64_CHAR_RANDOM_STRING_________________________',
    'jwt_ttl' => 60 * 60 * 24 * 30,      // 30 days

    'cors_origins' => ['https://app.yourdomain.com', 'http://localhost:5173'],

    // Uploads are stored outside public/ and served via /files/{id}
    'upload_dir' => null,                // null = backend/storage/uploads
    'upload_max_mb' => 15,

    'otp' => [
        'demo_code' => null,             // e.g. '5174' on a staging server — NEVER set in production
    ],
    'sms' => [
        'provider' => 'log',             // log | msg91 | 2factor
        'msg91_authkey' => '',
        'msg91_template_id' => '',
        'twofactor_key' => '',
    ],
    'whatsapp' => [
        'provider' => 'log',             // log | meta  (Meta WhatsApp Cloud API)
        'phone_number_id' => '',
        'token' => '',
        'verify_token' => 'choose-any-string',
        'app_secret' => '',              // to verify webhook signatures
        'templates' => [
            'task_assigned' => null,     // approved template name, e.g. 'task_assigned_v1'
        ],
    ],
    'push' => ['enabled' => true],       // Expo push for Android + iOS

    'ai' => [
        'anthropic_api_key' => '',       // optional — better voice-task parsing
        'model' => 'claude-haiku-5-5',
    ],

    'attendance' => [
        'require_selfie' => true,
        'require_geofence_for_office' => true,
    ],
    'allow_peer_delegation' => true,     // employees can assign tasks to each other
];
