<?php
namespace App\Services;

final class Http
{
    public static function postJson(string $url, array $body, array $headers = []): ?array
    {
        return self::request('POST', $url, json_encode($body), array_merge(['Content-Type: application/json'], $headers));
    }

    public static function get(string $url, array $headers = []): ?array
    {
        return self::request('GET', $url, null, $headers);
    }

    private static function request(string $method, string $url, ?string $body, array $headers): ?array
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_HTTPHEADER => $headers,
        ]);
        if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        $res = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($res === false || $code >= 400) {
            Log::write('http', "$method $url -> $code $err " . substr((string) $res, 0, 500));
            return null;
        }
        return json_decode($res, true) ?? ['raw' => $res];
    }
}
