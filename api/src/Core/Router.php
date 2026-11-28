<?php
namespace App\Core;

final class Router
{
    private array $routes = [];

    /**
     * @param string $auth  'public' | 'user' (any logged-in) | 'manager' (manager+owner) | 'owner'
     */
    public function add(string $method, string $pattern, array $handler, string $auth = 'user'): void
    {
        $regex = '#^' . preg_replace('#\{(\w+)\}#', '(?P<$1>[^/]+)', rtrim($pattern, '/') ?: '/') . '$#';
        $this->routes[] = [$method, $regex, $handler, $auth];
    }

    public function get(string $p, array $h, string $a = 'user'): void { $this->add('GET', $p, $h, $a); }
    public function post(string $p, array $h, string $a = 'user'): void { $this->add('POST', $p, $h, $a); }
    public function patch(string $p, array $h, string $a = 'user'): void { $this->add('PATCH', $p, $h, $a); }
    public function delete(string $p, array $h, string $a = 'user'): void { $this->add('DELETE', $p, $h, $a); }

    public function dispatch(Request $req): void
    {
        $pathMatched = false;
        foreach ($this->routes as [$method, $regex, $handler, $auth]) {
            if (!preg_match($regex, $req->path, $m)) continue;
            $pathMatched = true;
            if ($method !== $req->method) continue;

            $req->params = array_filter($m, 'is_string', ARRAY_FILTER_USE_KEY);
            if ($auth !== 'public') {
                $req->user = Auth::authenticate($req);
                Auth::requireRole($req->user, $auth);
            }
            [$class, $fn] = $handler;
            $result = (new $class($req))->$fn();
            if ($result !== null) Response::json($result);
            return;
        }
        throw $pathMatched ? new HttpError(405, 'Method not allowed') : HttpError::notFound('Route not found: ' . $req->path);
    }
}
