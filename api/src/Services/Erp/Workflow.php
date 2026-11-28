<?php
namespace App\Services\Erp;

use App\Core\Db;
use App\Services\Notifier;

/**
 * Configurable workflow engine (no code changes needed to change a process).
 *
 * A workflow = trigger event + optional amount range + ordered steps (JSON):
 *   { "name": "Check material", "type": "task" | "approval" | "notify",
 *     "assign_type": "erp_role" | "role" | "user" | "department" | "creator",
 *     "assign_value": "5" | "manager" | ...,
 *     "due_hours": 24, "priority": "medium", "parallel": false,
 *     "min_amount": null, "max_amount": null,      // step condition (skipped if amount out of range)
 *     "proof": "photo" | "file" | null, "description": "" }
 * Steps run in order; a step with "parallel": true runs together with the step before it.
 * The next group starts only when every task of the current group is done.
 * A run keeps a snapshot of the steps, so editing a workflow never changes runs already in progress.
 */
final class Workflow
{
    public const EVENTS = [
        'purchase_order.created' => 'Purchase order created',
        'purchase_order.approved' => 'Purchase order approved',
        'grn.created' => 'Goods received (GRN created)',
        'grn.approved' => 'GRN approved (stock updated)',
        'invoice.final' => 'Sales invoice finalised',
        'invoice.credit' => 'Credit (udhari) sale',
        'delivery.created' => 'Delivery created',
        'payment.promise' => 'Customer promised payment',
        'complaint.created' => 'Complaint / maintenance ticket created',
        'expense.approved' => 'Expense approved',
        'return.approved' => 'Return approved',
        'manual' => 'Started manually',
    ];

    /** Start every active workflow listening to $event. */
    public static function fire(int $cid, string $event, ?string $refType, ?int $refId, string $title, array $ctx = []): array
    {
        $amount = isset($ctx['amount']) ? (float) $ctx['amount'] : null;
        $wfs = Db::all('SELECT * FROM workflows WHERE company_id = ? AND trigger_event = ? AND is_active = 1', [$cid, $event]);
        $runs = [];
        foreach ($wfs as $wf) {
            if ($amount !== null && $wf['min_amount'] !== null && $amount < (float) $wf['min_amount']) continue;
            if ($amount !== null && $wf['max_amount'] !== null && $amount > (float) $wf['max_amount']) continue;
            $runs[] = self::start($cid, $wf, $refType, $refId, $title, $ctx);
        }
        return $runs;
    }

    public static function start(int $cid, array $wf, ?string $refType, ?int $refId, string $title, array $ctx): int
    {
        $id = Db::insert('workflow_runs', ['company_id' => $cid, 'workflow_id' => $wf['id'], 'version' => $wf['version'], 'steps' => $wf['steps'],
            'ref_type' => $refType, 'ref_id' => $refId, 'title' => mb_substr($title, 0, 200), 'context' => json_encode($ctx)]);
        self::advance($id);
        return $id;
    }

    public static function advance(int $runId): void
    {
        $run = Db::one('SELECT * FROM workflow_runs WHERE id = ?', [$runId]);
        if (!$run || $run['status'] !== 'running') return;
        $steps = json_decode($run['steps'], true) ?: [];
        $ctx = json_decode((string) $run['context'], true) ?: [];
        $amount = isset($ctx['amount']) ? (float) $ctx['amount'] : null;
        $i = (int) $run['current_step'] + 1;

        while ($i < count($steps)) {
            $group = [$i];
            while ($i + 1 < count($steps) && !empty($steps[$i + 1]['parallel'])) $group[] = ++$i;
            $created = 0;
            foreach ($group as $idx) {
                $s = $steps[$idx];
                if ($amount !== null && isset($s['min_amount']) && $s['min_amount'] !== '' && $s['min_amount'] !== null && $amount < (float) $s['min_amount']) continue;
                if ($amount !== null && isset($s['max_amount']) && $s['max_amount'] !== '' && $s['max_amount'] !== null && $amount > (float) $s['max_amount']) continue;
                $assignee = self::resolveAssignee((int) $run['company_id'], $s, $ctx);
                if (($s['type'] ?? 'task') === 'notify') {
                    if ($assignee) Notifier::notify((int) $run['company_id'], $assignee, 'workflow', ($s['name'] ?? 'Update') . ': ' . $run['title'], $s['description'] ?? null);
                    continue;
                }
                self::createTask($run, $idx, $s, $assignee, $ctx);
                $created++;
            }
            Db::update('workflow_runs', $runId, ['current_step' => $i]);
            if ($created) return;
            $i++;
        }
        Db::update('workflow_runs', $runId, ['status' => 'completed', 'finished_at' => date('Y-m-d H:i:s')]);
    }

