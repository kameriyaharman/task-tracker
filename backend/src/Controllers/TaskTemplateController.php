<?php
namespace App\Controllers;

use App\Core\{Controller, Db, HttpError};

/** Standard / repeated tasks saved with a short code (T01, BILL …) so they can be assigned in one tap. */
final class TaskTemplateController extends Controller
{
    /** GET /task-templates?q= */
    public function index(): array
    {
        $q = trim((string) ($this->req->query['q'] ?? ''));
        $rows = Db::all("SELECT t.*, d.name AS department_name FROM task_templates t LEFT JOIN departments d ON d.id = t.department_id
                          WHERE t.company_id = ? AND (? = '' OR t.code LIKE ? OR t.title LIKE ?) ORDER BY t.code",
            [$this->cid, $q, "%$q%", "%$q%"]);
        return array_map([self::class, 'present'], $rows);
    }

    public static function present(array $r): array
    {
        $r['id'] = (int) $r['id'];
        $r['checklist'] = $r['checklist_json'] ? (json_decode($r['checklist_json'], true) ?: []) : [];
        unset($r['checklist_json']);
        return $r;
    }

    private function data(bool $create): array
    {
        $d = $this->req->only(['code', 'title', 'description', 'department_id', 'priority', 'proof_type', 'due_hours']);
        if ($create) $this->req->require(['title']);
        if (isset($d['code'])) $d['code'] = strtoupper(preg_replace('/[^A-Za-z0-9\-]/', '', (string) $d['code']));
        if ($create && empty($d['code'])) {
            $n = (int) Db::value('SELECT COUNT(*) FROM task_templates WHERE company_id = ?', [$this->cid]) + 1;
            do { $d['code'] = sprintf('T%02d', $n++); } while (Db::value('SELECT 1 FROM task_templates WHERE company_id = ? AND code = ?', [$this->cid, $d['code']]));
        }
        if (isset($d['priority']) && !in_array($d['priority'], ['low', 'medium', 'high', 'urgent'], true)) $d['priority'] = 'medium';
        if (isset($d['proof_type']) && is_array($d['proof_type'])) $d['proof_type'] = implode(',', $d['proof_type']);
        foreach (['department_id', 'due_hours'] as $k) if (array_key_exists($k, $d)) $d[$k] = $d[$k] === '' || $d[$k] === null ? null : (int) $d[$k];
        if (array_key_exists('proof_type', $d) && !$d['proof_type']) $d['proof_type'] = null;
        $cl = $this->req->input('checklist');
        if (is_array($cl)) {
            $cl = array_values(array_filter(array_map(fn($x) => is_array($x)
                ? (trim((string) ($x['label'] ?? '')) === '' ? null : ['label' => trim($x['label']), 'assigned_to' => !empty($x['assigned_to']) ? (int) $x['assigned_to'] : null])
                : (trim((string) $x) === '' ? null : trim((string) $x)), $cl)));
            $d['checklist_json'] = json_encode($cl, JSON_UNESCAPED_UNICODE);
        }
        return $d;
    }

    /** POST /task-templates */
    public function store(): array
    {
        $d = $this->data(true) + ['company_id' => $this->cid, 'created_by' => $this->uid()];
        if (Db::value('SELECT 1 FROM task_templates WHERE company_id = ? AND code = ?', [$this->cid, $d['code']])) throw HttpError::badRequest("Code {$d['code']} is already used");
        $id = Db::insert('task_templates', $d);
        return self::present(Db::one('SELECT * FROM task_templates WHERE id = ?', [$id]));
    }

    /** PATCH /task-templates/{id} */
    public function update(): array
    {
        $id = $this->param('id');
        if (!Db::value('SELECT 1 FROM task_templates WHERE id = ? AND company_id = ?', [$id, $this->cid])) throw HttpError::notFound();
        $d = $this->data(false);
        if (!empty($d['code']) && Db::value('SELECT 1 FROM task_templates WHERE company_id = ? AND code = ? AND id <> ?', [$this->cid, $d['code'], $id])) throw HttpError::badRequest("Code {$d['code']} is already used");
        if ($d) Db::update('task_templates', $id, $d, $this->cid);
        return self::present(Db::one('SELECT * FROM task_templates WHERE id = ?', [$id]));
    }

    /** DELETE /task-templates/{id} */
    public function destroy(): array
    {
        Db::exec('DELETE FROM task_templates WHERE id = ? AND company_id = ?', [$this->param('id'), $this->cid]);
        return ['deleted' => true];
    }

    /** GET /task-defaults — default due window used when a task has no due time */
    public function defaults(): array
    {
        $s = json_decode((string) Db::value('SELECT erp_settings FROM companies WHERE id = ?', [$this->cid]), true) ?: [];
        return ['default_due_hours' => (int) ($s['default_due_hours'] ?? 4)];
    }

    /** PATCH /task-defaults {default_due_hours} */
    public function saveDefaults(): array
    {
        $h = max(1, min(72, $this->req->int('default_due_hours') ?: 4));
        $s = json_decode((string) Db::value('SELECT erp_settings FROM companies WHERE id = ?', [$this->cid]), true) ?: [];
        $s['default_due_hours'] = $h;
        Db::exec('UPDATE companies SET erp_settings = ? WHERE id = ?', [json_encode($s), $this->cid]);
        return ['default_due_hours' => $h];
    }
}
