<?php
namespace App\Controllers\Erp;

use App\Core\{Db, HttpError};
use App\Services\Erp\{Audit, DocNo, Workflow};
use App\Services\{Notifier, Upload};

/** Customer complaints and shop maintenance tickets (AC, lift, electrical…). Each ticket gets a task. */
final class ComplaintController extends Base
{
    public function index(): array
    {
        $this->need('complaints');
        $where = ['k.company_id = ?']; $p = [$this->cid];
        if ($t = $this->q('type')) { $where[] = 'k.type = ?'; $p[] = $t; }
        if ($s = $this->q('status')) { if ($s === 'open') $where[] = "k.status IN ('open','in_progress')"; else { $where[] = 'k.status = ?'; $p[] = $s; } }
        return Db::all("SELECT k.*, c.name AS customer_name, c.mobile AS customer_mobile, s.doc_no AS invoice_no, a.name AS assigned_name, u.name AS created_by_name
                          FROM complaints k LEFT JOIN customers c ON c.id = k.customer_id LEFT JOIN sales_docs s ON s.id = k.invoice_id
                          LEFT JOIN users a ON a.id = k.assigned_to LEFT JOIN users u ON u.id = k.created_by
                         WHERE " . implode(' AND ', $where) . " ORDER BY FIELD(k.status,'open','in_progress','resolved','closed'), k.id DESC LIMIT 500", $p);
    }

    public function store(): array
    {
        $this->need('complaints', true);
        $in = $this->req->require(['title']);
        $type = $this->req->input('type') === 'maintenance' ? 'maintenance' : 'customer';
        $assign = $this->req->int('assigned_to');
        if ($assign) $this->assertSameCompanyUser($assign);
        $prio = in_array($this->req->input('priority'), ['low', 'medium', 'high'], true) ? $this->req->input('priority') : 'medium';
        $id = Db::insert('complaints', ['company_id' => $this->cid, 'ticket_no' => DocNo::next($this->cid, $type === 'maintenance' ? 'MNT' : 'CMP'), 'type' => $type,
            'customer_id' => $this->req->int('customer_id'), 'invoice_id' => $this->req->int('invoice_id'), 'title' => mb_substr($in['title'], 0, 200),
            'description' => $this->req->input('description'), 'priority' => $prio, 'assigned_to' => $assign, 'created_by' => $this->uid()]);
        foreach (Upload::list($this->req->files, 'photos') as $f) Upload::save($f, $this->cid, $this->uid(), 'complaint', $id);
        $k = Db::one('SELECT * FROM complaints WHERE id = ?', [$id]);
        if ($assign) {
            $tid = Db::insert('tasks', ['company_id' => $this->cid, 'title' => mb_substr(($type === 'maintenance' ? 'Maintenance: ' : 'Complaint: ') . $k['title'], 0, 200),
                'description' => $k['description'], 'assigned_to' => $assign, 'assigned_by' => $this->uid(), 'priority' => $prio,
                'due_at' => date('Y-m-d H:i:s', time() + ($prio === 'high' ? 4 : 24) * 3600), 'source' => 'erp', 'ref_type' => 'complaint', 'ref_id' => $id]);
            Db::update('complaints', $id, ['task_id' => $tid]);
            Notifier::notify($this->cid, $assign, 'task_assigned', 'New ' . $type . ' ticket: ' . $k['title'], null, 'task', $tid);
        }
        Audit::log($this->cid, $this->uid(), 'complaint', $id, 'created');
        Workflow::fire($this->cid, 'complaint.created', 'complaint', $id, $k['ticket_no'] . ' · ' . $k['title'], ['creator_id' => $this->uid()]);
        return Db::one('SELECT * FROM complaints WHERE id = ?', [$id]);
    }

    /** PATCH /erp/complaints/{id} {status, resolution, assigned_to, priority} */
    public function update(): array
    {
        $this->need('complaints', true);
        $k = Db::one('SELECT * FROM complaints WHERE id = ? AND company_id = ?', [$this->param('id'), $this->cid]);
        if (!$k) throw HttpError::notFound();
        $d = $this->req->only(['status', 'resolution', 'assigned_to', 'priority']);
        if (isset($d['status']) && !in_array($d['status'], ['open', 'in_progress', 'resolved', 'closed'], true)) throw HttpError::badRequest('Unknown status');
        if (($d['status'] ?? '') === 'resolved') {
            if (!trim((string) ($d['resolution'] ?? $k['resolution']))) throw HttpError::badRequest('Write what was done to resolve it');
            $d['resolved_at'] = date('Y-m-d H:i:s');
        }
        if (!empty($d['assigned_to'])) $this->assertSameCompanyUser((int) $d['assigned_to']);
        Db::update('complaints', (int) $k['id'], $d, $this->cid);
        if (in_array($d['status'] ?? '', ['resolved', 'closed'], true) && $k['task_id']) {
            $t = Db::one("SELECT * FROM tasks WHERE id = ? AND status IN ('not_started','in_progress','on_hold')", [$k['task_id']]);
            if ($t) \App\Controllers\TaskController::setStatus($t, 'done', $this->uid());
        }
        Audit::log($this->cid, $this->uid(), 'complaint', (int) $k['id'], 'updated', $d);
        foreach (Upload::list($this->req->files, 'photos') as $f) Upload::save($f, $this->cid, $this->uid(), 'complaint', (int) $k['id']);
        return Db::one('SELECT * FROM complaints WHERE id = ?', [$k['id']]) + ['history' => Audit::history($this->cid, 'complaint', (int) $k['id']), 'files' => $this->files('complaint', (int) $k['id'])];
    }
}
