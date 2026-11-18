<?php
namespace App\Controllers;

use App\Core\{Controller, Db, HttpError};
use App\Services\{Notifier, Score};

final class PerformanceController extends Controller
{
    private function month(): string
    {
        $m = $this->req->query['month'] ?? $this->req->input('month') ?? date('Y-m');
        if (!preg_match('/^\d{4}-\d{2}$/', $m)) throw HttpError::badRequest('month must be YYYY-MM');
        return $m;
    }

    /** GET /performance?month= — full table (managers) */
    public function index(): array
    {
        $data = Score::month($this->cid, $this->month());
        $data['star'] = Db::one('SELECT r.*, u.name FROM rewards r JOIN users u ON u.id = r.user_id WHERE r.company_id = ? AND r.month = ?', [$this->cid, $data['month']]);
        return $data;
    }

    /** GET /performance/me — my score, rank and leaderboard top 4 (mobile) */
    public function me(): array
    {
        $data = Score::month($this->cid, $this->month());
        $mine = null;
        foreach ($data['rows'] as $r) if ($r['user_id'] === $this->uid()) $mine = $r;
        return ['month' => $data['month'], 'me' => $mine, 'total' => count($data['rows']), 'leaderboard' => array_slice($data['rows'], 0, 5)];
    }

    /** POST /performance/star {month, user_id?, reward_text} — announce Star of the Month (top scorer by default) */
    public function announceStar(): array
    {
        $month = $this->month();
        $rows = Score::month($this->cid, $month)['rows'];
        if (!$rows) throw HttpError::badRequest('No employees to rank');
        $pick = $rows[0];
        if ($uid = $this->req->int('user_id')) foreach ($rows as $r) if ($r['user_id'] === $uid) $pick = $r;
        Db::exec('INSERT INTO rewards (company_id, user_id, month, score, reward_text, announced_at) VALUES (?,?,?,?,?,NOW())
                  ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), score = VALUES(score), reward_text = VALUES(reward_text), announced_at = NOW()',
            [$this->cid, $pick['user_id'], $month, $pick['score'], $this->req->input('reward_text')]);
        $everyone = array_column(Db::all('SELECT id FROM users WHERE company_id = ? AND is_active = 1', [$this->cid]), 'id');
        $label = date('F', strtotime("$month-01"));
        Notifier::many($this->cid, $everyone, 'announcement', "🏆 Star of the Month · $label", "{$pick['name']} — score {$pick['score']}");
        return ['star' => $pick];
    }
}
