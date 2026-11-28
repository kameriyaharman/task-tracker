<?php
namespace App\Controllers;

use App\Core\{Controller, Db, HttpError};

/**
 * "AI suggested tasks" — looks at history to spot work that recurs but isn't set up as a recurring rule:
 *  - same title done around this day-of-month in the last 2+ months  → monthly
 *  - same title done around this time last year                       → yearly / seasonal
 * Suggestions are stored so Skip/Add is remembered.
 */
final class AiController extends Controller
{
    public static function refresh(int $cid): void
    {
        $today = (int) date('j');
        $existing = array_map('mb_strtolower', array_column(Db::all("SELECT title FROM ai_suggestions WHERE company_id = ? AND created_at > NOW() - INTERVAL 45 DAY", [$cid]), 'title'));
        $ruleTitles = array_map('mb_strtolower', array_column(Db::all('SELECT title FROM recurring_rules WHERE company_id = ? AND is_active = 1', [$cid]), 'title'));
        $upcoming = array_map('mb_strtolower', array_column(Db::all("SELECT title FROM tasks WHERE company_id = ? AND due_at >= CURDATE()", [$cid]), 'title'));
        $skip = array_merge($existing, $ruleTitles, $upcoming);

        // Monthly pattern: done in >= 2 of the last 3 months within ±4 days of today's date (looking 10 days ahead)
        $monthly = Db::all("SELECT title, COUNT(DISTINCT DATE_FORMAT(due_at,'%Y-%m')) AS months,
                                   ROUND(AVG(DAY(due_at))) AS avg_day, MIN(DAY(due_at)) AS d1, MAX(DAY(due_at)) AS d2,
                                   SUBSTRING_INDEX(GROUP_CONCAT(assigned_to ORDER BY id DESC), ',', 1) AS last_user
                              FROM tasks WHERE company_id = ? AND recurring_rule_id IS NULL AND due_at >= NOW() - INTERVAL 100 DAY AND due_at < CURDATE()
                          GROUP BY title HAVING months >= 2 AND d2 - d1 <= 7", [$cid]);
        foreach ($monthly as $m) {
            $d = (int) $m['avg_day'];
            $ahead = ($d - $today + 31) % 31;
            if ($ahead > 10 || in_array(mb_strtolower($m['title']), $skip, true)) continue;
            Db::insert('ai_suggestions', ['company_id' => $cid, 'title' => $m['title'], 'reason' => "Every month · {$m['d1']}–{$m['d2']}",
                'suggested_user_id' => (int) $m['last_user'], 'suggested_due' => date('Y-m-d', strtotime("+$ahead days"))]);
        }

        // Seasonal: tasks done between today-11 months and today-13 months ago (last year, ±1 month)
        $yearly = Db::all("SELECT title, COUNT(*) AS n, MAX(due_at) AS last_due,
                                  SUBSTRING_INDEX(GROUP_CONCAT(assigned_to ORDER BY id DESC), ',', 1) AS last_user,
                                  DATEDIFF(MAX(completed_at), MIN(started_at)) AS span
                             FROM tasks WHERE company_id = ? AND due_at BETWEEN NOW() - INTERVAL 13 MONTH AND NOW() - INTERVAL 11 MONTH
                         GROUP BY title", [$cid]);
        $names = array_column(Db::all('SELECT id, name FROM users WHERE company_id = ?', [$cid]), 'name', 'id');
        foreach ($yearly as $y) {
            if (in_array(mb_strtolower($y['title']), $skip, true)) continue;
            $first = explode(' ', $names[$y['last_user']] ?? '')[0];
            $reason = $y['n'] > 1 ? "$first did {$y['n']} last year" : 'Last done ' . date('M Y', strtotime($y['last_due'])) . ($y['span'] ? " · {$y['span']} days" : '');
            Db::insert('ai_suggestions', ['company_id' => $cid, 'title' => $y['title'], 'reason' => $reason,
                'suggested_user_id' => (int) $y['last_user'], 'suggested_due' => date('Y-m-d', strtotime('+1 year', strtotime($y['last_due'])))]);
        }
    }

    /** GET /ai/suggestions */
    public function index(): array
    {
        if (!Db::value("SELECT 1 FROM ai_suggestions WHERE company_id = ? AND created_at > NOW() - INTERVAL 1 DAY", [$this->cid])) self::refresh($this->cid);
        $rows = Db::all("SELECT s.*, u.name AS user_name FROM ai_suggestions s LEFT JOIN users u ON u.id = s.suggested_user_id
                          WHERE s.company_id = ? AND s.status = 'open' ORDER BY s.suggested_due LIMIT 20", [$this->cid]);
        foreach ($rows as &$r) $r['user_first_name'] = $r['user_name'] ? explode(' ', $r['user_name'])[0] : null;
        return $rows;
    }

    /** POST /ai/suggestions/{id}/add {assigned_to?, due_at?} */
    public function add(): array
    {
        $s = Db::one("SELECT * FROM ai_suggestions WHERE id = ? AND company_id = ? AND status = 'open'", [$this->param('id'), $this->cid]);
        if (!$s) throw HttpError::notFound();
        $assignee = $this->req->int('assigned_to') ?? (int) $s['suggested_user_id'] ?: $this->uid();
        $this->assertSameCompanyUser($assignee);
        $id = Db::insert('tasks', [
            'company_id' => $this->cid, 'title' => $s['title'], 'assigned_to' => $assignee, 'assigned_by' => $this->uid(),
            'due_at' => date('Y-m-d H:i:s', strtotime($this->req->input('due_at') ?: ($s['suggested_due'] . ' 18:00'))),
            'source' => 'ai', 'priority' => 'medium',
            'department_id' => Db::value('SELECT department_id FROM users WHERE id = ?', [$assignee]),
        ]);
        Db::exec("UPDATE ai_suggestions SET status = 'added' WHERE id = ?", [$s['id']]);
        TaskController::announceAssignment($id, $this->user['name']);
        return ['task_id' => $id];
    }

    /** POST /ai/suggestions/{id}/skip */
    public function skip(): array
    {
        Db::exec("UPDATE ai_suggestions SET status = 'skipped' WHERE id = ? AND company_id = ?", [$this->param('id'), $this->cid]);
        return ['skipped' => true];
    }
}
