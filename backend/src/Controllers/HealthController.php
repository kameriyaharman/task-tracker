<?php
namespace App\Controllers;

use App\Core\{Controller, Db};

final class HealthController extends Controller
{
    public function index(): array
    {
        $db = false;
        try { $db = (bool) Db::value('SELECT 1'); } catch (\Throwable $e) {}
        return ['app' => 'WorkTrack API', 'version' => '1.0.0', 'db' => $db, 'time' => date('c')];
    }
}
