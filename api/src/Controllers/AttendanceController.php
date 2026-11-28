<?php
namespace App\Controllers;

use App\Core\{Auth, Controller, Db, HttpError, Response};
use App\Services\{Geo, Upload};

final class AttendanceController extends Controller
{
    public static function present(?array $a): ?array
    {
        if (!$a) return null;
        $in = $a['punch_in_at'] ? strtotime($a['punch_in_at']) : null;
        $out = $a['punch_out_at'] ? strtotime($a['punch_out_at']) : null;
        $worked = $in ? (int) floor((($out ?? time()) - $in) / 60) : 0;
        return [
            'id' => (int) $a['id'], 'work_date' => $a['work_date'], 'mode' => $a['mode'], 'status' => $a['status'],
            'punch_in_at' => $a['punch_in_at'], 'punch_out_at' => $a['punch_out_at'],
            'place' => $a['punch_in_place'] ?? ($a['geofence_name'] ?? null),
            'inside_geofence' => !empty($a['punch_in_geofence_id']),
            'has_selfie' => !empty($a['punch_in_selfie']),
            'late_minutes' => (int) $a['late_minutes'],
            'worked_minutes' => $worked,
            'is_punched_in' => $in && !$out,
        ];
    }

    private function shift(): array
    {
        return Db::one('SELECT shift_start, shift_end, late_grace_min FROM companies WHERE id = ?', [$this->cid]);
    }

    /** POST /attendance/punch-in (multipart) {mode: office|field|wfh, lat, lng, selfie(file), place} */
    public function punchIn(): array
    {
        $mode = $this->req->input('mode', 'office');
        if (!in_array($mode, ['office', 'field', 'wfh'], true)) throw HttpError::badRequest('Bad mode');
        $lat = $this->req->input('lat'); $lng = $this->req->input('lng');
        if ($mode !== 'wfh' && ($lat === null || $lng === null)) throw HttpError::badRequest('Location is required to punch in');

        $existing = Db::one('SELECT * FROM attendance WHERE user_id = ? AND work_date = CURDATE()', [$this->uid()]);
        if ($existing && $existing['punch_in_at']) throw HttpError::conflict('Already punched in today');

        $fence = ($lat !== null) ? Geo::matchGeofence($this->cid, (float) $lat, (float) $lng) : null;
        if ($mode === 'office' && !$fence && \App\Core\Config::get('attendance.require_geofence_for_office', true)) {
            throw HttpError::badRequest('You are outside the office geofence. Choose "Field" if you are on a visit.');
        }

        $selfie = null;
        if (!empty($this->req->files['selfie'])) {
            $att = Upload::save($this->req->files['selfie'], $this->cid, $this->uid(), 'user_doc', $this->uid(), 'image');
            $selfie = $att['path'];
        } elseif (\App\Core\Config::get('attendance.require_selfie', true)) {
            throw HttpError::badRequest('Selfie is required to punch in');
        }

        $s = $this->shift();
        $late = max(0, (int) floor((time() - strtotime(date('Y-m-d ') . $s['shift_start'])) / 60));
        $isLate = $late > (int) $s['late_grace_min'];
        $status = $mode === 'field' ? 'field' : ($isLate ? 'late' : 'present');

        $data = [
            'company_id' => $this->cid, 'user_id' => $this->uid(), 'work_date' => date('Y-m-d'), 'mode' => $mode, 'status' => $status,
            'punch_in_at' => date('Y-m-d H:i:s'), 'punch_in_lat' => $lat, 'punch_in_lng' => $lng,
            'punch_in_geofence_id' => $fence['id'] ?? null, 'punch_in_selfie' => $selfie,
            'punch_in_place' => $this->req->input('place') ?: ($fence['name'] ?? ($mode === 'wfh' ? 'Home' : null)),
            'late_minutes' => $isLate ? $late : 0,
        ];
        if ($existing) Db::update('attendance', (int) $existing['id'], $data); else Db::insert('attendance', $data);
        if ($lat !== null) {
            Db::insert('location_pings', ['company_id' => $this->cid, 'user_id' => $this->uid(), 'lat' => $lat, 'lng' => $lng,
                'activity' => 'visit', 'place_label' => 'Punch in · ' . ($data['punch_in_place'] ?? $mode), 'recorded_at' => date('Y-m-d H:i:s')]);
        }
        return $this->today();
    }

