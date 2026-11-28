<?php
namespace App\Core;

/** Minimal HS256 JWT — no composer dependency, so it runs on any shared host. */
final class Jwt
{
    private static function b64(string $s): string { return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }
    private static function unb64(string $s): string { return base64_decode(strtr($s, '-_', '+/')); }

    public static function encode(array $payload, int $ttlSeconds): string
    {
        $payload['iat'] = time();
        $payload['exp'] = time() + $ttlSeconds;
        $h = self::b64(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
        $p = self::b64(json_encode($payload));
        $sig = self::b64(hash_hmac('sha256', "$h.$p", self::secret(), true));
        return "$h.$p.$sig";
    }

    public static function decode(string $token): ?array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) return null;
        [$h, $p, $s] = $parts;
        $expected = self::b64(hash_hmac('sha256', "$h.$p", self::secret(), true));
        if (!hash_equals($expected, $s)) return null;
        $payload = json_decode(self::unb64($p), true);
        if (!is_array($payload) || ($payload['exp'] ?? 0) < time()) return null;
        return $payload;
    }

    private static function secret(): string
    {
        $s = Config::get('jwt_secret');
        if (!$s || strlen($s) < 32) throw new \RuntimeException('jwt_secret must be at least 32 chars in config.php');
        return $s;
    }
}
