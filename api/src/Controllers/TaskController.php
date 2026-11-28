<?php
namespace App\Controllers;

use App\Core\{Auth, Controller, Db, HttpError};
use App\Services\{Notifier, Upload, WhatsApp};

final class TaskController extends Controller
{
    private const EDITABLE = ['title', 'description', 'assigned_to', 'department_id', 'goal_id', 'campaign_id', 'priority', 'due_at', 'remind_before_min', 'send_whatsapp', 'proof_type'];

    /* ───────────── shared query helpers ───────────── */

    public static function fetchList(int $cid, string $where, array $params, string $order = 't.due_at', int $limit = 100, int $offset = 0): array
    {
        $rows = Db::all(
            "SELECT t.*, ua.name AS assignee_name, ua.mobile AS assignee_mobile, ub.name AS assigner_name, d.name AS department_name,
                    (SELECT COUNT(*) FROM task_checklist c WHERE c.task_id = t.id) AS checklist_total,
                    (SELECT COUNT(*) FROM task_checklist c WHERE c.task_id = t.id AND c.is_done = 1) AS checklist_done,
                    r.frequency AS repeat_frequency
               FROM tasks t
               JOIN users ua ON ua.id = t.assigned_to
               JOIN users ub ON ub.id = t.assigned_by
          LEFT JOIN departments d ON d.id = t.department_id
          LEFT JOIN recurring_rules r ON r.id = t.recurring_rule_id
              WHERE t.company_id = ? AND ($where)
           ORDER BY $order
              LIMIT $limit OFFSET $offset",
            array_merge([$cid], $params)
        );
        return array_map([self::class, 'present'], $rows);
    }

    public static function present(array $t): array
    {
        $now = time();
        $due = $t['due_at'] ? strtotime($t['due_at']) : null;
        $open = !in_array($t['status'], ['done', 'cancelled'], true);
        $t['is_overdue'] = $open && $due && $due < $now;
        $t['overdue_minutes'] = $t['is_overdue'] ? (int) floor(($now - $due) / 60) : 0;
        $t['display_status'] = $t['is_overdue'] ? 'overdue' : $t['status'];
        $t['assignee_initials'] = MeController::initials($t['assignee_name'] ?? '');
        foreach (['id', 'assigned_to', 'assigned_by', 'checklist_total', 'checklist_done'] as $k) if (isset($t[$k])) $t[$k] = (int) $t[$k];
        $t['send_whatsapp'] = (bool) ($t['send_whatsapp'] ?? false);
        return $t;
    }

    private function load(int $id): array
    {
        $rows = self::fetchList($this->cid, 't.id = ?', [$id], 't.id', 1);
        if (!$rows) throw HttpError::notFound('Task not found');
        $t = $rows[0];
        $can = $t['assigned_to'] === $this->uid() || $t['assigned_by'] === $this->uid()
            || ($this->isManager() && in_array($t['assigned_to'], Auth::teamIds($this->user), true))
            || Db::value('SELECT 1 FROM task_checklist WHERE task_id = ? AND assigned_to = ?', [$t['id'], $this->uid()])
            || Db::value('SELECT 1 FROM task_watchers WHERE task_id = ? AND user_id = ?', [$t['id'], $this->uid()])
            || ($t['approval_status'] !== 'none' && \App\Services\TaskRules::canApprove($this->user, $t['approver_id'] ? (int) $t['approver_id'] : null));
        if (!$can) throw HttpError::forbidden();
        return $t;
    }

    private function canManage(array $t): bool
    {
        return $t['assigned_by'] === $this->uid() || ($this->isManager() && in_array($t['assigned_to'], Auth::teamIds($this->user), true));
    }

    private function log(int $taskId, string $action, $meta = null): void
    {
        Db::insert('task_activity', ['task_id' => $taskId, 'user_id' => $this->uid(), 'action' => $action, 'meta' => $meta ? json_encode($meta) : null]);
    }

    /* ───────────── endpoints ───────────── */

    /** GET /tasks?scope=to_me|by_me|team&filter=today|overdue|upcoming|done|recurring|all&q=&department_id=&assigned_to= */
    public function index(): array
    {
        $q = $this->req->query;
        $scope = $q['scope'] ?? 'to_me';
        $where = [];
        $p = [];

        switch ($scope) {
            case 'by_me': $where[] = 't.assigned_by = ?'; $p[] = $this->uid(); break;
            case 'team':
                $ids = Auth::teamIds($this->user);
                $where[] = 't.assigned_to IN ' . Db::in($ids); $p = array_merge($p, $ids); break;
            default:
                $where[] = "((t.assigned_to = ? AND t.approval_status = 'none') OR EXISTS (SELECT 1 FROM task_checklist cl WHERE cl.task_id = t.id AND cl.assigned_to = ?)
                             OR EXISTS (SELECT 1 FROM task_watchers tw WHERE tw.task_id = t.id AND tw.user_id = ?))";
                $p[] = $this->uid(); $p[] = $this->uid(); $p[] = $this->uid();
        }

