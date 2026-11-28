<?php
namespace App\Controllers;

use App\Core\{Controller, Db, HttpError};

final class CalendarController extends Controller
{
    /** GET /calendar?from=YYYY-MM-DD&to=YYYY-MM-DD — my meetings + task deadlines */
    public function index(): array
    {
        $from = $this->req->query['from'] ?? date('Y-m-d');
        $to = $this->req->query['to'] ?? date('Y-m-d', strtotime('+7 days'));
        $events = Db::all('SELECT id, title, starts_at, ends_at, meet_link, gcal_event_id, \'event\' AS kind FROM events
                            WHERE user_id = ? AND DATE(starts_at) BETWEEN ? AND ?', [$this->uid(), $from, $to]);
        $tasks = Db::all("SELECT id, title, due_at AS starts_at, NULL AS ends_at, priority, status, 'task' AS kind FROM tasks
                           WHERE assigned_to = ? AND status <> 'cancelled' AND DATE(due_at) BETWEEN ? AND ?", [$this->uid(), $from, $to]);
        $items = array_merge($events, $tasks);
        usort($items, fn($a, $b) => strcmp($a['starts_at'], $b['starts_at']));
        return ['from' => $from, 'to' => $to, 'items' => $items,
                'gcal_connected' => (bool) Db::value('SELECT gcal_enabled FROM companies WHERE id = ?', [$this->cid])];
    }

    /** POST /calendar {title, starts_at, ends_at, meet_link} */
    public function store(): array
    {
        $in = $this->req->require(['title', 'starts_at']);
        $id = Db::insert('events', [
            'company_id' => $this->cid, 'user_id' => $this->uid(), 'title' => mb_substr($in['title'], 0, 150),
            'starts_at' => date('Y-m-d H:i:s', strtotime($in['starts_at'])),
            'ends_at' => $this->req->input('ends_at') ? date('Y-m-d H:i:s', strtotime($this->req->input('ends_at'))) : null,
            'meet_link' => $this->req->input('meet_link'),
        ]);
        return Db::one('SELECT * FROM events WHERE id = ?', [$id]);
    }

    public function destroy(): array
    {
        if (!Db::exec('DELETE FROM events WHERE id = ? AND user_id = ?', [$this->param('id'), $this->uid()])) throw HttpError::notFound();
        return ['deleted' => true];
    }
}
