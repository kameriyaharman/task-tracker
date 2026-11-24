<?php
namespace App\Services;

use App\Core\Db;

/** Company task settings kept in companies.erp_settings: default due window, approval for staff-created tasks, escalation chain. */
final class TaskRules
{
    public const TARGETS = ['manager' => "Person's manager", 'dept_head' => 'Department head', 'owner' => 'Boss (owner)', 'assigner' => 'Who assigned it'];

    public static function get(int $cid): array
    {
        $s = json_decode((string) Db::value('SELECT erp_settings FROM companies WHERE id = ?', [$cid]), true) ?: [];
        return [
            'default_due_hours' => (int) ($s['default_due_hours'] ?? 4),
            'task_approval' => (bool) ($s['task_approval'] ?? true),
            'escalation' => $s['task_escalation'] ?? [
                ['after_hours' => 2, 'to' => 'manager'],
                ['after_hours' => 24, 'to' => 'dept_head'],
                ['after_hours' => 48, 'to' => 'owner'],
            ],
        ];
    }

    public static function save(int $cid, array $in): array
    {
        $s = json_decode((string) Db::value('SELECT erp_settings FROM companies WHERE id = ?', [$cid]), true) ?: [];
        if (isset($in['default_due_hours'])) $s['default_due_hours'] = max(1, min(72, (int) $in['default_due_hours']));
        if (isset($in['task_approval'])) $s['task_approval'] = (bool) $in['task_approval'];
        if (isset($in['escalation']) && is_array($in['escalation'])) {
            $lv = [];
            foreach (array_slice($in['escalation'], 0, 4) as $l) {
                $to = (string) ($l['to'] ?? '');
                if (!isset(self::TARGETS[$to]) && !preg_match('/^user:\d+$/', $to)) continue;
                $lv[] = ['after_hours' => max(1, (int) ($l['after_hours'] ?? 24)), 'to' => $to];
            }
            usort($lv, fn($a, $b) => $a['after_hours'] <=> $b['after_hours']);
            $s['task_escalation'] = $lv;
        }
        Db::exec('UPDATE companies SET erp_settings = ? WHERE id = ?', [json_encode($s), $cid]);
        return self::get($cid);
    }

    /** Who is the escalation target for a task at a given level target type. */
    public static function resolve(array $t, string $to): array
    {
        $cid = (int) $t['company_id'];
        $u = Db::one('SELECT manager_id, department_id FROM users WHERE id = ?', [$t['assigned_to']]) ?: [];
        switch (true) {
            case $to === 'manager': $ids = [$u['manager_id'] ?? null]; break;
            case $to === 'dept_head':
                $ids = [Db::value('SELECT head_user_id FROM departments WHERE id = ?', [$t['department_id'] ?: ($u['department_id'] ?? 0)])];
                break;
            case $to === 'owner': $ids = array_column(Db::all("SELECT id FROM users WHERE company_id = ? AND role = 'owner' AND is_active = 1", [$cid]), 'id'); break;
            case $to === 'assigner': $ids = [$t['assigned_by']]; break;
            default: $ids = [(int) substr($to, 5)];
        }
        $ids = array_values(array_unique(array_filter(array_map('intval', $ids), fn($i) => $i && $i !== (int) $t['assigned_to'])));
        // nobody at this level (e.g. no manager set) → the boss
        if (!$ids) $ids = array_map('intval', array_column(Db::all("SELECT id FROM users WHERE company_id = ? AND role = 'owner' AND is_active = 1", [$cid]), 'id'));
        return $ids;
    }

    /** Who approves a task request made by $creator: their manager → department head → boss. Plus deputies. */
    public static function approverFor(array $creator): int
    {
        $cid = (int) $creator['company_id'];
        if (!empty($creator['manager_id'])) return (int) $creator['manager_id'];
        $head = Db::value('SELECT head_user_id FROM departments WHERE id = ?', [$creator['department_id'] ?? 0]);
        if ($head && (int) $head !== (int) $creator['id']) return (int) $head;
        return (int) Db::value("SELECT id FROM users WHERE company_id = ? AND role = 'owner' AND is_active = 1 ORDER BY id LIMIT 1", [$cid]);
    }

    /** Can $uid act as approver $approverId? (the approver, their deputy, or the boss) */
    public static function canApprove(array $user, ?int $approverId): bool
    {
        if ($user['role'] === 'owner') return true;
        if (!$approverId) return false;
        if ((int) $user['id'] === $approverId) return true;
        return (int) Db::value('SELECT deputy_id FROM users WHERE id = ?', [$approverId]) === (int) $user['id'];
    }
}