        $open = "t.status NOT IN ('done','cancelled')";
        switch ($q['filter'] ?? 'all') {
            case 'today': $where[] = "DATE(t.due_at) = CURDATE()"; break;
            case 'overdue': $where[] = "$open AND t.due_at < NOW()"; break;
            case 'upcoming': $where[] = "$open AND DATE(t.due_at) > CURDATE()"; break;
            case 'done': $where[] = "t.status = 'done'"; break;
            case 'open': $where[] = $open; break;
            case 'recurring': $where[] = 't.recurring_rule_id IS NOT NULL'; break;
            case 'escalated': $where[] = "$open AND t.escalation_level > 0"; break;
            case 'approval': $where[] = "t.approval_status = 'pending'"; break;
        }
        if ($scope === 'team' && ($q['filter'] ?? '') !== 'approval') $where[] = "t.approval_status = 'none'";
        if (!empty($q['q'])) {
            $where[] = '(t.title LIKE ? OR t.description LIKE ? OR ua.name LIKE ? OR EXISTS (SELECT 1 FROM task_checklist cq WHERE cq.task_id = t.id AND cq.label LIKE ?))';
            $like = '%' . $q['q'] . '%'; array_push($p, $like, $like, $like, $like);
        }
        if (!empty($q['priority'])) { $where[] = 't.priority = ?'; $p[] = $q['priority']; }
        if (!empty($q['department_id'])) { $where[] = 't.department_id = ?'; $p[] = (int) $q['department_id']; }
        if (!empty($q['assigned_to'])) { $where[] = 't.assigned_to = ?'; $p[] = (int) $q['assigned_to']; }
        if (!empty($q['goal_id'])) { $where[] = 't.goal_id = ?'; $p[] = (int) $q['goal_id']; }
        if (!empty($q['from'])) { $where[] = 't.due_at >= ?'; $p[] = $q['from']; }
        if (!empty($q['to'])) { $where[] = 't.due_at < ?'; $p[] = $q['to']; }

        [$per, $off, $page] = $this->paginate();
        $w = implode(' AND ', $where);
        // Overdue first, then by due time; done items newest-completed first.
        $order = ($q['filter'] ?? '') === 'done' ? 't.completed_at DESC' : "($open AND t.due_at < NOW()) DESC, ISNULL(t.due_at), t.due_at";
        $items = self::fetchList($this->cid, $w, $p, $order, $per, $off);

        // tab counters for the chips (Today 5 · Overdue 2 …) within the chosen scope
        $scopeWhere = $where[0];
        $scopeParams = array_slice($p, 0, $scope === 'team' ? count(Auth::teamIds($this->user)) : ($scope === 'by_me' ? 1 : 3));
        $c = Db::one("SELECT COUNT(*) AS all_,
                SUM(DATE(t.due_at) = CURDATE()) AS today,
                SUM($open AND t.due_at < NOW()) AS overdue,
                SUM($open AND DATE(t.due_at) > CURDATE()) AS upcoming,
                SUM(t.status = 'done') AS done,
                SUM(t.recurring_rule_id IS NOT NULL) AS recurring
              FROM tasks t WHERE t.company_id = ? AND $scopeWhere", array_merge([$this->cid], $scopeParams));

        return ['items' => $items, 'page' => $page, 'counts' => array_map('intval', [
            'all' => $c['all_'], 'today' => $c['today'], 'overdue' => $c['overdue'],
            'upcoming' => $c['upcoming'], 'done' => $c['done'], 'recurring' => $c['recurring'],
        ])];
    }

