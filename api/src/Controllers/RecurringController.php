<?php
namespace App\Controllers;

use App\Core\{Controller, Db, HttpError};
use App\Services\RecurringEngine;

final class RecurringController extends Controller
{
    /** Used by TaskController::store when "Repeat" is set on a new task. */
    public static function createRule(int $cid, int $uid, array $task, array $repeat, array $checklist): int
    {
        $rotation = array_values(array_filter(array_map('intval', (array) ($repeat['rotation'] ?? []))));
        $weekdays = $repeat['weekdays'] ?? null;
        if (is_array($weekdays)) $weekdays = implode(',', array_map('intval', $weekdays));
        $dueTime = $repeat['due_time'] ?? ($task['due_at'] ? date('H:i:s', strtotime($task['due_at'])) : '10:00:00');

        return Db::insert('recurring_rules', [
            'company_id' => $cid, 'title' => $task['title'], 'description' => $task['description'] ?? null,
            'department_id' => $task['department_id'] ?? null, 'created_by' => $uid, 'priority' => $task['priority'] ?? 'medium',
            'frequency' => in_array($repeat['frequency'], ['daily', 'weekly', 'monthly', 'custom'], true) ? $repeat['frequency'] : 'daily',
            'weekdays' => $weekdays ?: null, 'month_day' => isset($repeat['month_day']) ? (int) $repeat['month_day'] : null,
            'interval_days' => isset($repeat['interval_days']) ? (int) $repeat['interval_days'] : null,
            'due_time' => date('H:i:s', strtotime($dueTime)), 'ends_on' => ($repeat['ends_on'] ?? null) ?: null,
            'starts_on' => ($repeat['starts_on'] ?? null) ?: null,
            'start_time' => !empty($repeat['start_time']) ? date('H:i:s', strtotime($repeat['start_time'])) : null,
            'proof_type' => $task['proof_type'] ?? null, 'checklist_json' => json_encode($checklist, JSON_UNESCAPED_UNICODE),
            'rotation_json' => $rotation ? json_encode($rotation) : null,
            'rotation_index' => $rotation ? 1 : 0, // index 0 gets the first occurrence created by TaskController
            'assignee_id' => $task['assigned_to'], 'goal_id' => $task['goal_id'] ?? null,
            'last_generated_on' => !empty($task['due_at']) ? date('Y-m-d', strtotime($task['due_at'])) : null,
        ]);
    }

