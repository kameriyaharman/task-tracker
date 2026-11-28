<?php
namespace App\Controllers;

use App\Core\Controller;
use App\Services\Log;

/** POST /client-log — start-up breadcrumbs and crash reports from the mobile app (shows up in server logs). */
final class ClientLogController extends Controller
{
    public function store(): array
    {
        $b = $this->req->body;
        $clean = fn($v, $n) => mb_substr(preg_replace('/[^\P{C}\n]/u', '', (string) ($v ?? '')), 0, $n);
        $line = sprintf('[client %s] %s %s/%s +%sms %s',
            $clean($b['sid'] ?? '', 12), $clean($b['event'] ?? '?', 40), $clean($b['os'] ?? '', 10), $clean($b['osv'] ?? '', 10),
            (int) ($b['ms'] ?? 0), $clean($b['detail'] ?? '', 4000));
        file_put_contents('php://stderr', $line . "\n");
        Log::write('client', $line);
        return ['ok' => true];
    }
}
