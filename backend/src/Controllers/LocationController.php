<?php
namespace App\Controllers;

use App\Core\{Auth, Controller, Db, HttpError};
use App\Services\Geo;

/** Live location of field staff — only while punched in and only with consent. */
final class LocationController extends Controller
{
    /** POST /location/ping {points: [{lat, lng, accuracy, recorded_at, activity}]} */
    public function ping(): array
    {
        if (!$this->user['location_consent']) throw HttpError::forbidden('Location sharing is off');
        $att = Db::one('SELECT punch_in_at, punch_out_at FROM attendance WHERE user_id = ? AND work_date = CURDATE()', [$this->uid()]);
        if (!$att || !$att['punch_in_at'] || $att['punch_out_at']) return ['stored' => 0, 'tracking' => false];

        $points = (array) $this->req->input('points', []);
        if (!$points && $this->req->input('lat') !== null) $points = [$this->req->body];
        $n = 0;
        foreach (array_slice($points, 0, 200) as $p) {
            if (!isset($p['lat'], $p['lng'])) continue;
            $fence = Geo::matchGeofence($this->cid, (float) $p['lat'], (float) $p['lng']);
            Db::insert('location_pings', [
                'company_id' => $this->cid, 'user_id' => $this->uid(), 'lat' => $p['lat'], 'lng' => $p['lng'],
                'accuracy_m' => isset($p['accuracy']) ? (int) $p['accuracy'] : null,
                'activity' => in_array($p['activity'] ?? '', ['still', 'moving', 'visit'], true) ? $p['activity'] : 'still',
                'place_label' => $p['place'] ?? ($fence['name'] ?? null),
                'recorded_at' => !empty($p['recorded_at']) ? date('Y-m-d H:i:s', strtotime($p['recorded_at'])) : date('Y-m-d H:i:s'),
            ]);
            $n++;
        }
        return ['stored' => $n, 'tracking' => true];
    }

    /** GET /location/live — latest point per team member punched in today */
    public function live(): array
    {
        $ids = Auth::teamIds($this->user);
        $rows = Db::all(
            'SELECT u.id AS user_id, u.name, a.mode, a.punch_in_at, p.lat, p.lng, p.activity, p.place_label, p.recorded_at
               FROM users u
               JOIN attendance a ON a.user_id = u.id AND a.work_date = CURDATE() AND a.punch_in_at IS NOT NULL AND a.punch_out_at IS NULL
               JOIN location_pings p ON p.id = (SELECT id FROM location_pings x WHERE x.user_id = u.id AND x.recorded_at >= CURDATE() ORDER BY x.recorded_at DESC LIMIT 1)
              WHERE u.company_id = ? AND u.location_consent = 1 AND u.id IN ' . Db::in($ids), array_merge([$this->cid], $ids));
        foreach ($rows as &$r) {
            $fence = Geo::matchGeofence($this->cid, (float) $r['lat'], (float) $r['lng']);
            $km = Geo::fromOffice($this->cid, (float) $r['lat'], (float) $r['lng']);
            $r['initials'] = MeController::initials($r['name']);
            $r['inside_geofence'] = $fence['name'] ?? null;
            $r['km_from_office'] = $km !== null ? round($km / 1000, 1) : null;
            $r['state'] = $fence ? 'inside' : ($r['activity'] === 'moving' ? 'travelling' : 'visit');
        }
        return ['people' => $rows, 'geofences' => Db::all('SELECT * FROM geofences WHERE company_id = ?', [$this->cid])];
    }

    /** GET /location/timeline/{userId}?date= — visit timeline */
    public function timeline(): array
    {
        $uid = $this->param('userId');
        $this->assertInTeam($uid);
        $date = $this->req->query['date'] ?? date('Y-m-d');
        $pts = Db::all('SELECT lat, lng, activity, place_label, recorded_at FROM location_pings WHERE user_id = ? AND DATE(recorded_at) = ? ORDER BY recorded_at', [$uid, $date]);
        $visits = array_values(array_filter($pts, fn($p) => $p['activity'] === 'visit' || $p['place_label']));
        $completed = Db::all("SELECT title, completed_at, completion_place FROM tasks WHERE assigned_to = ? AND DATE(completed_at) = ? AND completion_lat IS NOT NULL", [$uid, $date]);
        return ['date' => $date, 'path' => $pts, 'visits' => $visits, 'completed_tasks' => $completed];
    }

    /* ── geofences (owner) ── */
    public function geofences(): array { return Db::all('SELECT * FROM geofences WHERE company_id = ? ORDER BY id', [$this->cid]); }

    public function saveGeofence(): array
    {
        $in = $this->req->require(['name', 'lat', 'lng']);
        $row = ['name' => $in['name'], 'lat' => (float) $in['lat'], 'lng' => (float) $in['lng'], 'radius_m' => $this->req->int('radius_m', 150)];
        if ($id = $this->param('id')) Db::update('geofences', $id, $row, $this->cid);
        else Db::insert('geofences', $row + ['company_id' => $this->cid]);
        return $this->geofences();
    }

    public function deleteGeofence(): array
    {
        Db::exec('DELETE FROM geofences WHERE id = ? AND company_id = ?', [$this->param('id'), $this->cid]);
        return $this->geofences();
    }
}
