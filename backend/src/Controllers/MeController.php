<?php
namespace App\Controllers;

use App\Core\{Controller, Db, HttpError};

final class MeController extends Controller
{
    public function profile(int $id): array
    {
        $u = Db::one(
            'SELECT u.id, u.name, u.mobile, u.email, u.designation, u.role, u.language, u.avatar_url,
                    u.notify_app, u.notify_whatsapp, u.location_consent, u.department_id, u.manager_id,
                    (u.pin_hash IS NOT NULL) AS has_pin,
                    c.id AS company_id, c.name AS company_name, c.code AS company_code, c.gcal_enabled,
                    d.name AS department_name
               FROM users u JOIN companies c ON c.id = u.company_id
          LEFT JOIN departments d ON d.id = u.department_id WHERE u.id = ?', [$id]);
        if (!$u) throw HttpError::notFound();
        foreach (['notify_app', 'notify_whatsapp', 'location_consent', 'has_pin', 'gcal_enabled'] as $b) $u[$b] = (bool) $u[$b];
        $u['initials'] = self::initials($u['name']);
        return $u;
    }

    public static function initials(string $name): string
    {
        $p = preg_split('/\s+/', trim($name));
        return mb_strtoupper(mb_substr($p[0] ?? '', 0, 1) . mb_substr($p[1] ?? '', 0, 1));
    }

    /** GET /me */
    public function show(): array { return $this->profile($this->uid()); }

    /** PATCH /me */
    public function update(): array
    {
        $data = $this->req->only(['language', 'notify_app', 'notify_whatsapp', 'location_consent', 'push_token', 'email']);
        if (isset($data['language']) && !preg_match('/^[a-z]{2}$/', $data['language'])) throw HttpError::badRequest('Bad language');
        foreach (['notify_app', 'notify_whatsapp', 'location_consent'] as $b) if (isset($data[$b])) $data[$b] = $data[$b] ? 1 : 0;
        if ($pin = $this->req->input('pin')) {
            if (!preg_match('/^\d{4,6}$/', (string) $pin)) throw HttpError::badRequest('PIN must be 4–6 digits');
            $data['pin_hash'] = password_hash((string) $pin, PASSWORD_DEFAULT);
        }
        Db::update('users', $this->uid(), $data, $this->cid);
        return $this->profile($this->uid());
    }

    /** GET /home — everything the Home screen needs in one call */
    public function home(): array
    {
        $uid = $this->uid();
        $att = Db::one('SELECT a.*, g.name AS geofence_name FROM attendance a LEFT JOIN geofences g ON g.id = a.punch_in_geofence_id
                         WHERE a.user_id = ? AND a.work_date = CURDATE()', [$uid]);

        $counts = Db::one(
            "SELECT
               SUM(status NOT IN ('done','cancelled') AND DATE(due_at) = CURDATE())          AS today,
               SUM(status NOT IN ('done','cancelled') AND due_at < NOW())                    AS overdue,
               SUM(status NOT IN ('done','cancelled') AND DATE(due_at) > CURDATE())          AS upcoming
             FROM tasks WHERE company_id = ? AND assigned_to = ?", [$this->cid, $uid]);

        $ontime = Db::one(
            "SELECT COUNT(*) AS done, SUM(due_at IS NULL OR completed_at <= due_at) AS ontime
               FROM tasks WHERE assigned_to = ? AND status = 'done' AND completed_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')", [$uid]);

        $tasks = TaskController::fetchList($this->cid, 't.assigned_to = ? AND t.status NOT IN (\'done\',\'cancelled\') AND (DATE(t.due_at) <= CURDATE() OR t.due_at IS NULL)', [$uid], 'ISNULL(t.due_at), t.due_at', 10);

        return [
            'user' => $this->profile($uid),
            'attendance' => AttendanceController::present($att),
            'counts' => [
                'today' => (int) ($counts['today'] ?? 0),
                'overdue' => (int) ($counts['overdue'] ?? 0),
                'upcoming' => (int) ($counts['upcoming'] ?? 0),
                'on_time_pct' => $ontime['done'] ? (int) round($ontime['ontime'] * 100 / $ontime['done']) : 100,
            ],
            'tasks' => $tasks,
            'unread_notifications' => (int) Db::value('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read_at IS NULL', [$uid]),
        ];
    }
}
