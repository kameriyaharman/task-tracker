<?php
namespace App\Controllers;

use App\Core\{Auth, Controller, Db, HttpError};

final class TimesheetController extends Controller
{
    /** GET /timesheet?date=YYYY-MM-DD — my entries for a day + totals */
    public function day(): array
    {
        $date = $this->req->query['date'] ?? date('Y-m-d');
        $rows = Db::all('SELECT e.*, t.title AS task_title, p.name AS project_name FROM timesheet_entries e
                     LEFT JOIN tasks t ON t.id = e.task_id LEFT JOIN projects p ON p.id = e.project_id
                         WHERE e.user_id = ? AND DATE(e.started_at) = ? ORDER BY e.started_at', [$this->uid(), $date]);
        $total = 0; $billable = 0; $running = null;
        foreach ($rows as &$r) {
            $m = $r['ended_at'] ? (int) $r['minutes'] : (int) floor((time() - strtotime($r['started_at'])) / 60);
            $r['minutes'] = $m;
            if (!$r['ended_at']) $running = (int) $r['id'];
            $total += $m;
            if ($r['is_billable']) $billable += $m;
        }
        return ['date' => $date, 'entries' => $rows, 'total_minutes' => $total, 'billable_minutes' => $billable, 'running_id' => $running];
    }

    /** POST /timesheet/start {title, category, task_id, project_id, is_billable} — stops any running timer */
    public function start(): array
    {
        $this->stopRunning();
        $taskId = $this->req->int('task_id');
        $title = $this->req->input('title') ?: ($taskId ? Db::value('SELECT title FROM tasks WHERE id = ? AND company_id = ?', [$taskId, $this->cid]) : null);
        if (!$title) throw HttpError::badRequest('What are you working on?');
        Db::insert('timesheet_entries', [
            'company_id' => $this->cid, 'user_id' => $this->uid(), 'task_id' => $taskId, 'project_id' => $this->req->int('project_id'),
            'title' => mb_substr($title, 0, 150), 'category' => $this->req->input('category'), 'started_at' => date('Y-m-d H:i:s'),
            'is_billable' => $this->req->input('is_billable', true) ? 1 : 0,
        ]);
        return $this->day();
    }

    /** POST /timesheet/stop */
    public function stop(): array { $this->stopRunning(); return $this->day(); }

    private function stopRunning(): void
    {
        Db::exec('UPDATE timesheet_entries SET ended_at = NOW(), minutes = GREATEST(1, TIMESTAMPDIFF(MINUTE, started_at, NOW()))
                   WHERE user_id = ? AND ended_at IS NULL', [$this->uid()]);
    }

    /** POST /timesheet {title, category, started_at, ended_at, task_id, is_billable} — manual entry */
    public function store(): array
    {
        $in = $this->req->require(['title', 'started_at', 'ended_at']);
        $s = strtotime($in['started_at']); $e = strtotime($in['ended_at']);
        if ($e <= $s) throw HttpError::badRequest('End must be after start');
        Db::insert('timesheet_entries', [
            'company_id' => $this->cid, 'user_id' => $this->uid(), 'task_id' => $this->req->int('task_id'), 'project_id' => $this->req->int('project_id'),
            'title' => mb_substr($in['title'], 0, 150), 'category' => $this->req->input('category'),
            'started_at' => date('Y-m-d H:i:s', $s), 'ended_at' => date('Y-m-d H:i:s', $e), 'minutes' => (int) (($e - $s) / 60),
            'is_billable' => $this->req->input('is_billable', true) ? 1 : 0,
        ]);
        $this->req->query['date'] = date('Y-m-d', $s);
        return $this->day();
    }

    public function destroy(): array
    {
        Db::exec('DELETE FROM timesheet_entries WHERE id = ? AND user_id = ?', [$this->param('id'), $this->uid()]);
        return $this->day();
    }

    /** GET /timesheet/summary?from=&to= — admin: hours by person × title/category */
    public function summary(): array
    {
        $from = $this->req->query['from'] ?? date('Y-m-d', strtotime('monday this week'));
        $to = $this->req->query['to'] ?? date('Y-m-d');
        $ids = Auth::teamIds($this->user);
        $rows = Db::all('SELECT u.name, e.title, COALESCE(e.category, d.name) AS category, SUM(e.minutes) AS minutes
                           FROM timesheet_entries e JOIN users u ON u.id = e.user_id LEFT JOIN departments d ON d.id = u.department_id
                          WHERE e.company_id = ? AND DATE(e.started_at) BETWEEN ? AND ? AND e.ended_at IS NOT NULL AND e.user_id IN ' . Db::in($ids) . '
                       GROUP BY u.id, e.title, category ORDER BY minutes DESC LIMIT 200', array_merge([$this->cid, $from, $to], $ids));
        $total = (int) Db::value('SELECT COALESCE(SUM(minutes),0) FROM timesheet_entries WHERE company_id = ? AND DATE(started_at) BETWEEN ? AND ?', [$this->cid, $from, $to]);
        return ['from' => $from, 'to' => $to, 'rows' => $rows, 'total_minutes' => $total];
    }
}
