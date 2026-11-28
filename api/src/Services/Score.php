<?php
namespace App\Services;

use App\Core\Db;

/** Performance score = weighted on-time %, tasks done (relative to top), attendance %, manager rating. */
final class Score
{
    public static function month(int $cid, string $month, ?array $userIds = null): array
    {
        $w = json_decode((string) Db::value('SELECT score_weights FROM companies WHERE id = ?', [$cid]), true)
            ?: ['ontime' => 40, 'tasks' => 30, 'attendance' => 20, 'rating' => 10];
        $start = "$month-01";
        $end = date('Y-m-d', strtotime("$start +1 month"));
        $last = min(time(), strtotime($end) - 1);

        $userWhere = $userIds ? ' AND u.id IN ' . Db::in($userIds) : '';
        $users = Db::all("SELECT u.id, u.name, u.designation, d.name AS department FROM users u LEFT JOIN departments d ON d.id = u.department_id
                           WHERE u.company_id = ? AND u.is_active = 1 AND u.role <> 'owner' $userWhere", array_merge([$cid], $userIds ?? []));

        // working days elapsed (Mon–Sat, minus holidays)
        $hol = array_column(Db::all('SELECT holiday_date FROM holidays WHERE company_id = ? AND holiday_date >= ? AND holiday_date < ?', [$cid, $start, $end]), 'holiday_date');
        $workDays = 0;
        for ($t = strtotime($start); $t <= $last; $t += 86400) if (date('N', $t) != 7 && !in_array(date('Y-m-d', $t), $hol, true)) $workDays++;

        $tasks = Db::all("SELECT assigned_to, COUNT(*) AS done, SUM(due_at IS NULL OR completed_at <= due_at) AS ontime, AVG(manager_rating) AS rating
                            FROM tasks WHERE company_id = ? AND status = 'done' AND completed_at >= ? AND completed_at < ? GROUP BY assigned_to", [$cid, $start, $end]);
        $tasks = array_column($tasks, null, 'assigned_to');
        $att = Db::all("SELECT user_id, SUM(status IN ('present','late','field','half_day')) AS present, SUM(status = 'leave') AS leaves
                          FROM attendance WHERE company_id = ? AND work_date >= ? AND work_date < ? GROUP BY user_id", [$cid, $start, $end]);
        $att = array_column($att, null, 'user_id');
        $maxDone = max(1, ...array_map(fn($t) => (int) $t['done'], array_values($tasks) ?: [['done' => 1]]));

        $out = [];
        foreach ($users as $u) {
            $t = $tasks[$u['id']] ?? ['done' => 0, 'ontime' => 0, 'rating' => null];
            $a = $att[$u['id']] ?? ['present' => 0, 'leaves' => 0];
            $done = (int) $t['done'];
            $ontimePct = $done ? $t['ontime'] * 100 / $done : 0;
            $denom = max(1, $workDays - (int) $a['leaves']);
            $attPct = min(100, $a['present'] * 100 / $denom);
            $rating = $t['rating'] !== null ? (float) $t['rating'] : 4.0;
            $score = ($ontimePct * $w['ontime'] + ($done * 100 / $maxDone) * $w['tasks'] + $attPct * $w['attendance'] + ($rating * 20) * $w['rating']) / 100;
            $out[] = [
                'user_id' => (int) $u['id'], 'name' => $u['name'], 'initials' => \App\Controllers\MeController::initials($u['name']),
                'department' => $u['department'], 'designation' => $u['designation'],
                'tasks_done' => $done, 'on_time_pct' => (int) round($ontimePct), 'attendance_pct' => (int) round($attPct),
                'rating' => round($rating, 1), 'score' => (int) round($score),
            ];
        }
        usort($out, fn($a, $b) => $b['score'] <=> $a['score']);
        foreach ($out as $i => &$o) $o['rank'] = $i + 1;
        return ['month' => $month, 'weights' => $w, 'rows' => $out];
    }
}
