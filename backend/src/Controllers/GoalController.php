<?php
namespace App\Controllers;

use App\Core\{Controller, Db, HttpError};

final class GoalController extends Controller
{
    private const FIELDS = ['parent_id', 'title', 'scope', 'department_id', 'owner_id', 'period_label', 'start_date', 'end_date', 'target_value', 'current_value', 'unit', 'status'];

    /** GET /goals — top-level goals with progress, sub-goals and linked tasks */
    public function index(): array
    {
        $rows = Db::all('SELECT g.*, d.name AS department_name,
                    (SELECT COUNT(*) FROM tasks t WHERE t.goal_id = g.id) AS tasks_total,
                    (SELECT COUNT(*) FROM tasks t WHERE t.goal_id = g.id AND t.status NOT IN (\'done\',\'cancelled\') AND t.due_at < NOW()) AS tasks_overdue
                   FROM goals g LEFT JOIN departments d ON d.id = g.department_id WHERE g.company_id = ? ORDER BY g.id', [$this->cid]);
        $byParent = [];
        foreach ($rows as $i => $g) {
            $g['progress_pct'] = $g['target_value'] > 0 ? (int) min(100, round($g['current_value'] * 100 / $g['target_value'])) : 0;
            $g['scope_label'] = $g['scope'] === 'company' ? 'Company' : ($g['department_name'] ? $g['department_name'] . ' team' : 'All departments');
            $rows[$i] = $g;
            if ($g['parent_id']) $byParent[(int) $g['parent_id']][] = $g;
        }
        $top = [];
        foreach ($rows as $g) {
            if ($g['parent_id']) continue;
            $g['children'] = $byParent[(int) $g['id']] ?? [];
            $g['tasks'] = Db::all('SELECT id, title, status, recurring_rule_id IS NOT NULL AS is_recurring FROM tasks WHERE goal_id = ? ORDER BY id DESC LIMIT 5', [$g['id']]);
            $top[] = $g;
        }
        return $top;
    }

    public function store(): array
    {
        $this->req->require(['title', 'target_value']);
        $data = $this->req->only(self::FIELDS) + ['company_id' => $this->cid];
        $id = Db::insert('goals', $data);
        return Db::one('SELECT * FROM goals WHERE id = ?', [$id]);
    }

    public function update(): array
    {
        $id = $this->param('id');
        if (!Db::value('SELECT 1 FROM goals WHERE id = ? AND company_id = ?', [$id, $this->cid])) throw HttpError::notFound();
        Db::update('goals', $id, $this->req->only(self::FIELDS), $this->cid);
        return Db::one('SELECT * FROM goals WHERE id = ?', [$id]);
    }

    public function destroy(): array
    {
        Db::exec('DELETE FROM goals WHERE id = ? AND company_id = ?', [$this->param('id'), $this->cid]);
        return ['deleted' => true];
    }
}
