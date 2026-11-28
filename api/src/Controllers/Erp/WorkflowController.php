<?php
namespace App\Controllers\Erp;

use App\Core\{Db, HttpError};
use App\Services\Erp\{Audit, Workflow};

/** Workflow builder (boss) + running workflows. */
final class WorkflowController extends Base
{
    public function index(): array
    {
        if ($this->user['role'] === 'employee') throw HttpError::forbidden();
        $rows = Db::all('SELECT w.*, (SELECT COUNT(*) FROM workflow_runs r WHERE r.workflow_id = w.id AND r.status = \'running\') AS running,
                                (SELECT COUNT(*) FROM workflow_runs r WHERE r.workflow_id = w.id) AS total_runs
                           FROM workflows w WHERE w.company_id = ? ORDER BY w.id', [$this->cid]);
        foreach ($rows as &$r) $r['steps'] = json_decode($r['steps'], true) ?: [];
        return ['events' => Workflow::EVENTS, 'workflows' => $rows];
    }

    public function store(): array { return $this->save(null); }
    public function update(): array { return $this->save($this->param('id')); }

    private function save(?int $id): array
    {
        $this->need('workflows', true);
        $name = trim((string) $this->req->input('name'));
        $event = (string) $this->req->input('trigger_event');
        if ($name === '') throw HttpError::badRequest('Name is required');
        if (!isset(Workflow::EVENTS[$event])) throw HttpError::badRequest('Pick when the workflow starts');
        $steps = Workflow::cleanSteps($this->req->input('steps', []));
        if (!$steps) throw HttpError::badRequest('Add at least one step');
        $d = ['name' => mb_substr($name, 0, 120), 'trigger_event' => $event, 'steps' => json_encode($steps),
              'min_amount' => $this->req->input('min_amount') !== null && $this->req->input('min_amount') !== '' ? (float) $this->req->input('min_amount') : null,
              'max_amount' => $this->req->input('max_amount') !== null && $this->req->input('max_amount') !== '' ? (float) $this->req->input('max_amount') : null,
              'is_active' => $this->req->input('is_active', true) ? 1 : 0];
        if ($id) {
            $old = Db::one('SELECT * FROM workflows WHERE id = ? AND company_id = ?', [$id, $this->cid]);
            if (!$old) throw HttpError::notFound();
            if ($old['steps'] !== $d['steps']) $d['version'] = (int) $old['version'] + 1;
            Db::update('workflows', $id, $d, $this->cid);
            Audit::log($this->cid, $this->uid(), 'workflow', $id, 'updated', ['version' => $d['version'] ?? $old['version']]);
        } else {
            $id = Db::insert('workflows', $d + ['company_id' => $this->cid, 'created_by' => $this->uid()]);
            Audit::log($this->cid, $this->uid(), 'workflow', $id, 'created');
        }
        return $this->index();
    }

    public function destroy(): array
    {
        $this->need('workflows', true);
        $id = $this->param('id');
        if (Db::value("SELECT 1 FROM workflow_runs WHERE workflow_id = ? AND status = 'running'", [$id])) throw HttpError::badRequest('Workflow has running items — switch it off instead');
        Db::exec('DELETE FROM workflows WHERE id = ? AND company_id = ?', [$id, $this->cid]);
        return $this->index();
    }

    /** GET /erp/workflow-runs?status= */
    public function runs(): array
    {
        if ($this->user['role'] === 'employee') throw HttpError::forbidden();
        $where = ['r.company_id = ?']; $p = [$this->cid];
        if ($s = $this->q('status')) { $where[] = 'r.status = ?'; $p[] = $s; }
        if ($w = $this->q('workflow_id')) { $where[] = 'r.workflow_id = ?'; $p[] = (int) $w; }
        $rows = Db::all('SELECT r.id, r.workflow_id, r.version, r.ref_type, r.ref_id, r.title, r.current_step, r.status, r.started_at, r.finished_at, r.steps, w.name AS workflow_name
                           FROM workflow_runs r JOIN workflows w ON w.id = r.workflow_id WHERE ' . implode(' AND ', $where) . ' ORDER BY r.id DESC LIMIT 300', $p);
        foreach ($rows as &$r) {
            $steps = json_decode($r['steps'], true) ?: [];
            unset($r['steps']);
            $r['step_count'] = count($steps);
            $r['tasks'] = Db::all('SELECT t.id, t.title, t.status, t.due_at, t.workflow_step, u.name AS assignee FROM tasks t JOIN users u ON u.id = t.assigned_to WHERE t.workflow_run_id = ? ORDER BY t.id', [$r['id']]);
        }
        return $rows;
    }

    /** POST /erp/workflow-runs/{id} {action: pause|resume|cancel} */
    public function runAction(): array
    {
        if (!in_array($this->user['role'], ['owner', 'manager'], true)) throw HttpError::forbidden();
        $id = $this->param('id');
        if (!Db::value('SELECT 1 FROM workflow_runs WHERE id = ? AND company_id = ?', [$id, $this->cid])) throw HttpError::notFound();
        $a = $this->req->input('action');
        if ($a === 'cancel') {
            if (!trim((string) $this->req->input('reason'))) throw HttpError::badRequest('Reason is required');
            Workflow::cancel($id);
        } elseif ($a === 'pause' || $a === 'resume') Workflow::setPaused($id, $a === 'pause');
        else throw HttpError::badRequest('Unknown action');
        Audit::log($this->cid, $this->uid(), 'workflow_run', $id, $a, ['reason' => $this->req->input('reason')]);
        return ['ok' => true];
    }

    /** POST /erp/workflows/{id}/start {title, amount} — manual start (e.g. "new product purchase" process) */
    public function start(): array
    {
        if (!in_array($this->user['role'], ['owner', 'manager'], true)) throw HttpError::forbidden();
        $wf = Db::one('SELECT * FROM workflows WHERE id = ? AND company_id = ?', [$this->param('id'), $this->cid]);
        if (!$wf) throw HttpError::notFound();
        $title = trim((string) $this->req->input('title')) ?: $wf['name'];
        $amount = $this->req->input('amount');
        $runId = Workflow::start($this->cid, $wf, 'manual', null, $title, ['creator_id' => $this->uid()] + ($amount !== null && $amount !== '' ? ['amount' => (float) $amount] : []));
        return ['run_id' => $runId];
    }
}
