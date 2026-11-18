<?php
namespace App\Controllers;

use App\Core\{Auth, Controller, Db};
use App\Services\Notifier;

final class NotificationController extends Controller
{
    /** GET /notifications */
    public function index(): array
    {
        return [
            'items' => Db::all('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 100', [$this->uid()]),
            'unread' => (int) Db::value('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read_at IS NULL', [$this->uid()]),
        ];
    }

    /** POST /notifications/read {ids?: []} — no ids = mark all */
    public function read(): array
    {
        $ids = array_map('intval', (array) $this->req->input('ids', []));
        if ($ids) Db::exec('UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND id IN ' . Db::in($ids), array_merge([$this->uid()], $ids));
        else Db::exec('UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL', [$this->uid()]);
        return $this->index();
    }

    /** POST /announcements {title, body, department_id?} — manager+ */
    public function announce(): array
    {
        $in = $this->req->require(['title']);
        $dept = $this->req->int('department_id');
        $ids = $dept
            ? array_column(Db::all('SELECT id FROM users WHERE company_id = ? AND department_id = ? AND is_active = 1', [$this->cid, $dept]), 'id')
            : Auth::teamIds($this->user);
        Notifier::many($this->cid, $ids, 'announcement', $in['title'], $this->req->input('body'));
        return ['sent_to' => count($ids)];
    }
}
