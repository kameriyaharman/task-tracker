<?php
namespace App\Controllers\Erp;

use App\Core\{Db, HttpError};
use App\Services\Erp\{Audit, DocNo, Workflow};
use App\Services\{Notifier, Upload};

/** Customer complaints and shop maintenance tickets (AC, lift, electrical…). Each ticket gets a task. */
final class ComplaintController extends Base
{
    public const CATEGORIES = ['Product defect', 'Short / wrong supply', 'Late delivery', 'Damaged in delivery', 'Billing / rate', 'Installation / service', 'Staff behaviour', 'Shop maintenance', 'Other'];

    public function index(): array
    {
        $this->need('complaints');
        $where = ['k.company_id = ?']; $p = [$this->cid];
        if ($t = $this->q('type')) { $where[] = 'k.type = ?'; $p[] = $t; }
        if ($s = $this->q('status')) { if ($s === 'open') $where[] = "k.status IN ('open','in_progress')"; else { $where[] = 'k.status = ?'; $p[] = $s; } }
        if ($cat = $this->q('category')) { $where[] = 'k.category = ?'; $p[] = $cat; }
        return Db::all("SELECT k.*, c.name AS customer_name, c.mobile AS customer_mobile, s.doc_no AS invoice_no, a.name AS assigned_name, u.name AS created_by_name, pr.name AS product_name,
                               (SELECT COUNT(*) FROM kb_entries kb WHERE kb.source_type = 'complaint' AND kb.source_id = k.id) AS lessons
                          FROM complaints k LEFT JOIN customers c ON c.id = k.customer_id LEFT JOIN sales_docs s ON s.id = k.invoice_id LEFT JOIN products pr ON pr.id = k.product_id
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
            'description' => $this->req->input('description'), 'priority' => $prio, 'assigned_to' => $assign, 'created_by' => $this->uid(),
            'category' => in_array($this->req->input('category'), self::CATEGORIES, true) ? $this->req->input('category') : ($type === 'maintenance' ? 'Shop maintenance' : 'Other'),
            'product_id' => $this->req->int('product_id') ?: null]);
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
        $d = $this->req->only(['status', 'resolution', 'assigned_to', 'priority', 'category', 'product_id', 'root_cause']);
        if (isset($d['category']) && !in_array($d['category'], self::CATEGORIES, true)) unset($d['category']);
        if (array_key_exists('product_id', $d)) $d['product_id'] = $d['product_id'] ? (int) $d['product_id'] : null;
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

    /** GET /erp/complaints/analysis?months=6 — what goes wrong, how often, how fast it gets fixed */
    public function analysis(): array
    {
        $this->need('complaints');
        $m = max(1, min(24, (int) ($this->q('months') ?: 6)));
        $from = date('Y-m-01', strtotime('-' . ($m - 1) . ' months'));
        $base = 'FROM complaints k WHERE k.company_id = ? AND k.created_at >= ?';
        $p = [$this->cid, $from];
        $tot = Db::one("SELECT COUNT(*) AS total, SUM(k.status IN ('open','in_progress')) AS open_now,
                               SUM(k.status IN ('resolved','closed')) AS closed,
                               AVG(CASE WHEN k.resolved_at IS NOT NULL THEN TIMESTAMPDIFF(HOUR, k.created_at, k.resolved_at) END) AS avg_hours,
                               SUM(k.resolved_at IS NOT NULL AND TIMESTAMPDIFF(HOUR, k.created_at, k.resolved_at) <= 48) AS within_48h $base", $p);
        $group = fn(string $sel, string $join = '', int $lim = 10) => Db::all("SELECT $sel AS label, COUNT(*) AS n, SUM(k.status IN ('open','in_progress')) AS open_n,
                ROUND(AVG(CASE WHEN k.resolved_at IS NOT NULL THEN TIMESTAMPDIFF(HOUR, k.created_at, k.resolved_at) END)) AS avg_hours
                FROM complaints k $join WHERE k.company_id = ? AND k.created_at >= ? GROUP BY label HAVING label IS NOT NULL ORDER BY n DESC LIMIT $lim", $p);
        $byMonth = Db::all("SELECT DATE_FORMAT(k.created_at, '%Y-%m') AS ym, COUNT(*) AS n, SUM(k.type = 'maintenance') AS maint $base GROUP BY ym ORDER BY ym", $p);
        $aging = Db::one("SELECT SUM(TIMESTAMPDIFF(HOUR, created_at, NOW()) <= 24) AS d1, SUM(TIMESTAMPDIFF(HOUR, created_at, NOW()) BETWEEN 25 AND 72) AS d3,
                                 SUM(TIMESTAMPDIFF(HOUR, created_at, NOW()) BETWEEN 73 AND 168) AS d7, SUM(TIMESTAMPDIFF(HOUR, created_at, NOW()) > 168) AS older
                            FROM complaints WHERE company_id = ? AND status IN ('open','in_progress')", [$this->cid]);
        $repeat = Db::all("SELECT c.name AS label, COUNT(*) AS n, MAX(k.created_at) AS last_at FROM complaints k JOIN customers c ON c.id = k.customer_id
                            WHERE k.company_id = ? AND k.created_at >= ? GROUP BY c.id HAVING n >= 2 ORDER BY n DESC LIMIT 10", $p);
        $noLesson = (int) Db::value("SELECT COUNT(*) FROM complaints k WHERE k.company_id = ? AND k.created_at >= ? AND k.status IN ('resolved','closed')
                            AND NOT EXISTS (SELECT 1 FROM kb_entries kb WHERE kb.source_type = 'complaint' AND kb.source_id = k.id)", $p);
        $total = (int) $tot['total'];
        return [
            'months' => $m, 'from' => $from, 'categories' => self::CATEGORIES,
            'kpis' => ['total' => $total, 'open_now' => (int) $tot['open_now'], 'closed' => (int) $tot['closed'],
                'avg_hours' => $tot['avg_hours'] !== null ? (int) round($tot['avg_hours']) : null,
                'within_48h_pct' => $tot['closed'] ? (int) round($tot['within_48h'] * 100 / $tot['closed']) : null,
                'without_lesson' => $noLesson],
            'by_category' => $group("COALESCE(k.category, 'Not set')"),
            'by_product' => $group('pr.name', 'LEFT JOIN products pr ON pr.id = k.product_id'),
            'by_person' => $group('a.name', 'LEFT JOIN users a ON a.id = k.assigned_to'),
            'by_month' => $byMonth, 'aging' => array_map('intval', $aging ?: []), 'repeat_customers' => $repeat,
        ];
    }
}
