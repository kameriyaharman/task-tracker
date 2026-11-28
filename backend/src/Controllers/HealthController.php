<?php
namespace App\Controllers;

use App\Core\{Controller, Db};

final class HealthController extends Controller
{
    public function index(): array
    {
        $db = false;
        try { $db = (bool) Db::value('SELECT 1'); } catch (\Throwable $e) {}
        $build = @file_get_contents(dirname(__DIR__, 2) . '/VERSION');
        return ['app' => 'Keshav API', 'version' => '1.0.1', 'build' => $build ? trim($build) : null, 'db' => $db, 'time' => date('c')];
    }
}
