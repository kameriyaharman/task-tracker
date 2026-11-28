<?php
namespace App\Services;

final class Log
{
    public static function write(string $channel, string $message): void
    {
        $dir = dirname(__DIR__, 2) . '/storage/logs';
        if (!is_dir($dir)) @mkdir($dir, 0775, true);
        @file_put_contents("$dir/$channel.log", '[' . date('Y-m-d H:i:s') . "] $message\n", FILE_APPEND);
    }
}
