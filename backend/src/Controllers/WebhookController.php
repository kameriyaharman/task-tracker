<?php
namespace App\Controllers;

use App\Core\{Config, Controller, Db, HttpError};
use App\Services\Log;

/**
 * WhatsApp Cloud API webhook.
 * GET  /webhooks/whatsapp — Meta verification handshake
 * POST /webhooks/whatsapp — incoming replies: "1" = Started, "2" = Done (applies to the latest task alert sent to that number)
 */
final class WebhookController extends Controller
{
    public function verify(): void
    {
        if (($_GET['hub_verify_token'] ?? '') !== Config::get('whatsapp.verify_token')) throw HttpError::forbidden();
        header('Content-Type: text/plain');
        echo $_GET['hub_challenge'] ?? '';
    }

    public function receive(): array
    {
        $raw = file_get_contents('php://input');
        $secret = Config::get('whatsapp.app_secret');
        if ($secret) {
            $sig = $_SERVER['HTTP_X_HUB_SIGNATURE_256'] ?? '';
            if (!hash_equals('sha256=' . hash_hmac('sha256', $raw, $secret), $sig)) throw HttpError::forbidden('Bad signature');
        }
        $body = json_decode($raw, true) ?: [];
        foreach ($body['entry'] ?? [] as $entry) foreach ($entry['changes'] ?? [] as $ch) foreach ($ch['value']['messages'] ?? [] as $msg) {
            $from = preg_replace('/\D/', '', $msg['from'] ?? '');
            $text = trim($msg['text']['body'] ?? ($msg['button']['text'] ?? ($msg['interactive']['button_reply']['id'] ?? '')));
            Log::write('whatsapp_in', "$from: $text");
            $this->handleReply($from, $text);
        }
        return ['ok' => true];
    }

    private function handleReply(string $from, string $text): void
    {
        $mobile = strlen($from) > 10 ? substr($from, -10) : $from;
        $last = Db::one("SELECT w.* FROM whatsapp_log w WHERE w.direction = 'out' AND w.task_id IS NOT NULL AND RIGHT(w.to_mobile, 10) = ?
                          ORDER BY w.id DESC LIMIT 1", [$mobile]);
        if (!$last) return;
        Db::insert('whatsapp_log', ['company_id' => $last['company_id'], 'user_id' => $last['user_id'], 'task_id' => $last['task_id'],
            'direction' => 'in', 'to_mobile' => $from, 'body' => $text, 'status' => 'received']);

        $task = Db::one('SELECT * FROM tasks WHERE id = ? AND assigned_to = ?', [$last['task_id'], $last['user_id']]);
        if (!$task || in_array($task['status'], ['done', 'cancelled'], true)) return;
        $t = strtolower($text);
        if ($t === '1' || str_contains($t, 'start')) TaskController::setStatus($task, 'in_progress', (int) $last['user_id']);
        elseif ($t === '2' || str_contains($t, 'done') || str_contains($t, 'ho gaya')) {
            if ($task['proof_type']) return; // tasks needing proof must be completed in the app
            TaskController::setStatus($task, 'done', (int) $last['user_id']);
        }
    }
}
