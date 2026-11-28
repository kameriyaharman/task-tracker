<?php
namespace App\Controllers;

use App\Core\{Controller, Db, HttpError};

/** Knowledge base — a register of lessons learnt ("before pouring concrete, tape the joints"), linked to complaints / tasks. */
final class KnowledgeController extends Controller
{
    public const CATEGORIES = ['Site work', 'Delivery', 'Products', 'Customers', 'Accounts', 'Stores', 'Sales', 'Safety', 'Other'];

    /** GET /kb?q=&category= */
    public function index(): array
    {
        $w = ['k.company_id = ?']; $p = [$this->cid];
        if ($q = trim((string) ($this->req->query['q'] ?? ''))) { $w[] = '(k.title LIKE ? OR k.problem LIKE ? OR k.lesson LIKE ? OR k.tags LIKE ?)'; array_push($p, "%$q%", "%$q%", "%$q%", "%$q%"); }
        if ($c = $this->req->query['category'] ?? '') { $w[] = 'k.category = ?'; $p[] = $c; }
        if ($st = $this->req->query['source_type'] ?? '') { $w[] = 'k.source_type = ? AND k.source_id = ?'; $p[] = $st; $p[] = (int) ($this->req->query['source_id'] ?? 0); }
        $rows = Db::all("SELECT k.*, u.name AS created_by_name,
                                CASE k.source_type WHEN 'complaint' THEN (SELECT CONCAT(ticket_no, ' · ', title) FROM complaints WHERE id = k.source_id)
                                                   WHEN 'task' THEN (SELECT title FROM tasks WHERE id = k.source_id) END AS source_label
                           FROM kb_entries k JOIN users u ON u.id = k.created_by WHERE " . implode(' AND ', $w) . ' ORDER BY k.id DESC LIMIT 300', $p);
        $counts = Db::all('SELECT category, COUNT(*) AS n FROM kb_entries WHERE company_id = ? GROUP BY category', [$this->cid]);
        return ['items' => $rows, 'categories' => self::CATEGORIES, 'counts' => $counts];
    }

    private function data(): array
    {
        $d = $this->req->only(['title', 'problem', 'lesson', 'category', 'tags', 'source_type', 'source_id']);
        if (isset($d['category']) && !in_array($d['category'], self::CATEGORIES, true)) $d['category'] = 'Other';
        if (isset($d['source_type']) && !in_array($d['source_type'], ['complaint', 'task', ''], true)) unset($d['source_type']);
        if (array_key_exists('source_id', $d)) $d['source_id'] = $d['source_id'] ? (int) $d['source_id'] : null;
        foreach (['title', 'tags'] as $k) if (isset($d[$k])) $d[$k] = mb_substr(trim($d[$k]), 0, 200);
        return $d;
    }

    /** POST /kb {title, lesson, problem, category, tags, source_type, source_id} — anyone can add a lesson */
    public function store(): array
    {
        $this->req->require(['title', 'lesson']);
        $id = Db::insert('kb_entries', $this->data() + ['company_id' => $this->cid, 'created_by' => $this->uid()]);
        return Db::one('SELECT * FROM kb_entries WHERE id = ?', [$id]);
    }

    public function update(): array
    {
        $k = Db::one('SELECT * FROM kb_entries WHERE id = ? AND company_id = ?', [$this->param('id'), $this->cid]);
        if (!$k) throw HttpError::notFound();
        if ((int) $k['created_by'] !== $this->uid() && !$this->isManager()) throw HttpError::forbidden('Only the writer or a manager can edit this');
        Db::update('kb_entries', (int) $k['id'], $this->data() + ['updated_at' => date('Y-m-d H:i:s')], $this->cid);
        return Db::one('SELECT * FROM kb_entries WHERE id = ?', [$k['id']]);
    }

    public function destroy(): array
    {
        $k = Db::one('SELECT * FROM kb_entries WHERE id = ? AND company_id = ?', [$this->param('id'), $this->cid]);
        if (!$k) throw HttpError::notFound();
        if ((int) $k['created_by'] !== $this->uid() && !$this->isManager()) throw HttpError::forbidden();
        Db::exec('DELETE FROM kb_entries WHERE id = ?', [$k['id']]);
        return ['deleted' => true];
    }
}
