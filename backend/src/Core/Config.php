<?php
namespace App\Core;

final class Config
{
    private static array $c = [];

    public static function load(string $file): void
    {
        // On Railway / Docker there is no config.php: settings come from environment variables.
        if (!is_file($file) && is_file(dirname($file) . '/config.env.php') && (getenv('MYSQLHOST') || getenv('DB_HOST'))) {
            $file = dirname($file) . '/config.env.php';
        }
        if (!is_file($file)) {
            http_response_code(500);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'config.php missing — copy config/config.example.php to config/config.php']);
            exit;
        }
        self::$c = require $file;
        date_default_timezone_set(self::$c['timezone'] ?? 'Asia/Kolkata');
    }

    /** Override one setting at runtime (e.g. switch push off while loading demo data). */
    public static function set(string $key, $value): void
    {
        $node = &self::$c;
        foreach (explode('.', $key) as $k) {
            if (!isset($node[$k]) || !is_array($node[$k])) $node[$k] = $node[$k] ?? [];
            $node = &$node[$k];
        }
        $node = $value;
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