    private static function createTask(array $run, int $idx, array $s, ?int $assignee, array $ctx): void
    {
        $cid = (int) $run['company_id'];
        $owner = (int) Db::value("SELECT id FROM users WHERE company_id = ? AND role = 'owner' AND is_active = 1 ORDER BY id LIMIT 1", [$cid]);
        $assignee = $assignee ?: $owner;
        $by = (int) ($ctx['creator_id'] ?? $owner) ?: $owner;
        $isApproval = ($s['type'] ?? 'task') === 'approval';
        $title = ($isApproval ? 'Approve: ' : '') . trim(($s['name'] ?? 'Step ' . ($idx + 1)) . ' · ' . $run['title'], ' ·');
        $due = !empty($s['due_hours']) ? date('Y-m-d H:i:s', time() + (int) round((float) $s['due_hours'] * 3600)) : null;
        $taskId = Db::insert('tasks', [
            'company_id' => $cid, 'title' => mb_substr($title, 0, 200), 'description' => $s['description'] ?? null,
            'assigned_to' => $assignee, 'assigned_by' => $by, 'priority' => in_array($s['priority'] ?? '', ['low', 'medium', 'high'], true) ? $s['priority'] : 'medium',
            'due_at' => $due, 'remind_before_min' => $due ? 60 : null, 'proof_type' => in_array($s['proof'] ?? '', ['photo', 'file', 'location'], true) ? $s['proof'] : null,
            'source' => 'workflow', 'workflow_run_id' => $run['id'], 'workflow_step' => $idx, 'ref_type' => $run['ref_type'], 'ref_id' => $run['ref_id'],
        ]);
        Db::insert('task_activity', ['task_id' => $taskId, 'user_id' => null, 'action' => 'created_by_workflow']);
        Notifier::notify($cid, $assignee, 'task_assigned', 'New task: ' . $title, $s['description'] ?? null, 'task', $taskId);
    }

    /** User id for a step, least-busy person when a role/department is given. */
    public static function resolveAssignee(int $cid, array $s, array $ctx): ?int
    {
        $v = $s['assign_value'] ?? null;
        switch ($s['assign_type'] ?? 'creator') {
            case 'user':
                return Db::value('SELECT id FROM users WHERE id = ? AND company_id = ? AND is_active = 1', [(int) $v, $cid]) ? (int) $v : null;
            case 'creator':
                return isset($ctx['creator_id']) ? (int) $ctx['creator_id'] : null;
            case 'erp_role':
                return self::leastBusy($cid, 'u.erp_role_id = ?', [(int) $v]);
            case 'department':
                return self::leastBusy($cid, 'u.department_id = ?', [(int) $v]);
            case 'role':
                return self::leastBusy($cid, 'u.role = ?', [in_array($v, ['owner', 'manager', 'employee'], true) ? $v : 'manager']);
        }
        return null;
    }

    private static function leastBusy(int $cid, string $cond, array $p): ?int
    {
        $id = Db::value("SELECT u.id FROM users u LEFT JOIN tasks t ON t.assigned_to = u.id AND t.status IN ('not_started','in_progress','on_hold')
                          WHERE u.company_id = ? AND u.is_active = 1 AND $cond GROUP BY u.id ORDER BY COUNT(t.id), u.id LIMIT 1", array_merge([$cid], $p));
        return $id ? (int) $id : null;
    }

    /** Called whenever a task changes status. */
    public static function onTaskClosed(array $task): void
    {
        if (empty($task['workflow_run_id'])) return;
        $open = (int) Db::value("SELECT COUNT(*) FROM tasks WHERE workflow_run_id = ? AND status IN ('not_started','in_progress','on_hold')", [$task['workflow_run_id']]);
        if ($open === 0) self::advance((int) $task['workflow_run_id']);
    }

    public static function cancel(int $runId): void
    {
        Db::update('workflow_runs', $runId, ['status' => 'cancelled', 'finished_at' => date('Y-m-d H:i:s')]);
        Db::exec("UPDATE tasks SET status = 'cancelled' WHERE workflow_run_id = ? AND status IN ('not_started','in_progress','on_hold')", [$runId]);
    }

    public static function setPaused(int $runId, bool $paused): void
    {
        Db::exec("UPDATE workflow_runs SET status = ? WHERE id = ? AND status IN ('running','paused')", [$paused ? 'paused' : 'running', $runId]);
        if (!$paused) {
            $open = (int) Db::value("SELECT COUNT(*) FROM tasks WHERE workflow_run_id = ? AND status IN ('not_started','in_progress','on_hold')", [$runId]);
            if ($open === 0) self::advance($runId);
        }
    }

    /** Validate + normalise steps coming from the builder. */
    public static function cleanSteps($steps): array
    {
        $out = [];
        foreach ((array) $steps as $s) {
            if (!is_array($s) || trim((string) ($s['name'] ?? '')) === '') continue;
            $out[] = [
                'name' => mb_substr(trim($s['name']), 0, 120),
                'type' => in_array($s['type'] ?? '', ['task', 'approval', 'notify'], true) ? $s['type'] : 'task',
                'assign_type' => in_array($s['assign_type'] ?? '', ['erp_role', 'role', 'user', 'department', 'creator'], true) ? $s['assign_type'] : 'creator',
                'assign_value' => isset($s['assign_value']) ? (string) $s['assign_value'] : null,
                'due_hours' => isset($s['due_hours']) && $s['due_hours'] !== '' ? (float) $s['due_hours'] : null,
                'priority' => in_array($s['priority'] ?? '', ['low', 'medium', 'high'], true) ? $s['priority'] : 'medium',
                'parallel' => !empty($s['parallel']) && $out,
                'min_amount' => isset($s['min_amount']) && $s['min_amount'] !== '' ? (float) $s['min_amount'] : null,
                'max_amount' => isset($s['max_amount']) && $s['max_amount'] !== '' ? (float) $s['max_amount'] : null,
                'proof' => in_array($s['proof'] ?? '', ['photo', 'file', 'location'], true) ? $s['proof'] : null,
                'description' => isset($s['description']) ? mb_substr((string) $s['description'], 0, 1000) : null,
            ];
        }
        return $out;
    }
}
