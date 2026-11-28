<?php
namespace App\Core;

final class Request
{
    public string $method;
    public string $path;
    public array $query;
    public array $body;
    public array $files;
    public array $params = [];
    /** Authenticated user row (set by Auth middleware). */
    public ?array $user = null;

    public static function capture(): self
    {
        $r = new self();
        $r->method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
        if ($r->method === 'POST' && isset($_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE'])) {
            $r->method = strtoupper($_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE']);
        }

        $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
        // Strip the folder the API is installed in (e.g. /api) so routes are host-agnostic.
        // Works whether the doc root points at backend/public or at backend/ (root .htaccess rewrites into public/).
        $base = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/');
        $candidates = [Config::get('base_path'), $base, preg_replace('#/public$#', '', $base)];
        foreach ($candidates as $b) {
            if ($b && $b !== '/' && strpos($uri, $b) === 0) { $uri = substr($uri, strlen($b)); break; }
        }
        $uri = preg_replace('#^/index\.php#', '', $uri);
        $r->path = '/' . trim($uri, '/');

        $r->query = $_GET;
        $r->files = $_FILES;
        $ct = $_SERVER['CONTENT_TYPE'] ?? '';
        if (stripos($ct, 'application/json') !== false) {
            $raw = file_get_contents('php://input');
            $r->body = $raw ? (json_decode($raw, true) ?? []) : [];
        } else {
            $r->body = $_POST;
        }
        return $r;
    }

    public function input(string $key, $default = null)
    {
        return $this->body[$key] ?? $this->query[$key] ?? $default;
    }

    public function int(string $key, ?int $default = null): ?int
    {
        $v = $this->input($key);
        return ($v === null || $v === '') ? $default : (int) $v;
    }

    public function bearer(): ?string
    {
        $h = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
        if (!$h && function_exists('getallheaders')) {
            foreach (getallheaders() as $k => $v) if (strtolower($k) === 'authorization') $h = $v;
        }
        if (preg_match('/Bearer\s+(\S+)/i', $h, $m)) return $m[1];
        return $this->query['token'] ?? null; // for file downloads / CSV export links
    }

    /** Require keys; returns their values. */
    public function require(array $keys): array
    {
        $missing = [];
        $out = [];
        foreach ($keys as $k) {
            $v = $this->input($k);
            if ($v === null || $v === '') $missing[] = $k;
            $out[$k] = $v;
        }
        if ($missing) throw HttpError::badRequest('Missing fields: ' . implode(', ', $missing), ['fields' => $missing]);
        return $out;
    }

    /** Pick only whitelisted keys that are present in body. */
    public function only(array $keys): array
    {
        $out = [];
        foreach ($keys as $k) if (array_key_exists($k, $this->body)) $out[$k] = $this->body[$k];
        return $out;
    }
}
