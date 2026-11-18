<?php
// Configuration from environment variables (Railway / Docker). Used automatically when config.php is absent.
$env = fn(string $k, $d = null) => ($v = getenv($k)) === false || $v === '' ? $d : $v;
$bool = fn(string $k, bool $d = false) => filter_var($env($k, $d ? '1' : '0'), FILTER_VALIDATE_BOOLEAN);

return [
    'debug' => $bool('APP_DEBUG'),
    'timezone' => $env('APP_TIMEZONE', 'Asia/Kolkata'),
    'base_path' => $env('BASE_PATH', '/api'),

    'db' => [
        'host' => $env('MYSQLHOST', $env('DB_HOST', 'localhost')),
        'port' => (int) $env('MYSQLPORT', $env('DB_PORT', 3306)),
        'name' => $env('MYSQLDATABASE', $env('DB_NAME', 'keshav')),
        'user' => $env('MYSQLUSER', $env('DB_USER', 'root')),
        'pass' => $env('MYSQLPASSWORD', $env('DB_PASS', '')),
    ],

    'jwt_secret' => $env('JWT_SECRET'),
    'jwt_ttl' => (int) $env('JWT_TTL', 60 * 60 * 24 * 30),
    'cors_origins' => array_map('trim', explode(',', $env('CORS_ORIGINS', '*'))),

    'upload_dir' => $env('UPLOAD_DIR'),
    'upload_max_mb' => (int) $env('UPLOAD_MAX_MB', 15),

    'otp' => ['demo_code' => $env('OTP_DEMO_CODE')],
    'sms' => [
        'provider' => $env('SMS_PROVIDER', 'log'),
        'msg91_authkey' => $env('MSG91_AUTHKEY', ''),
        'msg91_template_id' => $env('MSG91_TEMPLATE_ID', ''),
        'twofactor_key' => $env('TWOFACTOR_KEY', ''),
    ],
    'whatsapp' => [
        'provider' => $env('WHATSAPP_PROVIDER', 'log'),
        'phone_number_id' => $env('WHATSAPP_PHONE_NUMBER_ID', ''),
        'token' => $env('WHATSAPP_TOKEN', ''),
        'verify_token' => $env('WHATSAPP_VERIFY_TOKEN', ''),
        'app_secret' => $env('WHATSAPP_APP_SECRET', ''),
        'templates' => ['task_assigned' => $env('WHATSAPP_TEMPLATE_TASK_ASSIGNED')],
    ],
    'push' => ['enabled' => $bool('PUSH_ENABLED', true)],
    'ai' => ['anthropic_api_key' => $env('ANTHROPIC_API_KEY', ''), 'model' => $env('AI_MODEL', 'claude-haiku-5-5')],
    'attendance' => [
        'require_selfie' => $bool('REQUIRE_SELFIE', true),
        'require_geofence_for_office' => $bool('REQUIRE_GEOFENCE', true),
    ],
    'allow_peer_delegation' => $bool('ALLOW_PEER_DELEGATION', true),
];