    /** GET /tasks/{id} */
    public function show(): array
    {
        $t = $this->load($this->param('id'));
        $t['checklist'] = self::checklistFor($t, $this->uid(), $this->canManage($t));
        $t['attachments'] = Db::all("SELECT id, entity_type, kind, file_name, mime, size_bytes, duration_sec, created_at FROM attachments
                                      WHERE company_id = ? AND entity_type IN ('task','task_proof') AND entity_id = ?", [$this->cid, $t['id']]);
        $t['comments'] = Db::all('SELECT c.id, c.body, c.created_at, u.id AS user_id, u.name AS user_name
                                    FROM task_comments c JOIN users u ON u.id = c.user_id WHERE c.task_id = ? ORDER BY c.id', [$t['id']]);
        $t['activity'] = Db::all('SELECT a.action, a.meta, a.created_at, u.name AS user_name FROM task_activity a
                                LEFT JOIN users u ON u.id = a.user_id WHERE a.task_id = ? ORDER BY a.id', [$t['id']]);
        $t['can_manage'] = $this->canManage($t);
        $t['approver_name'] = $t['approver_id'] ? Db::value('SELECT name FROM users WHERE id = ?', [$t['approver_id']]) : null;
        $t['approved_by_name'] = $t['approved_by'] ? Db::value('SELECT name FROM users WHERE id = ?', [$t['approved_by']]) : null;
        $t['can_approve'] = $t['approval_status'] === 'pending' && \App\Services\TaskRules::canApprove($this->user, $t['approver_id'] ? (int) $t['approver_id'] : null);
        $t['watchers'] = Db::all('SELECT w.user_id, w.reason, u.name FROM task_watchers w JOIN users u ON u.id = w.user_id WHERE w.task_id = ?', [$t['id']]);
        return $t;
    }

    /**
     * POST /tasks  (JSON or multipart)
     * {title, assigned_to, due_at, priority, description, department_id, goal_id, remind_before_min,
     *  send_whatsapp, proof_type, checklist: [..], repeat: {frequency, weekdays, month_day, due_time, ends_on, rotation:[ids]}}
     * files: attachments[], voice_note
     */
    public function store(): array
    {
        $in = $this->req->require(['title']);
        $assignees = $this->assigneeInput();
        if (!$assignees) throw HttpError::badRequest('Choose who will do this task (Assign to)');
        foreach ($assignees as $a) {
            $this->assertSameCompanyUser($a);
            if ($a !== $this->uid() && !$this->isManager() && !\App\Core\Config::get('allow_peer_delegation', true)) {
                throw HttpError::forbidden('Only managers can assign to others');
            }
        }
        if (mb_strlen(trim((string) $in['title'])) < 2) throw HttpError::badRequest('Write the task');

        $base = $this->req->only(self::EDITABLE);
        if (empty($base['due_at'])) {
            // No due time given → default window (company setting, 4 hours by default)
            $hours = (int) (Db::value("SELECT JSON_UNQUOTE(JSON_EXTRACT(erp_settings, '$.default_due_hours')) FROM companies WHERE id = ?", [$this->cid]) ?: 4);
            $base['due_at'] = date('Y-m-d H:i:00', time() + $hours * 3600);
        }
        $repeat = $this->req->input('repeat');
        if (is_string($repeat)) $repeat = json_decode($repeat, true);
        $checklist = $this->checklistInput();

        // Staff can raise tasks for others, but they go live only after approval (manager → dept head → boss, or their deputy)
        $emergency = (bool) $this->req->input('is_emergency');
        if ($emergency) $base['priority'] = 'urgent';
        $rules = \App\Services\TaskRules::get($this->cid);
        $others = array_filter($assignees, fn($a) => $a !== $this->uid());
        $needsApproval = $rules['task_approval'] && !$this->isManager() && $others;
        $approver = $needsApproval ? \App\Services\TaskRules::approverFor($this->user) : null;
        if ($needsApproval && $approver === $this->uid()) $needsApproval = false;

        $ids = [];
        foreach ($assignees as $assignee) {
            $data = array_merge($base, [
                'company_id' => $this->cid,
                'title' => mb_substr(trim($in['title']), 0, 200),
                'assigned_to' => $assignee,
                'assigned_by' => $this->uid(),
                'source' => in_array($this->req->input('source'), ['voice', 'ai', 'manual'], true) ? $this->req->input('source') : 'manual',
            ]);
            unset($data['id']);
            $data['is_emergency'] = $emergency ? 1 : 0;
            if ($needsApproval && $assignee !== $this->uid()) { $data['approval_status'] = 'pending'; $data['approver_id'] = $approver; }
            if (empty($data['department_id']) || count($assignees) > 1) {
                $data['department_id'] = Db::value('SELECT department_id FROM users WHERE id = ?', [$assignee]) ?: ($base['department_id'] ?? null);
            }
            $data['send_whatsapp'] = !empty($data['send_whatsapp']) ? 1 : 0;
            $data = self::cleanTaskData($data);

            if (is_array($repeat) && !empty($repeat['frequency']) && $repeat['frequency'] !== 'none') {
                // A repeating task is stored as a rule; the first occurrence is created right away.
                $ruleId = RecurringController::createRule($this->cid, $this->uid(), $data, $repeat, $checklist);
                $data['recurring_rule_id'] = $ruleId;
                $data['source'] = 'recurring';
                $day = date('Y-m-d', strtotime($data['due_at']));
                if (!empty($repeat['starts_on']) && $repeat['starts_on'] > $day) $day = $repeat['starts_on'];
                $time = !empty($repeat['due_time']) ? date('H:i:s', strtotime($repeat['due_time'])) : date('H:i:s', strtotime($data['due_at']));
                $data['due_at'] = "$day $time";
            }

            $id = Db::tx(function () use ($data, $checklist) {
                $id = Db::insert('tasks', $data);
                self::insertChecklist($id, $checklist);
                return $id;
            });
            $ids[] = $id;
        }

        // Files are stored once and linked to every copy of the task
        $saved = [];
        foreach (Upload::list($this->req->files, 'attachments') as $f) $saved[] = Upload::save($f, $this->cid, $this->uid(), 'task', $ids[0]);
        if (!empty($this->req->files['voice_note'])) {
            $saved[] = Upload::save($this->req->files['voice_note'], $this->cid, $this->uid(), 'task', $ids[0], 'voice', $this->req->int('voice_duration'));
        }
        foreach (array_slice($ids, 1) as $other) {
            foreach ($saved as $a) {
                $row = array_intersect_key($a, array_flip(['company_id', 'entity_type', 'kind', 'file_name', 'path', 'mime', 'size_bytes', 'duration_sec', 'uploaded_by']));
                Db::insert('attachments', $row + ['entity_id' => $other]);
            }
        }

        $pending = 0;
        foreach ($ids as $id) {
            $this->log($id, 'created');
            if (Db::value('SELECT approval_status FROM tasks WHERE id = ?', [$id]) === 'pending') { $pending++; continue; }
            self::announceAssignment($id, $this->user['name']);
            self::notifyChecklistOwners($id, $this->user['name']);
        }
        if ($pending) {
            $title = ($emergency ? '🚨 ' : '') . "Task request from {$this->user['name']}";
            $dep = Db::value('SELECT deputy_id FROM users WHERE id = ?', [$approver]);
            foreach (array_filter([$approver, $dep ? (int) $dep : null]) as $u) {
                Notifier::notify($this->cid, $u, 'approval_needed', $title, mb_substr(trim($in['title']), 0, 120) . ($pending > 1 ? " · $pending people" : ''), 'task', $ids[0]);
            }
        }
        $out = $this->show2($ids[0]);
        $out['created_ids'] = $ids;
        $out['needs_approval'] = $pending > 0;
        $out['approver_name'] = $pending ? Db::value('SELECT name FROM users WHERE id = ?', [$approver]) : null;
        return $out;
    }

    /** assigned_to (one id) or assignees ([ids] / "1,2,3") */
    private function assigneeInput(): array
    {
        $a = $this->req->input('assignees');
        if (is_string($a)) $a = json_decode($a, true) ?? explode(',', $a);
        $list = is_array($a) ? $a : [];
        if (!$list && $this->req->input('assigned_to')) $list = explode(',', (string) $this->req->input('assigned_to'));
        return array_values(array_unique(array_filter(array_map('intval', $list))));
    }

    private function show2(int $id): array { $this->req->params['id'] = (string) $id; return $this->show(); }

    public static function announceAssignment(int $taskId, string $byName): void
    {
        $t = Db::one('SELECT * FROM tasks WHERE id = ?', [$taskId]);
        if ((int) $t['assigned_to'] === (int) $t['assigned_by']) return;
        $assignee = Db::one('SELECT * FROM users WHERE id = ?', [$t['assigned_to']]);
        Notifier::notify((int) $t['company_id'], (int) $t['assigned_to'], 'task_assigned', $t['is_emergency'] ? '🚨 EMERGENCY task' : 'New task assigned', $t['title'], 'task', $taskId);
        if ($t['send_whatsapp']) WhatsApp::taskAssigned($t, $assignee, $byName);
    }

    /** checklist: ["text", …] or [{label, assigned_to}, …] */
    private function checklistInput(): array
    {
        $c = $this->req->input('checklist', []);
        if (is_string($c)) $c = json_decode($c, true) ?: array_filter(array_map('trim', explode("\n", $c)));
        $out = [];
        foreach ((array) $c as $x) {
            $label = trim(is_array($x) ? (string) ($x['label'] ?? '') : (string) $x);
            if ($label === '') continue;
            $owner = is_array($x) && !empty($x['assigned_to']) ? (int) $x['assigned_to'] : null;
            if ($owner) $this->assertSameCompanyUser($owner);
            $out[] = $owner ? ['label' => $label, 'assigned_to' => $owner] : $label;
        }
        return $out;
    }

    public static function insertChecklist(int $taskId, array $items): void
    {
        foreach (array_values($items) as $i => $x) {
            $label = trim(is_array($x) ? (string) ($x['label'] ?? '') : (string) $x);
            if ($label === '') continue;
            Db::insert('task_checklist', ['task_id' => $taskId, 'label' => mb_substr($label, 0, 200), 'sort_order' => $i,
                'assigned_to' => is_array($x) && !empty($x['assigned_to']) ? (int) $x['assigned_to'] : null]);
        }
    }

    /** Checklist rows with owner names and whether the current user may tick each one (steps go in order). */
    public static function checklistFor(array $t, int $uid, bool $canManage): array
    {
        $rows = Db::all('SELECT c.id, c.label, c.is_done, c.assigned_to, c.done_at, ua.name AS assignee_name, ud.name AS done_by_name
                           FROM task_checklist c LEFT JOIN users ua ON ua.id = c.assigned_to LEFT JOIN users ud ON ud.id = c.done_by
                          WHERE c.task_id = ? ORDER BY c.sort_order, c.id', [$t['id']]);
        $prevDone = true;
        foreach ($rows as &$r) {
            $r['is_done'] = (int) $r['is_done'];
            $r['assigned_to'] = $r['assigned_to'] ? (int) $r['assigned_to'] : null;
            $owner = $r['assigned_to'] ?? (int) $t['assigned_to'];
            $open = !in_array($t['status'], ['done', 'cancelled'], true);
            $r['can_tick'] = $open && ($owner === $uid || (int) $t['assigned_to'] === $uid || $canManage) && ($r['is_done'] || $prevDone);
            $r['locked'] = !$r['is_done'] && !$prevDone;
            $prevDone = $prevDone && $r['is_done'];
        }
        return $rows;
    }

    /** Tell people who own a checklist step (other than the main assignee) that the task includes them. */
    public static function notifyChecklistOwners(int $taskId, string $byName): void
    {
        $t = Db::one('SELECT * FROM tasks WHERE id = ?', [$taskId]);
        $first = Db::one('SELECT * FROM task_checklist WHERE task_id = ? AND is_done = 0 ORDER BY sort_order, id LIMIT 1', [$taskId]);
        $owners = Db::all('SELECT DISTINCT assigned_to FROM task_checklist WHERE task_id = ? AND assigned_to IS NOT NULL AND assigned_to <> ?', [$taskId, $t['assigned_to']]);
        foreach ($owners as $o) {
            $isNext = $first && (int) $first['assigned_to'] === (int) $o['assigned_to'];
            Notifier::notify((int) $t['company_id'], (int) $o['assigned_to'], 'task_assigned',
                $isNext ? 'Your step is ready' : "$byName added you to a task", $t['title'], 'task', $taskId);
        }
    }

    public static function cleanTaskData(array $d): array
    {
        if (isset($d['priority']) && !in_array($d['priority'], ['low', 'medium', 'high', 'urgent'], true)) $d['priority'] = 'medium';
        if (array_key_exists('due_at', $d)) $d['due_at'] = $d['due_at'] ? date('Y-m-d H:i:s', strtotime($d['due_at'])) : null;
        foreach (['department_id', 'goal_id', 'campaign_id', 'remind_before_min'] as $k) {
            if (array_key_exists($k, $d)) $d[$k] = ($d[$k] === '' || $d[$k] === null) ? null : (int) $d[$k];
        }
        if (isset($d['proof_type']) && is_array($d['proof_type'])) $d['proof_type'] = implode(',', $d['proof_type']);
        if (isset($d['proof_type']) && $d['proof_type'] === '') $d['proof_type'] = null;
        return $d;
    }

    /** PATCH /tasks/{id} — assigner / manager edits */
    public function update(): array
    {
        $t = $this->load($this->param('id'));
        if (!$this->canManage($t)) throw HttpError::forbidden('Only the person who assigned this task can edit it');
        $data = self::cleanTaskData($this->req->only(self::EDITABLE));
        if (isset($data['assigned_to'])) $this->assertSameCompanyUser((int) $data['assigned_to']);
        if (isset($data['send_whatsapp'])) $data['send_whatsapp'] = $data['send_whatsapp'] ? 1 : 0;
        if (isset($data['due_at'])) { $data['reminder_sent_at'] = null; if (strtotime($data['due_at']) > time()) $data['escalation_level'] = 0; }
        if ($r = $this->req->int('manager_rating')) $data['manager_rating'] = max(1, min(5, $r));
        Db::update('tasks', $t['id'], $data, $this->cid);
        $this->log($t['id'], 'updated', array_keys($data));
        if (isset($data['assigned_to']) && (int) $data['assigned_to'] !== $t['assigned_to']) {
            self::announceAssignment($t['id'], $this->user['name']);
        }
        return $this->show();
    }

    /** POST /tasks/{id}/status {status: not_started|in_progress|cancelled} */
    public function status(): array
    {
        $t = $this->load($this->param('id'));
        $s = $this->req->require(['status'])['status'];
        if (!in_array($s, ['not_started', 'in_progress', 'on_hold', 'cancelled'], true)) throw HttpError::badRequest('Use /complete to finish a task');
        if ($s === 'cancelled' && !$this->canManage($t)) throw HttpError::forbidden();
        self::setStatus($t, $s, $this->uid());
        return $this->show();
    }

    public static function setStatus(array $t, string $status, ?int $byUser, array $extra = []): void
    {
        $data = ['status' => $status] + $extra;
        if ($status === 'in_progress' && empty($t['started_at'])) $data['started_at'] = date('Y-m-d H:i:s');
        if ($status === 'done') $data['completed_at'] = date('Y-m-d H:i:s');
        if ($status !== 'done') $data['completed_at'] = null;
        Db::update('tasks', (int) $t['id'], $data);
        Db::insert('task_activity', ['task_id' => $t['id'], 'user_id' => $byUser, 'action' => 'status:' . $status]);
        if (in_array($status, ['done', 'cancelled'], true)) \App\Services\Erp\Workflow::onTaskClosed($t);

        if ($status === 'done' && (int) $t['assigned_by'] !== (int) $t['assigned_to']) {
            $who = Db::value('SELECT name FROM users WHERE id = ?', [$t['assigned_to']]);
            Notifier::notify((int) $t['company_id'], (int) $t['assigned_by'], 'task_done', "$who completed a task", $t['title'], 'task', (int) $t['id']);
            $assigner = Db::one('SELECT * FROM users WHERE id = ?', [$t['assigned_by']]);
            if ($t['send_whatsapp']) WhatsApp::send((int) $t['company_id'], $assigner, "✅ $who completed: {$t['title']}", (int) $t['id']);
        }
    }

    /** POST /tasks/{id}/complete (multipart) — remarks, lat, lng, place, photo[], file[], link */
    public function complete(): array
    {
        $t = $this->load($this->param('id'));
        if ($t['assigned_to'] !== $this->uid() && !$this->canManage($t)) throw HttpError::forbidden();
        $proof = array_filter(explode(',', (string) $t['proof_type']));
        $photos = Upload::list($this->req->files, 'photo');
        $files = Upload::list($this->req->files, 'file');
        $lat = $this->req->input('lat');
        $lng = $this->req->input('lng');

        if ($t['status'] === 'done') throw HttpError::badRequest('This task is already complete');
        $openSteps = (int) Db::value('SELECT COUNT(*) FROM task_checklist WHERE task_id = ? AND is_done = 0', [$t['id']]);
        if ($openSteps && !$this->canManage($t)) throw HttpError::badRequest("Finish the checklist first ($openSteps step" . ($openSteps > 1 ? 's' : '') . ' left)');
        $link = trim((string) $this->req->input('link'));
        if ($link !== '' && !preg_match('~^https?://\S+\.\S+~i', $link)) throw HttpError::badRequest('Proof link must start with http:// or https://');
        if (in_array('photo', $proof, true) && !$photos) throw HttpError::badRequest('Photo proof is required for this task');
        if (in_array('file', $proof, true) && !$files) throw HttpError::badRequest('File proof is required for this task');
        if (in_array('location', $proof, true) && ($lat === null || $lng === null)) throw HttpError::badRequest('Location is required for this task');
        if (in_array('link', $proof, true) && !$this->req->input('link')) throw HttpError::badRequest('Link is required for this task');

        foreach (array_merge($photos, $files) as $f) Upload::save($f, $this->cid, $this->uid(), 'task_proof', $t['id']);
        if ($link = $this->req->input('link')) {
            Db::insert('attachments', ['company_id' => $this->cid, 'entity_type' => 'task_proof', 'entity_id' => $t['id'], 'kind' => 'link',
                'file_name' => mb_substr($link, 0, 200), 'path' => $link, 'uploaded_by' => $this->uid()]);
        }

        $place = $this->req->input('place');
        if (!$place && $lat !== null) {
            $g = \App\Services\Geo::matchGeofence($this->cid, (float) $lat, (float) $lng);
            $place = $g['name'] ?? null;
        }
        self::setStatus($t, 'done', $this->uid(), [
            'completion_remarks' => $this->req->input('remarks'),
            'completion_lat' => $lat, 'completion_lng' => $lng, 'completion_place' => $place,
        ]);
        return $this->show();
    }

    /** POST /tasks/{id}/reopen */
    public function reopen(): array
    {
        $t = $this->load($this->param('id'));
        if (!$this->canManage($t)) throw HttpError::forbidden();
        self::setStatus($t, 'in_progress', $this->uid());
        return $this->show();
    }

    /** PATCH /tasks/{id}/checklist/{itemId} {is_done} — steps are done in order, each by its owner */
    public function toggleChecklist(): array
    {
        $t = $this->load($this->param('id'));
        $items = self::checklistFor($t, $this->uid(), $this->canManage($t));
        $item = null;
        foreach ($items as $i) if ((int) $i['id'] === (int) $this->param('itemId')) $item = $i;
        if (!$item) throw HttpError::notFound('Checklist item not found');
        $done = $this->req->input('is_done') ? 1 : 0;
        if ($done && $item['locked']) throw HttpError::badRequest('Finish the earlier checklist steps first');
        if (!$item['can_tick']) throw HttpError::forbidden(($item['assignee_name'] ?? 'The assigned person') . ' has to tick this step');

        Db::exec('UPDATE task_checklist SET is_done = ?, done_by = ?, done_at = ? WHERE id = ? AND task_id = ?',
            [$done, $done ? $this->uid() : null, $done ? date('Y-m-d H:i:s') : null, $item['id'], $t['id']]);
        $this->log($t['id'], ($done ? 'step done: ' : 'step undone: ') . mb_substr($item['label'], 0, 60));
        if ($t['status'] === 'not_started') self::setStatus($t, 'in_progress', $this->uid());

        if ($done) {
            $next = Db::one('SELECT * FROM task_checklist WHERE task_id = ? AND is_done = 0 ORDER BY sort_order, id LIMIT 1', [$t['id']]);
            if ($next) {
                $owner = (int) ($next['assigned_to'] ?: $t['assigned_to']);
                if ($owner !== $this->uid()) Notifier::notify($this->cid, $owner, 'task_assigned', 'Your step is ready', "{$t['title']} → {$next['label']}", 'task', $t['id']);
            } elseif (!$t['proof_type']) {
                // last step ticked and no proof needed → the task is complete
                self::setStatus($t, 'done', $this->uid(), ['completion_remarks' => 'All checklist steps done']);
            } elseif ((int) $t['assigned_to'] !== $this->uid()) {
                Notifier::notify($this->cid, (int) $t['assigned_to'], 'task_due', 'All steps done — add proof', "Complete \"{$t['title']}\" with {$t['proof_type']} proof", 'task', $t['id']);
            }
        }
        return $this->show();
    }

    /** POST /tasks/{id}/checklist {label} */
    public function addChecklist(): array
    {
        $t = $this->load($this->param('id'));
        $label = $this->req->require(['label'])['label'];
        $max = (int) Db::value('SELECT COALESCE(MAX(sort_order),0) FROM task_checklist WHERE task_id = ?', [$t['id']]);
        $owner = $this->req->int('assigned_to') ?: null;
        if ($owner) $this->assertSameCompanyUser($owner);
        Db::insert('task_checklist', ['task_id' => $t['id'], 'label' => mb_substr($label, 0, 200), 'sort_order' => $max + 1, 'assigned_to' => $owner]);
        return $this->show();
    }

    /** POST /tasks/{id}/comments {body} */
    public function comment(): array
    {
        $t = $this->load($this->param('id'));
        $body = trim((string) $this->req->require(['body'])['body']);
        Db::insert('task_comments', ['task_id' => $t['id'], 'user_id' => $this->uid(), 'body' => $body]);
        $other = $t['assigned_to'] === $this->uid() ? $t['assigned_by'] : $t['assigned_to'];
        if ($other !== $this->uid()) Notifier::notify($this->cid, $other, 'task_comment', $this->user['name'] . ' commented', mb_substr($body, 0, 120), 'task', $t['id']);
        return $this->show();
    }

    /** POST /tasks/{id}/attachments (multipart files[] or voice_note) */
    public function attach(): array
    {
        $t = $this->load($this->param('id'));
        foreach (Upload::list($this->req->files, 'files') as $f) Upload::save($f, $this->cid, $this->uid(), 'task', $t['id']);
        if (!empty($this->req->files['voice_note'])) Upload::save($this->req->files['voice_note'], $this->cid, $this->uid(), 'task', $t['id'], 'voice', $this->req->int('voice_duration'));
        return $this->show();
    }

    /** DELETE /tasks/{id} */
    public function destroy(): array
    {
        $t = $this->load($this->param('id'));
        if (!$this->canManage($t)) throw HttpError::forbidden();
        Db::exec('DELETE FROM tasks WHERE id = ? AND company_id = ?', [$t['id'], $this->cid]);
        return ['deleted' => true];
    }

    /* ───────────── task requests (approval) ───────────── */

    /** GET /task-approvals — task requests waiting for me (approver, their deputy, or the boss) + recent decisions */
    public function approvals(): array
    {
        $rows = self::fetchList($this->cid, "t.approval_status = 'pending'", [], 't.id DESC', 200);
        $mine = array_values(array_filter($rows, fn($t) => \App\Services\TaskRules::canApprove($this->user, $t['approver_id'] ? (int) $t['approver_id'] : null)));
        foreach ($mine as &$t) $t['approver_name'] = Db::value('SELECT name FROM users WHERE id = ?', [$t['approver_id']]);
        $done = Db::all("SELECT a.task_id, a.action, a.created_at, u.name AS by_name, t.title, ua.name AS assignee_name, ub.name AS requested_by
                           FROM task_activity a JOIN tasks t ON t.id = a.task_id LEFT JOIN users u ON u.id = a.user_id
                           JOIN users ua ON ua.id = t.assigned_to JOIN users ub ON ub.id = t.assigned_by
                          WHERE t.company_id = ? AND (a.action LIKE 'request approved%' OR a.action LIKE 'request rejected%') ORDER BY a.id DESC LIMIT 50", [$this->cid]);
        return ['pending' => $mine, 'history' => $done];
    }

    /** POST /tasks/{id}/approve {note} · /tasks/{id}/reject {note} */
    public function approve(): array { return $this->decide(true); }
    public function reject(): array { return $this->decide(false); }

    private function decide(bool $ok): array
    {
        $t = $this->load($this->param('id'));
        if ($t['approval_status'] !== 'pending') throw HttpError::badRequest('This request is already decided');
        if (!\App\Services\TaskRules::canApprove($this->user, $t['approver_id'] ? (int) $t['approver_id'] : null)) throw HttpError::forbidden('Only the approver or their deputy can decide');
        $note = trim((string) $this->req->input('note'));
        $voice = $this->req->files['voice_note'] ?? null;
        if ($voice && $note === '') $note = '🎤 Voice note';
        if (!$ok && $note === '') throw HttpError::badRequest('Write or record a reason to reject');
        if ($voice) {
            $a = Upload::save($voice, $this->cid, $this->uid(), 'task', $t['id'], 'voice', $this->req->int('voice_duration'));
            Db::exec('UPDATE attachments SET file_name = ? WHERE id = ?', [($ok ? 'Approval note' : 'Rejection reason') . ' — ' . $this->user['name'], $a['id']]);
        }
        $behalf = ($t['approver_id'] && (int) $t['approver_id'] !== $this->uid()) ? ' (on behalf of ' . Db::value('SELECT name FROM users WHERE id = ?', [$t['approver_id']]) . ')' : '';
        Db::update('tasks', $t['id'], ['approval_status' => $ok ? 'none' : 'rejected', 'approved_by' => $this->uid(), 'approval_note' => mb_substr($note, 0, 250) ?: null]
            + ($ok ? [] : ['status' => 'cancelled']));
        $this->log($t['id'], ($ok ? 'request approved' : 'request rejected') . $behalf . ($note ? ": $note" : ''));
        if ($ok) {
            self::announceAssignment($t['id'], Db::value('SELECT name FROM users WHERE id = ?', [$t['assigned_by']]));
            self::notifyChecklistOwners($t['id'], $this->user['name']);
        }
        Notifier::notify($this->cid, (int) $t['assigned_by'], $ok ? 'approval_done' : 'approval_rejected',
            ($ok ? 'Task approved: ' : 'Task request rejected: ') . $t['title'], $ok ? "By {$this->user['name']}$behalf" : $note, 'task', $t['id']);
        return $this->show();
    }

    /* ───────────── handover (going on leave) ───────────── */

    /** POST /tasks/handover {to_user, from_user?, note, until_date} — move every open task to a colleague */
    public function handover(): array
    {
        $from = $this->req->int('from_user') ?: $this->uid();
        $to = $this->req->int('to_user');
        if (!$to) throw HttpError::badRequest('Choose who will take over the tasks');
        if ($from === $to) throw HttpError::badRequest('Choose a different person');
        $this->assertSameCompanyUser($from); $this->assertSameCompanyUser($to);
        if ($from !== $this->uid() && !$this->isManager()) throw HttpError::forbidden('Only a manager can hand over someone else\'s tasks');
        $ids = array_map('intval', array_column(Db::all("SELECT id FROM tasks WHERE company_id = ? AND assigned_to = ? AND status NOT IN ('done','cancelled')", [$this->cid, $from]), 'id'));
        if (!$ids) throw HttpError::badRequest('There are no open tasks to hand over');
        $fromName = Db::value('SELECT name FROM users WHERE id = ?', [$from]);
        $toName = Db::value('SELECT name FROM users WHERE id = ?', [$to]);
        $note = mb_substr(trim((string) $this->req->input('note')), 0, 250) ?: null;
        Db::tx(function () use ($ids, $to, $from, $note, $fromName, $toName) {
            Db::exec('UPDATE tasks SET assigned_to = ? WHERE id IN ' . Db::in($ids), array_merge([$to], $ids));
            Db::exec('UPDATE task_checklist SET assigned_to = ? WHERE assigned_to = ? AND is_done = 0 AND task_id IN ' . Db::in($ids), array_merge([$to, $from], $ids));
            foreach ($ids as $id) $this->log($id, "handed over: $fromName → $toName" . ($note ? " ($note)" : ''));
            Db::insert('task_handovers', ['company_id' => $this->cid, 'from_user' => $from, 'to_user' => $to, 'by_user' => $this->uid(),
                'task_ids' => json_encode($ids), 'note' => $note, 'until_date' => $this->req->input('until_date') ?: null]);
        });
        Notifier::notify($this->cid, $to, 'task_assigned', count($ids) . " tasks handed over to you", "From $fromName" . ($note ? " · $note" : ''), null, null);
        if ($from !== $this->uid()) Notifier::notify($this->cid, $from, 'task_assigned', 'Your tasks were handed over', "To $toName", null, null);
        return ['moved' => count($ids), 'to' => $toName];
    }

    /** GET /tasks/handovers */
    public function handovers(): array
    {
        $rows = Db::all('SELECT h.*, f.name AS from_name, t.name AS to_name, b.name AS by_name FROM task_handovers h
                           JOIN users f ON f.id = h.from_user JOIN users t ON t.id = h.to_user JOIN users b ON b.id = h.by_user
                          WHERE h.company_id = ? AND (? OR h.from_user = ? OR h.to_user = ?) ORDER BY h.id DESC LIMIT 50',
            [$this->cid, $this->isManager() ? 1 : 0, $this->uid(), $this->uid()]);
        foreach ($rows as &$r) { $r['task_count'] = count(json_decode($r['task_ids'], true) ?: []); unset($r['task_ids']); }
        return $rows;
    }

    /** POST /tasks/handovers/{id}/return — give back the tasks that are still open */
    public function handBack(): array
    {
        $h = Db::one('SELECT * FROM task_handovers WHERE id = ? AND company_id = ? AND returned_at IS NULL', [$this->param('id'), $this->cid]);
        if (!$h) throw HttpError::notFound('Handover not found or already returned');
        if (!in_array($this->uid(), [(int) $h['from_user'], (int) $h['to_user']], true) && !$this->isManager()) throw HttpError::forbidden();
        $ids = json_decode($h['task_ids'], true) ?: [];
        $open = $ids ? array_map('intval', array_column(Db::all("SELECT id FROM tasks WHERE assigned_to = ? AND status NOT IN ('done','cancelled') AND id IN " . Db::in($ids), array_merge([$h['to_user']], $ids)), 'id')) : [];
        if ($open) {
            Db::exec('UPDATE tasks SET assigned_to = ? WHERE id IN ' . Db::in($open), array_merge([$h['from_user']], $open));
            foreach ($open as $id) $this->log($id, 'handed back');
        }
        Db::exec('UPDATE task_handovers SET returned_at = NOW() WHERE id = ?', [$h['id']]);
        Notifier::notify($this->cid, (int) $h['from_user'], 'task_assigned', count($open) . ' tasks are back with you', null, null, null);
        return ['returned' => count($open)];
    }

    /** POST /tasks/parse-voice {text} — turn a spoken sentence into a task draft */
    public function parseVoice(): array
    {
        $text = trim((string) $this->req->require(['text'])['text']);
        $people = Db::all('SELECT id, name FROM users WHERE company_id = ? AND is_active = 1', [$this->cid]);
        return \App\Services\VoiceParser::parse($text, $people);
    }
}
