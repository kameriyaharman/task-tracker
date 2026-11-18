<?php
namespace App\Controllers;

use App\Core\{Auth, Controller, Db, HttpError};
use App\Services\{Notifier, Upload};

/** Leave, expense, deadline-extension and punch-regularisation requests + approvals inbox. */
final class RequestController extends Controller
{
    private function approverFor(int $userId): ?int
    {
        $m = Db::value('SELECT manager_id FROM users WHERE id = ?', [$userId]);
        if ($m) return (int) $m;
        $owner = Db::value("SELECT id FROM users WHERE company_id = ? AND role = 'owner' AND id <> ? ORDER BY id LIMIT 1", [$this->cid, $userId]);
        return $owner ? (int) $owner : null;
    }

    private static function workingDays(string $from, string $to, int $cid): float
    {
        $hol = array_column(Db::all('SELECT holiday_date FROM holidays WHERE company_id = ? AND holiday_date BETWEEN ? AND ?', [$cid, $from, $to]), 'holiday_date');
        $n = 0;
        for ($t = strtotime($from); $t <= strtotime($to); $t += 86400) {
            if (date('N', $t) != 7 && !in_array(date('Y-m-d', $t), $hol, true)) $n++;
        }
        return $n;
    }

    /** GET /leave/balance — {casual: {quota, used, left}, …} for current year */
    public function balance(): array
    {
        $uid = $this->req->int('user_id') ?? $this->uid();
        if ($uid !== $this->uid()) $this->assertInTeam($uid);
        $types = Db::all('SELECT * FROM leave_types WHERE company_id = ? ORDER BY id', [$this->cid]);
        $used = Db::all("SELECT leave_type_id, SUM(days) AS used FROM requests WHERE user_id = ? AND type = 'leave'
                           AND status IN ('approved','pending') AND YEAR(from_date) = YEAR(CURDATE()) GROUP BY leave_type_id", [$uid]);
        $usedMap = array_column($used, 'used', 'leave_type_id');
        return array_map(fn($t) => [
            'id' => (int) $t['id'], 'code' => $t['code'], 'name' => $t['name'], 'quota' => (int) $t['yearly_quota'],
            'used' => (float) ($usedMap[$t['id']] ?? 0),
            'left' => $t['yearly_quota'] > 0 ? max(0, $t['yearly_quota'] - (float) ($usedMap[$t['id']] ?? 0)) : null,
            'carry_forward_max' => (int) $t['carry_forward_max'],
        ], $types);
    }

    /** POST /requests {type, …} */
    public function store(): array
    {
        $type = $this->req->require(['type'])['type'];
        $data = ['company_id' => $this->cid, 'user_id' => $this->uid(), 'type' => $type, 'reason' => $this->req->input('reason'),
                 'approver_id' => $this->approverFor($this->uid())];
        switch ($type) {
            case 'leave':
                $in = $this->req->require(['leave_type_id', 'from_date', 'to_date']);
                if ($in['to_date'] < $in['from_date']) throw HttpError::badRequest('End date is before start date');
                $lt = Db::one('SELECT * FROM leave_types WHERE id = ? AND company_id = ?', [$in['leave_type_id'], $this->cid]);
                if (!$lt) throw HttpError::badRequest('Unknown leave type');
                $days = $this->req->input('half_day') ? 0.5 : self::workingDays($in['from_date'], $in['to_date'], $this->cid);
                foreach ($this->balance() as $b) {
                    if ($b['id'] === (int) $lt['id'] && $b['left'] !== null && $days > $b['left']) throw HttpError::badRequest("Only {$b['left']} {$b['name']} left");
                }
                $handover = $this->req->int('handover_to');
                if ($handover) $this->assertSameCompanyUser($handover);
                $data += ['leave_type_id' => $lt['id'], 'from_date' => $in['from_date'], 'to_date' => $in['to_date'], 'days' => $days, 'handover_to' => $handover];
                break;
            case 'expense':
                $data['amount'] = (float) $this->req->require(['amount'])['amount'];
                break;
            case 'extension':
                $in = $this->req->require(['task_id', 'extend_to']);
                $task = Db::one('SELECT * FROM tasks WHERE id = ? AND company_id = ? AND assigned_to = ?', [$in['task_id'], $this->cid, $this->uid()]);
                if (!$task) throw HttpError::badRequest('You can only extend your own tasks');
                $data += ['task_id' => $task['id'], 'extend_to' => date('Y-m-d H:i:s', strtotime($in['extend_to']))];
                $data['approver_id'] = (int) $task['assigned_by'];
                break;
            case 'regularise':
                $data['from_date'] = $this->req->require(['date'])['date'];
                break;
            default:
                throw HttpError::badRequest('Unknown request type');
        }
        $id = Db::insert('requests', $data);
        if ($type === 'expense') foreach (Upload::list($this->req->files, 'bills') as $f) Upload::save($f, $this->cid, $this->uid(), 'expense', $id);
        if ($data['approver_id']) Notifier::notify($this->cid, $data['approver_id'], 'approval_needed', $this->user['name'] . ' sent a ' . $type . ' request', $data['reason'], 'request', $id);
        return $this->one($id);
    }

    private function one(int $id): array
    {
        $rows = $this->query('r.id = ?', [$id]);
        if (!$rows) throw HttpError::notFound();
        return $rows[0];
    }

    private function query(string $where, array $p): array
    {
        $rows = Db::all(
            "SELECT r.*, u.name AS user_name, lt.name AS leave_type_name, lt.code AS leave_type_code, h.name AS handover_name,
                    t.title AS task_title, a.name AS approver_name
               FROM requests r JOIN users u ON u.id = r.user_id
          LEFT JOIN leave_types lt ON lt.id = r.leave_type_id
          LEFT JOIN users h ON h.id = r.handover_to
          LEFT JOIN users a ON a.id = r.approver_id
          LEFT JOIN tasks t ON t.id = r.task_id
              WHERE r.company_id = ? AND ($where) ORDER BY r.status = 'pending' DESC, r.id DESC LIMIT 200",
            array_merge([$this->cid], $p));
        foreach ($rows as &$r) {
            $r['user_initials'] = MeController::initials($r['user_name']);
            $r['summary'] = self::summary($r);
        }
        return $rows;
    }

    public static function summary(array $r): string
    {
        $fmt = fn($d) => date('j M', strtotime($d));
        switch ($r['type']) {
            case 'leave': return 'Leave · ' . $fmt($r['from_date']) . ($r['to_date'] !== $r['from_date'] ? '–' . $fmt($r['to_date']) : '') . ' · ' . strtolower((string) $r['leave_type_name']);
            case 'expense': return 'Expense ₹' . number_format((float) $r['amount']) . ($r['reason'] ? ' · ' . $r['reason'] : '');
            case 'extension':
                return 'Task deadline extension · ' . $r['task_title'] . ' → ' . date('j M g A', strtotime($r['extend_to']));
            case 'regularise': return 'Regularise punch · ' . $fmt($r['from_date']);
        }
        return $r['type'];
    }

    /** GET /requests?box=mine|approvals&type=&status= */
    public function index(): array
    {
        $q = $this->req->query;
        $where = []; $p = [];
        if (($q['box'] ?? 'mine') === 'approvals') {
            if ($this->user['role'] === 'owner') { $where[] = '1=1'; }
            else {
                $ids = Auth::teamIds($this->user);
                $where[] = '(r.approver_id = ? OR r.user_id IN ' . Db::in($ids) . ') AND r.user_id <> ?';
                $p = array_merge([$this->uid()], $ids, [$this->uid()]);
            }
        } else { $where[] = 'r.user_id = ?'; $p[] = $this->uid(); }
        if (!empty($q['type'])) { $where[] = 'r.type = ?'; $p[] = $q['type']; }
        if (!empty($q['status'])) { $where[] = 'r.status = ?'; $p[] = $q['status']; }
        return $this->query(implode(' AND ', $where), $p);
    }

    /** POST /requests/{id}/approve | /reject {note} */
    public function approve(): array { return $this->decide('approved'); }
    public function reject(): array { return $this->decide('rejected'); }

    private function decide(string $status): array
    {
        $r = Db::one('SELECT * FROM requests WHERE id = ? AND company_id = ?', [$this->param('id'), $this->cid]);
        if (!$r) throw HttpError::notFound();
        if ($r['status'] !== 'pending') throw HttpError::conflict('Already ' . $r['status']);
        if ((int) $r['user_id'] === $this->uid()) throw HttpError::forbidden('You cannot approve your own request');
        $allowed = $this->user['role'] === 'owner' || (int) $r['approver_id'] === $this->uid()
            || ($this->isManager() && in_array((int) $r['user_id'], Auth::teamIds($this->user), true));
        if (!$allowed) throw HttpError::forbidden();

        Db::tx(function () use ($r, $status) {
            Db::update('requests', (int) $r['id'], ['status' => $status, 'decided_by' => $this->uid(), 'decided_at' => date('Y-m-d H:i:s'), 'decision_note' => $this->req->input('note')]);
            if ($status !== 'approved') return;
            if ($r['type'] === 'leave') {
                for ($t = strtotime($r['from_date']); $t <= strtotime($r['to_date']); $t += 86400) {
                    Db::exec("INSERT INTO attendance (company_id, user_id, work_date, status) VALUES (?,?,?,'leave')
                              ON DUPLICATE KEY UPDATE status = IF(punch_in_at IS NULL, 'leave', status)", [$r['company_id'], $r['user_id'], date('Y-m-d', $t)]);
                }
                if ($r['handover_to']) {
                    // Hand over open tasks due during the leave
                    Db::exec("UPDATE tasks SET assigned_to = ? WHERE company_id = ? AND assigned_to = ? AND status NOT IN ('done','cancelled')
                               AND DATE(due_at) BETWEEN ? AND ?", [$r['handover_to'], $r['company_id'], $r['user_id'], $r['from_date'], $r['to_date']]);
                    Notifier::notify((int) $r['company_id'], (int) $r['handover_to'], 'handover', 'Tasks handed over to you', 'Covering leave of a teammate');
                }
            } elseif ($r['type'] === 'extension') {
                Db::exec('UPDATE tasks SET due_at = ?, reminder_sent_at = NULL WHERE id = ?', [$r['extend_to'], $r['task_id']]);
            } elseif ($r['type'] === 'regularise') {
                Db::exec("INSERT INTO attendance (company_id, user_id, work_date, status, regularised) VALUES (?,?,?,'present',1)
                          ON DUPLICATE KEY UPDATE status = 'present', regularised = 1", [$r['company_id'], $r['user_id'], $r['from_date']]);
            }
        });
        $label = ['leave' => 'Leave', 'expense' => 'Expense', 'extension' => 'Deadline extension', 'regularise' => 'Punch regularisation'][$r['type']];
        Notifier::notify($this->cid, (int) $r['user_id'], 'request_' . $status, "$label $status", self::summary($this->one((int) $r['id'])), 'request', (int) $r['id']);
        return $this->one((int) $r['id']);
    }

    /** POST /requests/{id}/cancel — by requester while pending */
    public function cancel(): array
    {
        Db::exec("UPDATE requests SET status = 'cancelled' WHERE id = ? AND user_id = ? AND status = 'pending'", [$this->param('id'), $this->uid()]);
        return $this->one($this->param('id'));
    }

    /* ── leave policy (admin) ── */
    public function policy(): array
    {
        return [
            'types' => Db::all('SELECT * FROM leave_types WHERE company_id = ? ORDER BY id', [$this->cid]),
            'holidays' => Db::all('SELECT * FROM holidays WHERE company_id = ? AND YEAR(holiday_date) >= YEAR(CURDATE()) ORDER BY holiday_date', [$this->cid]),
        ];
    }

    public function savePolicy(): array
    {
        foreach ((array) $this->req->input('types', []) as $t) {
            $row = ['name' => $t['name'], 'yearly_quota' => (int) $t['yearly_quota'], 'carry_forward_max' => (int) ($t['carry_forward_max'] ?? 0)];
            if (!empty($t['id'])) Db::update('leave_types', (int) $t['id'], $row, $this->cid);
            else Db::insert('leave_types', $row + ['company_id' => $this->cid, 'code' => preg_replace('/\W/', '', strtolower($t['code'] ?? $t['name']))]);
        }
        if (is_array($h = $this->req->input('holidays'))) {
            Db::exec('DELETE FROM holidays WHERE company_id = ? AND holiday_date >= CURDATE()', [$this->cid]);
            foreach ($h as $x) Db::insert('holidays', ['company_id' => $this->cid, 'holiday_date' => $x['holiday_date'], 'name' => $x['name']]);
        }
        return $this->policy();
    }
}
