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
            "SELECT t.*, ua.name AS assignee_name, ub.name AS assigner_name, d.name AS department_name,
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
            || ($this->isManager() && in_array($t['assigned_to'], Auth::teamIds($this->user), true));
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
            default: $where[] = 't.assigned_to = ?'; $p[] = $this->uid();
        }

        $open = "t.status NOT IN ('done','cancelled')";
        switch ($q['filter'] ?? 'all') {
            case 'today': $where[] = "DATE(t.due_at) = CURDATE()"; break;
            case 'overdue': $where[] = "$open AND t.due_at < NOW()"; break;
            case 'upcoming': $where[] = "$open AND DATE(t.due_at) > CURDATE()"; break;
            case 'done': $where[] = "t.status = 'done'"; break;
            case 'open': $where[] = $open; break;
            case 'recurring': $where[] = 't.recurring_rule_id IS NOT NULL'; break;
        }
        if (!empty($q['q'])) { $where[] = 't.title LIKE ?'; $p[] = '%' . $q['q'] . '%'; }
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
        $scopeParams = array_slice($p, 0, $scope === 'team' ? count(Auth::teamIds($this->user)) : 1);
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
        $t['checklist'] = Db::all('SELECT id, label, is_done FROM task_checklist WHERE task_id = ? ORDER BY sort_order, id', [$t['id']]);
        $t['attachments'] = Db::all("SELECT id, entity_type, kind, file_name, mime, size_bytes, duration_sec, created_at FROM attachments
                                      WHERE company_id = ? AND entity_type IN ('task','task_proof') AND entity_id = ?", [$this->cid, $t['id']]);
        $t['comments'] = Db::all('SELECT c.id, c.body, c.created_at, u.id AS user_id, u.name AS user_name
                                    FROM task_comments c JOIN users u ON u.id = c.user_id WHERE c.task_id = ? ORDER BY c.id', [$t['id']]);
        $t['activity'] = Db::all('SELECT a.action, a.meta, a.created_at, u.name AS user_name FROM task_activity a
                                LEFT JOIN users u ON u.id = a.user_id WHERE a.task_id = ? ORDER BY a.id', [$t['id']]);
        $t['can_manage'] = $this->canManage($t);
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
        $in = $this->req->require(['title', 'assigned_to']);
        $assignee = (int) $in['assigned_to'];
        $this->assertSameCompanyUser($assignee);
        if ($assignee !== $this->uid() && !$this->isManager() && !\App\Core\Config::get('allow_peer_delegation', true)) {
            throw HttpError::forbidden('Only managers can assign to others');
        }

        $data = $this->req->only(self::EDITABLE);
        $data = array_merge($data, [
            'company_id' => $this->cid,
            'title' => mb_substr(trim($in['title']), 0, 200),
            'assigned_to' => $assignee,
            'assigned_by' => $this->uid(),
            'source' => in_array($this->req->input('source'), ['voice', 'ai', 'manual'], true) ? $this->req->input('source') : 'manual',
        ]);
        if (empty($data['department_id'])) {
            $data['department_id'] = Db::value('SELECT department_id FROM users WHERE id = ?', [$assignee]);
        }
        $data['send_whatsapp'] = !empty($data['send_whatsapp']) ? 1 : 0;
        $data = self::cleanTaskData($data);

        $repeat = $this->req->input('repeat');
        if (is_string($repeat)) $repeat = json_decode($repeat, true);
        if (is_array($repeat) && !empty($repeat['frequency']) && $repeat['frequency'] !== 'none') {
            // A repeating task is stored as a rule; the first occurrence is created right away.
            $ruleId = RecurringController::createRule($this->cid, $this->uid(), $data, $repeat, $this->checklistInput());
            $data['recurring_rule_id'] = $ruleId;
            $data['source'] = 'recurring';
        }

        $id = Db::tx(function () use ($data) {
            $id = Db::insert('tasks', $data);
            self::insertChecklist($id, $this->checklistInput());
            return $id;
        });

        foreach (Upload::list($this->req->files, 'attachments') as $f) Upload::save($f, $this->cid, $this->uid(), 'task', $id);
        if (!empty($this->req->files['voice_note'])) {
            Upload::save($this->req->files['voice_note'], $this->cid, $this->uid(), 'task', $id, 'voice', $this->req->int('voice_duration'));
        }

        $this->log($id, 'created');
        self::announceAssignment($id, $this->user['name']);
        return $this->show2($id);
    }

    private function show2(int $id): array { $this->req->params['id'] = (string) $id; return $this->show(); }

    public static function announceAssignment(int $taskId, string $byName): void
    {
        $t = Db::one('SELECT * FROM tasks WHERE id = ?', [$taskId]);
        if ((int) $t['assigned_to'] === (int) $t['assigned_by']) return;
        $assignee = Db::one('SELECT * FROM users WHERE id = ?', [$t['assigned_to']]);
        Notifier::notify((int) $t['company_id'], (int) $t['assigned_to'], 'task_assigned', 'New task assigned', $t['title'], 'task', $taskId);
        if ($t['send_whatsapp']) WhatsApp::taskAssigned($t, $assignee, $byName);
    }

    private function checklistInput(): array
    {
        $c = $this->req->input('checklist', []);
        if (is_string($c)) $c = json_decode($c, true) ?: array_filter(array_map('trim', explode("\n", $c)));
        return array_values(array_filter(array_map(fn($x) => is_array($x) ? ($x['label'] ?? '') : (string) $x, (array) $c)));
    }

    public static function insertChecklist(int $taskId, array $labels): void
    {
        foreach ($labels as $i => $label) {
            if (trim($label) === '') continue;
            Db::insert('task_checklist', ['task_id' => $taskId, 'label' => mb_substr(trim($label), 0, 200), 'sort_order' => $i]);
        }
    }

    public static function cleanTaskData(array $d): array
    {
        if (isset($d['priority']) && !in_array($d['priority'], ['low', 'medium', 'high'], true)) $d['priority'] = 'medium';
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
        if (isset($data['due_at'])) $data['reminder_sent_at'] = null;
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

    /** PATCH /tasks/{id}/checklist/{itemId} {is_done} */
    public function toggleChecklist(): array
    {
        $t = $this->load($this->param('id'));
        Db::exec('UPDATE task_checklist SET is_done = ? WHERE id = ? AND task_id = ?', [$this->req->input('is_done') ? 1 : 0, $this->param('itemId'), $t['id']]);
        if ($t['status'] === 'not_started') self::setStatus($t, 'in_progress', $this->uid());
        return $this->show();
    }

    /** POST /tasks/{id}/checklist {label} */
    public function addChecklist(): array
    {
        $t = $this->load($this->param('id'));
        $label = $this->req->require(['label'])['label'];
        $max = (int) Db::value('SELECT COALESCE(MAX(sort_order),0) FROM task_checklist WHERE task_id = ?', [$t['id']]);
        Db::insert('task_checklist', ['task_id' => $t['id'], 'label' => mb_substr($label, 0, 200), 'sort_order' => $max + 1]);
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

    /** POST /tasks/parse-voice {text} — turn a spoken sentence into a task draft */
    public function parseVoice(): array
    {
        $text = trim((string) $this->req->require(['text'])['text']);
        $people = Db::all('SELECT id, name FROM users WHERE company_id = ? AND is_active = 1', [$this->cid]);
        return \App\Services\VoiceParser::parse($text, $people);
    }
}
