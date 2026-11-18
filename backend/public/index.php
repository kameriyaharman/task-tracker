<?php
declare(strict_types=1);

use App\Core\{Config, HttpError, Request, Response, Router};

require dirname(__DIR__) . '/src/bootstrap.php';

// CORS — admin panel and Expo dev client call the API from other origins.
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed = (array) Config::get('cors_origins', ['*']);
if ($origin && (in_array('*', $allowed, true) || in_array($origin, $allowed, true))) {
    header("Access-Control-Allow-Origin: $origin");
    header('Vary: Origin');
}
header('Access-Control-Allow-Headers: Authorization, Content-Type, X-HTTP-Method-Override');
header('Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS');
header('Access-Control-Max-Age: 86400');
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }

try {
    $router = new Router();
    $r = $router;
    require dirname(__DIR__) . '/src/routes.php';
    $router->dispatch(Request::capture());
} catch (HttpError $e) {
    Response::json(['error' => $e->getMessage()] + ($e->details ? ['details' => $e->details] : []), $e->getCode());
} catch (\Throwable $e) {
    App\Services\Log::write('error', get_class($e) . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    Response::json(['error' => Config::get('debug') ? $e->getMessage() : 'Server error'], 500);
}
