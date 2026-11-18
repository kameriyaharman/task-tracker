<?php
namespace App\Services;

use App\Core\Config;
use App\Core\Db;

/** In-app notification + Expo push (works for both Android & iOS builds). */
final class Notifier
{
    public static function notify(int $companyId, int $userId, string $type, string $title, ?string $body = null, ?string $entityType = null, ?int $entityId = null): void
    {
        Db::insert('notifications', [
            'company_id' => $companyId, 'user_id' => $userId, 'type' => $type, 'title' => $title,
            'body' => $body, 'entity_type' => $entityType, 'entity_id' => $entityId,
        ]);

        $u = Db::one('SELECT push_token, notify_app FROM users WHERE id = ?', [$userId]);
        if ($u && $u['notify_app'] && $u['push_token'] && Config::get('push.enabled', true)) {
            Http::postJson('https://exp.host/--/api/v2/push/send', [
                'to' => $u['push_token'], 'title' => $title, 'body' => $body ?? '', 'sound' => 'default',
                'data' => ['type' => $type, 'entity_type' => $entityType, 'entity_id' => $entityId],
            ]);
        }
    }

    public static function many(int $companyId, array $userIds, string $type, string $title, ?string $body = null): void
    {
        foreach (array_unique($userIds) as $id) self::notify($companyId, (int) $id, $type, $title, $body);
    }
}