    /** GET /recurring — list with 30-day on-time rate */
    public function index(): array
    {
        $rows = Db::all(
            "SELECT r.*, u.name AS assignee_name,
                    (SELECT COUNT(*) FROM tasks t WHERE t.recurring_rule_id = r.id AND t.due_at >= NOW() - INTERVAL 30 DAY AND t.due_at < NOW()) AS due_30,
                    (SELECT COUNT(*) FROM tasks t WHERE t.recurring_rule_id = r.id AND t.due_at >= NOW() - INTERVAL 30 DAY AND t.due_at < NOW()
                        AND t.status = 'done' AND t.completed_at <= t.due_at) AS ontime_30
               FROM recurring_rules r LEFT JOIN users u ON u.id = r.assignee_id
              WHERE r.company_id = ? AND r.is_active = 1 ORDER BY r.title", [$this->cid]);
        $names = array_column(Db::all('SELECT id, name FROM users WHERE company_id = ?', [$this->cid]), 'name', 'id');
        return array_map(function ($r) use ($names) {
            $rot = $r['rotation_json'] ? json_decode($r['rotation_json'], true) : [];
            $r['rotation'] = array_map(fn($id) => ['id' => (int) $id, 'name' => $names[$id] ?? '?'], $rot);
            $r['assignee_names'] = $rot ? implode(', ', array_column($r['rotation'], 'name')) : $r['assignee_name'];
            $r['checklist'] = $r['checklist_json'] ? json_decode($r['checklist_json'], true) : [];
            $r['next_dates'] = RecurringEngine::nextDates($r, 3);
            $r['on_time_pct'] = $r['due_30'] ? (int) round($r['ontime_30'] * 100 / $r['due_30']) : null;
            $r['repeat_label'] = self::label($r);
            unset($r['rotation_json'], $r['checklist_json']);
            return $r;
        }, $rows);
    }

    public static function label(array $r): string
    {
        $days = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        $fmt = fn($x) => date(date('i', strtotime($x)) === '00' ? 'g A' : 'g:i A', strtotime($x));
        $time = !empty($r['start_time']) ? $fmt($r['start_time']) . '–' . $fmt($r['due_time']) : $fmt($r['due_time']);
        switch ($r['frequency']) {
            case 'daily': return "Daily $time";
            case 'weekly':
                $wd = array_map(fn($d) => $days[(int) $d] ?? '', explode(',', (string) $r['weekdays']));
                return (count($wd) === 1 ? 'Every ' . $wd[0] : implode(', ', $wd)) . " · $time";
            case 'monthly':
                $n = (int) $r['month_day'];
                $suf = ($n % 100 >= 11 && $n % 100 <= 13) ? 'th' : (['th', 'st', 'nd', 'rd'][$n % 10] ?? 'th');
                return "Every month on $n$suf · $time";
            default: return 'Every ' . (int) $r['interval_days'] . " days · $time";
        }
    }

    /** POST /recurring — create a rule directly (admin "New recurring task") */
    public function store(): array
    {
        $in = $this->req->require(['title', 'frequency']);
        $assignee = $this->req->int('assigned_to');
        $rotation = (array) $this->req->input('rotation', []);
        if (!$assignee && !$rotation) throw HttpError::badRequest('Choose an assignee or rotation');
        foreach (array_merge([$assignee], $rotation) as $u) if ($u) $this->assertSameCompanyUser((int) $u);

        $task = TaskController::cleanTaskData($this->req->only(['title', 'description', 'department_id', 'priority', 'proof_type', 'goal_id']));
        $task['assigned_to'] = $assignee ?: (int) $rotation[0];
        $task['due_at'] = null;
        $repeat = $this->req->only(['frequency', 'weekdays', 'month_day', 'interval_days', 'due_time', 'ends_on', 'starts_on', 'start_time']) + ['rotation' => $rotation];
        $checklist = (array) $this->req->input('checklist', []);
        $id = self::createRule($this->cid, $this->uid(), $task, $repeat, $checklist);
        Db::exec('UPDATE recurring_rules SET rotation_index = 0 WHERE id = ?', [$id]);

        // If it fires today and time hasn't passed, create today's occurrence immediately.
        $r = Db::one('SELECT * FROM recurring_rules WHERE id = ?', [$id]);
        if (RecurringEngine::firesOn($r, strtotime('today')) && strtotime(date('Y-m-d') . ' ' . $r['due_time']) > time()) RecurringEngine::generate($r, date('Y-m-d'));
        return ['id' => $id];
    }

    /** PATCH /recurring/{id} */
    public function update(): array
    {
        $id = $this->param('id');
        $data = $this->req->only(['title', 'description', 'priority', 'frequency', 'weekdays', 'month_day', 'interval_days', 'due_time', 'ends_on', 'starts_on', 'start_time', 'proof_type', 'is_active']);
        foreach (['ends_on', 'starts_on', 'start_time'] as $k) if (array_key_exists($k, $data) && !$data[$k]) $data[$k] = null;
        if (isset($data['weekdays']) && is_array($data['weekdays'])) $data['weekdays'] = implode(',', $data['weekdays']);
        if (isset($data['proof_type']) && is_array($data['proof_type'])) $data['proof_type'] = implode(',', $data['proof_type']) ?: null;
        if ($this->req->input('assigned_to')) $data['assignee_id'] = $this->req->int('assigned_to');
        if (is_array($rot = $this->req->input('rotation'))) $data['rotation_json'] = $rot ? json_encode(array_map('intval', $rot)) : null;
        if (is_array($cl = $this->req->input('checklist'))) $data['checklist_json'] = json_encode($cl, JSON_UNESCAPED_UNICODE);
        if (!Db::update('recurring_rules', $id, $data, $this->cid) && !Db::value('SELECT 1 FROM recurring_rules WHERE id=? AND company_id=?', [$id, $this->cid])) {
            throw HttpError::notFound();
        }
        return ['updated' => true];
    }

    /** DELETE /recurring/{id} — stops future occurrences, keeps history */
    public function destroy(): array
    {
        Db::exec('UPDATE recurring_rules SET is_active = 0 WHERE id = ? AND company_id = ?', [$this->param('id'), $this->cid]);
        return ['stopped' => true];
    }

    /** POST /recurring/preview {frequency, weekdays, month_day, interval_days, ends_on} → next 3 dates */
    public function preview(): array
    {
        $r = $this->req->only(['frequency', 'weekdays', 'month_day', 'interval_days', 'ends_on', 'starts_on']) + ['starts_on' => null, 'ends_on' => null, 'weekdays' => null, 'month_day' => null, 'interval_days' => null, 'created_at' => date('Y-m-d')];
        if (is_array($r['weekdays'])) $r['weekdays'] = implode(',', $r['weekdays']);
        return ['next' => RecurringEngine::nextDates($r, 3)];
    }
}
