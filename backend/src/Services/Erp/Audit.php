<?php
namespace App\Services\Erp;

use App\Core\Db;

/** Change log: who did what to which record, with a snapshot of the change. */
final class Audit
{
    public static function log(int $cid, ?int $userId, string $entity, ?int $entityId, string $action, $data = null): void
    {
        Db::insert('audit_log', [
            'company_id' => $cid, 'user_id' => $userId, 'entity' => $entity, 'entity_id' => $entityId, 'action' => $action,
            'data' => $data === null ? null : mb_substr(json_encode($data, JSON_UNESCAPED_UNICODE), 0, 60000),
        ]);
    }

    public static function history(int $cid, string $entity, int $id): array
    {
        return Db::all('SELECT a.*, u.name AS user_name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
                         WHERE a.company_id = ? AND a.entity = ? AND a.entity_id = ? ORDER BY a.id', [$cid, $entity, $id]);
    }
}
