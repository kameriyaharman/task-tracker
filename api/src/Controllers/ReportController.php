<?php
namespace App\Controllers;

use App\Core\{Controller, Db, HttpError, Response};
use App\Services\Score;

final class ReportController extends Controller
{
    private function month(): array
    {
        $m = $this->req->query['month'] ?? date('Y-m');
        if (!preg_match('/^\d{4}-\d{2}$/', $m)) throw HttpError::badRequest('month must be YYYY-MM');
        return [$m, "$m-01", date('Y-m-d', strtotime("$m-01 +1 month"))];
    }

    /** GET /reports/summary?month= */
    public function summary(): array
    {
        [$m, $s, $e] = $this->month();
        $t = Db::one("SELECT COUNT(*) AS created FROM tasks WHERE company_id = ? AND created_at >= ? AND created_at < ?", [$this->cid, $s, $e]);
        $d = Db::one("SELECT COUNT(*) AS completed, SUM(due_at IS NULL OR completed_at <= due_at) AS ontime,
                             AVG(CASE WHEN completed_at > due_at THEN TIMESTAMPDIFF(MINUTE, due_at, completed_at) END) AS avg_delay
                        FROM tasks WHERE company_id = ? AND status = 'done' AND completed_at >= ? AND completed_at < ?", [$this->cid, $s, $e]);
        $a = Db::one("SELECT SUM(status IN ('present','late','field','half_day')) AS present, COUNT(*) AS marked,
                             SUM(GREATEST(0, worked_minutes - TIME_TO_SEC(TIMEDIFF(c.shift_end, c.shift_start)) / 60)) AS overtime
                        FROM attendance a JOIN companies c ON c.id = a.company_id
                       WHERE a.company_id = ? AND a.work_date >= ? AND a.work_date < ? AND a.status <> 'holiday'", [$this->cid, $s, $e]);

        $byDept = Db::all("SELECT d.name, COUNT(t.id) AS created, SUM(t.status = 'done') AS completed,
                                  SUM(t.status = 'done' AND (t.due_at IS NULL OR t.completed_at <= t.due_at)) AS ontime
                             FROM departments d LEFT JOIN users u ON u.department_id = d.id
                        LEFT JOIN tasks t ON t.assigned_to = u.id AND COALESCE(t.department_id, u.department_id) = d.id AND t.created_at >= ? AND t.created_at < ?
                            WHERE d.company_id = ? GROUP BY d.id ORDER BY d.name", [$s, $e, $this->cid]);
        foreach ($byDept as &$x) $x['on_time_pct'] = $x['completed'] ? (int) round($x['ontime'] * 100 / $x['completed']) : 0;

        return [
            'month' => $m,
            'tasks_created' => (int) $t['created'],
            'tasks_completed' => (int) $d['completed'],
            'on_time_pct' => $d['completed'] ? (int) round($d['ontime'] * 100 / $d['completed']) : 0,
            'avg_delay_hours' => $d['avg_delay'] ? round($d['avg_delay'] / 60, 1) : 0,
            'attendance_pct' => $a['marked'] ? round($a['present'] * 100 / $a['marked'], 1) : 0,
            'overtime_hours' => (int) round(($a['overtime'] ?? 0) / 60),
            'by_department' => $byDept,
            'campaigns' => Db::one("SELECT COUNT(*) AS live, COALESCE(SUM(reach),0) AS reach, COALESCE(SUM(leads),0) AS leads FROM campaigns
                                     WHERE company_id = ? AND stage = 'live' AND go_live_on >= ? AND go_live_on < ?", [$this->cid, $s, $e]),
        ];
    }

    /** GET /reports/export?type=tasks|performance|leave|timesheet&month=&token=  → CSV (opens in Excel) */
    public function export(): void
    {
        [$m, $s, $e] = $this->month();
        switch ($this->req->query['type'] ?? 'tasks') {
            case 'tasks':
                $rows = Db::all("SELECT t.id, t.title, ua.name, ub.name AS by_name, d.name AS dept, t.priority, t.status, t.due_at, t.completed_at,
                                        IF(t.status='done', IF(t.due_at IS NULL OR t.completed_at <= t.due_at, 'Yes', 'No'), '') AS on_time
                                   FROM tasks t JOIN users ua ON ua.id = t.assigned_to JOIN users ub ON ub.id = t.assigned_by LEFT JOIN departments d ON d.id = t.department_id
                                  WHERE t.company_id = ? AND (t.created_at >= ? AND t.created_at < ? OR t.due_at >= ? AND t.due_at < ?) ORDER BY t.due_at",
                    [$this->cid, $s, $e, $s, $e]);
                Response::csv("tasks-$m.csv", ['ID', 'Task', 'Assigned to', 'Assigned by', 'Department', 'Priority', 'Status', 'Due', 'Completed', 'On time'], $rows);
                return;
            case 'performance':
                $rows = array_map(fn($r) => [$r['rank'], $r['name'], $r['department'], $r['tasks_done'], $r['on_time_pct'], $r['attendance_pct'], $r['rating'], $r['score']],
                    Score::month($this->cid, $m)['rows']);
                Response::csv("performance-$m.csv", ['Rank', 'Employee', 'Department', 'Tasks done', 'On time %', 'Attendance %', 'Rating', 'Score'], $rows);
                return;
            case 'leave':
                $rows = Db::all("SELECT u.name, lt.name AS type, r.from_date, r.to_date, r.days, r.status, r.reason FROM requests r JOIN users u ON u.id = r.user_id
                                   LEFT JOIN leave_types lt ON lt.id = r.leave_type_id WHERE r.company_id = ? AND r.type = 'leave' AND r.from_date >= ? AND r.from_date < ?", [$this->cid, $s, $e]);
                Response::csv("leave-$m.csv", ['Employee', 'Type', 'From', 'To', 'Days', 'Status', 'Reason'], $rows);
                return;
            case 'timesheet':
                $rows = Db::all("SELECT u.name, DATE(e.started_at), e.title, e.category, ROUND(e.minutes/60, 2), IF(e.is_billable,'Yes','No')
                                   FROM timesheet_entries e JOIN users u ON u.id = e.user_id WHERE e.company_id = ? AND e.started_at >= ? AND e.started_at < ? ORDER BY e.started_at", [$this->cid, $s, $e]);
                Response::csv("timesheet-$m.csv", ['Employee', 'Date', 'Work', 'Category', 'Hours', 'Billable'], $rows);
                return;
        }
        throw HttpError::badRequest('Unknown report type');
    }
}
