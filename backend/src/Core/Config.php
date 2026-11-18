<?php
namespace App\Core;

final class Config
{
    private static array $c = [];

    public static function load(string $file): void
    {
        if (!is_file($file)) {
            http_response_code(500);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'config.php missing — copy config/config.example.php to config/config.php']);
            exit;
        }
        self::$c = require $file;
        date_default_timezone_set(self::$c['timezone'] ?? 'Asia/Kolkata');
    }

    public static function get(string $key, $default = null)
    {
        $node = self::$c;
        foreach (explode('.', $key) as $k) {
            if (!is_array($node) || !array_key_exists($k, $node)) return $default;
            $node = $node[$k];
        }
        return $node;
    }
}
