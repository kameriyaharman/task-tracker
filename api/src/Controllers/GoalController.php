<?php
namespace App\Controllers;

use App\Core\{Controller, Db, HttpError};

final class GoalController extends Controller
{
    private const FIELDS = ['parent_id', 'title', 'scope', 'department_id', 'owner_id', 'period_label', 'start_date', 'end_date', 'target_value', 'current_value', 'unit', 'status', 'measure'];

    /** GET /goals — top-level goals with progress, sub-goals and linked tasks */
    public function index(): array
    {
        $rows = Db::all('SELECT g.*, d.name AS department_name,
                    (SELECT COUNT(*) FROM tasks t WHERE t.goal_id = g.id) AS tasks_total,
                    (SELECT COUNT(*) FROM tasks t WHERE t.goal_id = g.id AND t.status = \'done\') AS tasks_done,
                    o.name AS owner_name,
                    (SELECT COUNT(*) FROM tasks t WHERE t.goal_id = g.id AND t.status NOT IN (\'done\',\'cancelled\') AND t.due_at < NOW()) AS tasks_overdue
                   FROM goals g LEFT JOIN departments d ON d.id = g.department_id LEFT JOIN users o ON o.id = g.owner_id WHERE g.company_id = ? ORDER BY g.id', [$this->cid]);
        $byParent = [];
        foreach ($rows as $i => $g) {
            if ($g['measure'] === 'tasks') {
                // progress counted from linked tasks: done / total
                $g['current_value'] = $g['tasks_done'];
                $g['target_value'] = max(1, (int) $g['tasks_total']);
            }
            $g['progress_pct'] = $g['target_value'] > 0 ? (int) min(100, round($g['current_value'] * 100 / $g['target_value'])) : 0;
            // expected progress by today (straight line between start and end date) → on track / at risk / behind
            $g['expected_pct'] = null;
            if ($g['start_date'] && $g['end_date'] && $g['status'] !== 'done') {
                $span = max(1, strtotime($g['end_date']) - strtotime($g['start_date']));
                $g['expected_pct'] = (int) max(0, min(100, round((time() - strtotime($g['start_date'])) * 100 / $span)));
                $gap = $g['expected_pct'] - $g['progress_pct'];
                $g['status'] = $g['progress_pct'] >= 100 ? 'done' : ($gap <= 5 ? 'on_track' : ($gap <= 20 ? 'at_risk' : 'behind'));
            }
            $g['updates'] = Db::all('SELECT gu.added, gu.new_value, gu.note, gu.created_at, u.name AS user_name FROM goal_updates gu JOIN users u ON u.id = gu.user_id WHERE gu.goal_id = ? ORDER BY gu.id DESC LIMIT 5', [$g['id']]);
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

    /** POST /goals/{id}/progress {add | value, note} — anyone on the goal feeds progress (e.g. "+3 deals closed today") */
    public function progress(): array
    {
        $g = Db::one('SELECT * FROM goals WHERE id = ? AND company_id = ?', [$this->param('id'), $this->cid]);
        if (!$g) throw HttpError::notFound();
        if ($g['measure'] === 'tasks') throw HttpError::badRequest('This goal is counted automatically from its linked tasks');
        $add = $this->req->input('add');
        $value = $this->req->input('value');
        if (($add === null || $add === '') && ($value === null || $value === '')) throw HttpError::badRequest('Enter how much was achieved');
        $new = ($value !== null && $value !== '') ? (float) $value : (float) $g['current_value'] + (float) $add;
        $new = max(0, $new);
        Db::update('goals', (int) $g['id'], ['current_value' => $new, 'status' => $new >= (float) $g['target_value'] ? 'done' : $g['status']]);
        Db::insert('goal_updates', ['goal_id' => $g['id'], 'user_id' => $this->uid(), 'added' => $new - (float) $g['current_value'], 'new_value' => $new,
            'note' => mb_substr(trim((string) $this->req->input('note')), 0, 250) ?: null]);
        return ['current_value' => $new, 'target_value' => (float) $g['target_value'], 'progress_pct' => $g['target_value'] > 0 ? (int) min(100, round($new * 100 / $g['target_value'])) : 0];
    }

    public function destroy(): array
    {
        Db::exec('DELETE FROM goals WHERE id = ? AND company_id = ?', [$this->param('id'), $this->cid]);
        return ['deleted' => true];
    }
}