    /** POST /attendance/punch-out {lat, lng, selfie?} */
    public function punchOut(): array
    {
        $a = Db::one('SELECT * FROM attendance WHERE user_id = ? AND work_date = CURDATE()', [$this->uid()]);
        if (!$a || !$a['punch_in_at']) throw HttpError::badRequest('You have not punched in today');
        if ($a['punch_out_at']) throw HttpError::conflict('Already punched out');
        $selfie = !empty($this->req->files['selfie'])
            ? Upload::save($this->req->files['selfie'], $this->cid, $this->uid(), 'user_doc', $this->uid(), 'image')['path'] : null;
        $worked = (int) floor((time() - strtotime($a['punch_in_at'])) / 60);
        Db::update('attendance', (int) $a['id'], [
            'punch_out_at' => date('Y-m-d H:i:s'), 'punch_out_lat' => $this->req->input('lat'), 'punch_out_lng' => $this->req->input('lng'),
            'punch_out_selfie' => $selfie, 'worked_minutes' => $worked,
        ]);
        return $this->today();
    }

    /** GET /attendance/today — my status */
    public function today(): array
    {
        $a = Db::one('SELECT a.*, g.name AS geofence_name FROM attendance a LEFT JOIN geofences g ON g.id = a.punch_in_geofence_id
                       WHERE a.user_id = ? AND a.work_date = CURDATE()', [$this->uid()]);
        return ['attendance' => self::present($a), 'shift' => $this->shift()];
    }

    /** GET /attendance/me?month=2026-11 — calendar + summary */
    public function mine(): array
    {
        $uid = $this->req->int('user_id') ?? $this->uid();
        if ($uid !== $this->uid()) $this->assertInTeam($uid);
        $month = preg_match('/^\d{4}-\d{2}$/', $this->req->query['month'] ?? '') ? $this->req->query['month'] : date('Y-m');
        $rows = Db::all("SELECT a.*, g.name AS geofence_name FROM attendance a LEFT JOIN geofences g ON g.id = a.punch_in_geofence_id
                          WHERE a.user_id = ? AND DATE_FORMAT(a.work_date, '%Y-%m') = ? ORDER BY a.work_date", [$uid, $month]);
        $days = array_map([self::class, 'present'], $rows);
        $sum = ['present' => 0, 'late' => 0, 'leave' => 0, 'field' => 0, 'absent' => 0, 'minutes' => 0];
        foreach ($days as $d) {
            if (in_array($d['status'], ['present', 'late', 'field'], true)) $sum['present']++;
            if (isset($sum[$d['status']]) && $d['status'] !== 'present') $sum[$d['status']]++;
            $sum['minutes'] += $d['worked_minutes'];
        }
        $sum['hours'] = (int) round($sum['minutes'] / 60);
        return ['month' => $month, 'days' => $days, 'summary' => $sum];
    }

    /** GET /attendance/team-today — admin "Today" list + counters */
    public function teamToday(): array
    {
        $ids = Auth::teamIds($this->user);
        $rows = Db::all(
            'SELECT u.id AS user_id, u.name, u.designation, d.name AS department_name, a.*, g.name AS geofence_name,
                    (SELECT 1 FROM requests r WHERE r.user_id = u.id AND r.type = \'leave\' AND r.status = \'approved\'
                        AND CURDATE() BETWEEN r.from_date AND r.to_date LIMIT 1) AS on_leave
               FROM users u
          LEFT JOIN departments d ON d.id = u.department_id
          LEFT JOIN attendance a ON a.user_id = u.id AND a.work_date = CURDATE()
          LEFT JOIN geofences g ON g.id = a.punch_in_geofence_id
              WHERE u.company_id = ? AND u.is_active = 1 AND u.role <> \'owner\' AND u.id IN ' . Db::in($ids) . ' ORDER BY u.name',
            array_merge([$this->cid], $ids));
        $c = ['total' => count($rows), 'on_time' => 0, 'late' => 0, 'field' => 0, 'leave' => 0, 'absent' => 0, 'not_yet' => 0];
        $list = [];
        foreach ($rows as $r) {
            $state = $r['on_leave'] ? 'leave' : ($r['punch_in_at'] ? $r['status'] : 'not_punched');
            if ($state === 'present') $c['on_time']++;
            elseif ($state === 'late') $c['late']++;
            elseif ($state === 'field') $c['field']++;
            elseif ($state === 'leave') $c['leave']++;
            else $c['not_yet']++;
            $list[] = [
                'user_id' => (int) $r['user_id'], 'name' => $r['name'], 'initials' => MeController::initials($r['name']),
                'department' => $r['department_name'], 'state' => $state,
                'attendance' => $r['punch_in_at'] ? self::present($r) : null,
            ];
        }
        // after shift start + 2h, not punched in & not on leave counts as absent
        $s = $this->shift();
        if (time() > strtotime(date('Y-m-d ') . $s['shift_start']) + 7200) { $c['absent'] = $c['not_yet']; }
        $c['present'] = $c['on_time'] + $c['late'] + $c['field'];
        return ['counts' => $c, 'people' => $list, 'shift' => $s];
    }

    /** GET /attendance/register?month=2026-11 — monthly P/L/F/A grid */
    public function register(): array
    {
        $month = preg_match('/^\d{4}-\d{2}$/', $this->req->query['month'] ?? '') ? $this->req->query['month'] : date('Y-m');
        $ids = Auth::teamIds($this->user);
        $users = Db::all('SELECT id, name FROM users WHERE company_id = ? AND is_active = 1 AND role <> \'owner\' AND id IN ' . Db::in($ids) . ' ORDER BY name', array_merge([$this->cid], $ids));
        $att = Db::all("SELECT user_id, DAY(work_date) AS d, status, worked_minutes, punch_in_at, punch_out_at FROM attendance
                         WHERE company_id = ? AND DATE_FORMAT(work_date, '%Y-%m') = ?", [$this->cid, $month]);
        $holidays = array_map('intval', array_column(Db::all("SELECT DAY(holiday_date) d FROM holidays WHERE company_id = ? AND DATE_FORMAT(holiday_date,'%Y-%m') = ?", [$this->cid, $month]), 'd'));
        $map = [];
        foreach ($att as $a) $map[$a['user_id']][(int) $a['d']] = $a;

        $daysInMonth = (int) date('t', strtotime("$month-01"));
        $lastDay = $month === date('Y-m') ? (int) date('j') : $daysInMonth;
        $code = ['present' => 'P', 'late' => 'L', 'field' => 'F', 'leave' => 'LV', 'absent' => 'A', 'half_day' => 'H', 'holiday' => 'HO'];
        $out = [];
        foreach ($users as $u) {
            $cells = []; $mins = 0;
            for ($d = 1; $d <= $daysInMonth; $d++) {
                $ts = strtotime(sprintf('%s-%02d', $month, $d));
                if ($d > $lastDay) { $cells[] = ''; continue; }
                if (date('N', $ts) == 7 || in_array($d, $holidays, true)) { $cells[] = '·'; continue; }
                $a = $map[$u['id']][$d] ?? null;
                if ($a) {
                    $cells[] = $code[$a['status']] ?? 'P';
                    $mins += $a['worked_minutes'] ?: ($a['punch_in_at'] && $a['punch_out_at'] ? (strtotime($a['punch_out_at']) - strtotime($a['punch_in_at'])) / 60 : 0);
                } else {
                    $cells[] = 'A';
                }
            }
            $out[] = ['user_id' => (int) $u['id'], 'name' => $u['name'], 'cells' => $cells, 'hours' => (int) round($mins / 60)];
        }
        return ['month' => $month, 'days' => $daysInMonth, 'rows' => $out];
    }

    /** GET /attendance/export?month=&token= — CSV for payroll */
    public function export(): void
    {
        $reg = $this->register();
        $header = array_merge(['Employee'], range(1, $reg['days']), ['Hours']);
        $rows = array_map(fn($r) => array_merge([$r['name']], $r['cells'], [$r['hours']]), $reg['rows']);
        Response::csv("attendance-{$reg['month']}.csv", $header, $rows);
    }
}
