<?php
namespace App\Services;

use App\Core\Config;
use App\Core\Db;

/**
 * WhatsApp alerts via Meta WhatsApp Cloud API (or 'log' in dev).
 * Business-initiated messages need an approved template; configure names in config.php.
 * Replies "1" (Started) / "2" (Done) come back through POST /webhooks/whatsapp.
 */
final class WhatsApp
{
    public static function send(int $companyId, array $toUser, string $text, ?int $taskId = null, ?string $template = null, array $vars = []): void
    {
        $enabled = (int) Db::value('SELECT whatsapp_enabled FROM companies WHERE id = ?', [$companyId]);
        if (!$enabled || empty($toUser['notify_whatsapp'])) return;

        $mobile = preg_replace('/\D/', '', $toUser['mobile']);
        if (strlen($mobile) === 10) $mobile = '91' . $mobile;

        $logId = Db::insert('whatsapp_log', [
            'company_id' => $companyId, 'user_id' => $toUser['id'], 'task_id' => $taskId,
            'direction' => 'out', 'to_mobile' => $mobile, 'body' => $text,
        ]);

        if (Config::get('whatsapp.provider', 'log') !== 'meta') {
            Log::write('whatsapp', "$mobile: $text");
            Db::exec("UPDATE whatsapp_log SET status = 'logged' WHERE id = ?", [$logId]);
            return;
        }

        $payload = $template
            ? ['messaging_product' => 'whatsapp', 'to' => $mobile, 'type' => 'template', 'template' => [
                'name' => $template, 'language' => ['code' => $toUser['language'] === 'hi' ? 'hi' : 'en'],
                'components' => [['type' => 'body', 'parameters' => array_map(fn($v) => ['type' => 'text', 'text' => (string) $v], $vars)]],
              ]]
            : ['messaging_product' => 'whatsapp', 'to' => $mobile, 'type' => 'text', 'text' => ['body' => $text]];

        $res = Http::postJson(
            'https://graph.facebook.com/v20.0/' . Config::get('whatsapp.phone_number_id') . '/messages',
            $payload,
            ['Authorization: Bearer ' . Config::get('whatsapp.token')]
        );
        Db::exec('UPDATE whatsapp_log SET status = ?, provider_msg_id = ? WHERE id = ?',
            [$res ? 'sent' : 'failed', $res['messages'][0]['id'] ?? null, $logId]);
    }

    public static function taskAssigned(array $task, array $assignee, string $byName): void
    {
        $due = $task['due_at'] ? date('D d-m-Y, g:i A', strtotime($task['due_at'])) : 'No due date';
        $text = "📌 New task from $byName\n{$task['title']}\n⏰ $due · " . ucfirst($task['priority'])
            . "\nReply 1 = Started · 2 = Done";
        self::send((int) $task['company_id'], $assignee, $text, (int) $task['id'],
            Config::get('whatsapp.templates.task_assigned'), [$byName, $task['title'], $due]);
    }
}
