<?php
namespace App\Controllers;

use App\Core\{Auth, Controller, Db};
use App\Services\Score;

final class DashboardController extends Controller
{
    /** GET /dashboard — admin home */
    public function index(): array
    {
        $ids = Auth::teamIds($this->user);
        $in = Db::in($ids);
        $p = array_merge([$this->cid], $ids);
        $open = "status NOT IN ('done','cancelled')";

        $k = Db::one("SELECT SUM($open) AS open_tasks,
                             SUM($open AND DATE(due_at) = CURDATE()) AS due_today,
                             SUM($open AND due_at < NOW()) AS overdue,
                             SUM($open AND due_at < NOW() - INTERVAL 7 DAY) AS overdue_last_week,
                             SUM(status = 'done' AND completed_at >= CURDATE() - INTERVAL WEEKDAY(CURDATE()) DAY) AS done_week,
                             SUM(status = 'done' AND completed_at >= CURDATE() - INTERVAL WEEKDAY(CURDATE()) DAY AND (due_at IS NULL OR completed_at <= due_at)) AS done_week_ontime
                        FROM tasks WHERE company_id = ? AND assigned_to IN $in", $p);

        $att = (new AttendanceController($this->req))->teamToday()['counts'];
        $hours = (int) Db::value("SELECT COALESCE(SUM(minutes),0) FROM timesheet_entries WHERE company_id = ? AND user_id IN $in
                                   AND started_at >= CURDATE() - INTERVAL WEEKDAY(CURDATE()) DAY", $p);
        if (!$hours) { // fall back to attendance hours if timesheets aren't used
            $hours = (int) Db::value("SELECT COALESCE(SUM(worked_minutes),0) FROM attendance WHERE company_id = ? AND user_id IN $in
                                       AND work_date >= CURDATE() - INTERVAL WEEKDAY(CURDATE()) DAY", $p);
        }
        $goals = Db::all('SELECT status FROM goals WHERE company_id = ? AND parent_id IS NULL', [$this->cid]);

        // completed vs created, last 8 weeks
        $weeks = [];
        for ($i = 7; $i >= 0; $i--) {
            $from = date('Y-m-d', strtotime("monday this week -$i week"));
            $to = date('Y-m-d', strtotime("$from +7 days"));
            $weeks[] = [
                'label' => 'W' . (8 - $i), 'from' => $from,
                'created' => (int) Db::value("SELECT COUNT(*) FROM tasks WHERE company_id = ? AND assigned_to IN $in AND created_at >= ? AND created_at < ?", array_merge($p, [$from, $to])),
                'completed' => (int) Db::value("SELECT COUNT(*) FROM tasks WHERE company_id = ? AND assigned_to IN $in AND completed_at >= ? AND completed_at < ?", array_merge($p, [$from, $to])),
            ];
        }

        $overdueBy = Db::all("SELECT u.id, u.name, d.name AS department, COUNT(*) AS overdue FROM tasks t JOIN users u ON u.id = t.assigned_to
                          LEFT JOIN departments d ON d.id = u.department_id
                              WHERE t.company_id = ? AND t.assigned_to IN $in AND t.$open AND t.due_at < NOW()
                           GROUP BY u.id ORDER BY overdue DESC LIMIT 6", $p);
        foreach ($overdueBy as &$o) $o['initials'] = MeController::initials($o['name']);

        // department progress = % of tasks due this month completed
        $depts = Db::all("SELECT d.id, d.name, COUNT(t.id) AS total, SUM(t.status = 'done') AS done
                            FROM departments d
                       LEFT JOIN users u ON u.department_id = d.id
                       LEFT JOIN tasks t ON t.assigned_to = u.id AND COALESCE(t.department_id, u.department_id) = d.id
                             AND t.due_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01') AND t.due_at < NOW() + INTERVAL 1 DAY
                           WHERE d.company_id = ? GROUP BY d.id HAVING total > 0 ORDER BY d.name", [$this->cid]);
        foreach ($depts as &$d) $d['pct'] = $d['total'] ? (int) round($d['done'] * 100 / $d['total']) : 0;

        $top = array_slice(Score::month($this->cid, date('Y-m'))['rows'], 0, 5);

        return [
            'kpis' => [
                'open_tasks' => (int) $k['open_tasks'], 'due_today' => (int) $k['due_today'],
                'overdue' => (int) $k['overdue'], 'overdue_delta' => (int) $k['overdue'] - (int) $k['overdue_last_week'],
                'done_week' => (int) $k['done_week'], 'done_week_ontime_pct' => $k['done_week'] ? (int) round($k['done_week_ontime'] * 100 / $k['done_week']) : 0,
                'present' => $att['present'], 'headcount' => $att['total'], 'on_leave' => $att['leave'], 'absent' => $att['absent'],
                'hours_week' => (int) round($hours / 60),
                'goals_on_track' => count(array_filter($goals, fn($g) => in_array($g['status'], ['on_track', 'done'], true))), 'goals_total' => count($goals),
            ],
            'weekly' => $weeks,
            'overdue_by_person' => $overdueBy,
            'department_progress' => $depts,
            'attendance_today' => $att,
            'top_performers' => $top,
            'pending_approvals' => (int) Db::value("SELECT COUNT(*) FROM requests WHERE company_id = ? AND status = 'pending' AND user_id IN $in AND user_id <> ?", array_merge($p, [$this->uid()])),
        ];
    }
}
