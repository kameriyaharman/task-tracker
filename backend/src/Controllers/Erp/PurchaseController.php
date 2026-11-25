<?php
namespace App\Controllers\Erp;

use App\Core\{Db, HttpError};
use App\Services\Erp\{Approvals, Audit, DocNo, Docs};
use App\Services\Upload;

/** Purchase orders and goods receipts (GRN). */
final class PurchaseController extends Base
{
    // ───────── Purchase orders ─────────
    public function index(): array
    {
        $this->need('purchase');
        $where = ['p.company_id = ?']; $p = [$this->cid];
        if ($s = $this->q('status')) { $where[] = 'p.status = ?'; $p[] = $s; }
        if ($v = $this->q('vendor_id')) { $where[] = 'p.vendor_id = ?'; $p[] = (int) $v; }
        if ($q = $this->q('q')) { $where[] = '(p.po_no LIKE ? OR v.name LIKE ?)'; $p[] = "%$q%"; $p[] = "%$q%"; }
        return Db::all('SELECT p.*, v.name AS vendor_name, u.name AS created_by_name, w.name AS warehouse_name,
                               (SELECT COALESCE(SUM(qty),0) FROM purchase_order_items i WHERE i.po_id = p.id) AS qty,
                               (SELECT COALESCE(SUM(received_qty),0) FROM purchase_order_items i WHERE i.po_id = p.id) AS received
                          FROM purchase_orders p JOIN vendors v ON v.id = p.vendor_id LEFT JOIN users u ON u.id = p.created_by LEFT JOIN warehouses w ON w.id = p.warehouse_id
                         WHERE ' . implode(' AND ', $where) . ' ORDER BY p.id DESC LIMIT 500', $p);
    }

    public function show(): array
    {
        $this->need('purchase');
        $po = Db::one('SELECT p.*, v.name AS vendor_name, v.mobile AS vendor_mobile, v.gstin AS vendor_gstin, u.name AS created_by_name, w.name AS warehouse_name
                         FROM purchase_orders p JOIN vendors v ON v.id = p.vendor_id LEFT JOIN users u ON u.id = p.created_by LEFT JOIN warehouses w ON w.id = p.warehouse_id
                        WHERE p.id = ? AND p.company_id = ?', [$this->param('id'), $this->cid]);
        if (!$po) throw HttpError::notFound();
        $po['items'] = $this->items('purchase_order_items', 'po_id', (int) $po['id']);
        $po['grns'] = Db::all('SELECT id, grn_no, status, total, created_at FROM grns WHERE po_id = ? ORDER BY id', [$po['id']]);
        $po['approvals'] = Approvals::history($this->cid, 'purchase_order', (int) $po['id']);
        $po['history'] = Audit::history($this->cid, 'purchase_order', (int) $po['id']);
        $po['files'] = $this->files('purchase_order', (int) $po['id']);
        return $po;
    }

    /** POST /erp/purchase-orders {vendor_id, warehouse_id, expected_date, notes, items:[...], submit:bool} */
    public function store(): array
    {
        $this->need('purchase', true);
        return $this->savePo(null);
    }

    public function update(): array
    {
        $this->need('purchase', true);
        return $this->savePo($this->param('id'));
    }

    private function savePo(?int $id): array
    {
        $vendor = (int) $this->req->require(['vendor_id'])['vendor_id'];
        if (!Db::value('SELECT 1 FROM vendors WHERE id = ? AND company_id = ?', [$vendor, $this->cid])) throw HttpError::badRequest('Unknown vendor');
        [$lines, $sub, , $tax, $total] = $this->lines((array) $this->req->input('items', []), false, 'purchase_price');
        $data = ['vendor_id' => $vendor, 'warehouse_id' => $this->warehouse($this->req->int('warehouse_id')), 'expected_date' => $this->req->input('expected_date') ?: null,
                 'notes' => $this->req->input('notes'), 'subtotal' => $sub, 'tax' => $tax, 'total' => $total];
        Db::tx(function () use (&$id, $data, $lines) {
            if ($id) {
                $po = Db::one('SELECT status FROM purchase_orders WHERE id = ? AND company_id = ?', [$id, $this->cid]);
                if (!$po) throw HttpError::notFound();
                if (!in_array($po['status'], ['draft', 'rejected'], true)) throw HttpError::badRequest('Only a draft or rejected PO can be edited');
                Db::update('purchase_orders', $id, $data + ['status' => 'draft']);
                Db::exec('DELETE FROM purchase_order_items WHERE po_id = ?', [$id]);
                Audit::log($this->cid, $this->uid(), 'purchase_order', $id, 'edited', ['total' => $data['total']]);
            } else {
                $id = Db::insert('purchase_orders', $data + ['company_id' => $this->cid, 'po_no' => DocNo::next($this->cid, 'PO'), 'order_date' => date('Y-m-d'), 'created_by' => $this->uid()]);
                Audit::log($this->cid, $this->uid(), 'purchase_order', $id, 'created', ['total' => $data['total']]);
            }
            foreach ($lines as $l) Db::insert('purchase_order_items', ['po_id' => $id, 'product_id' => $l['product_id'], 'qty' => $l['qty'], 'rate' => $l['rate'], 'gst_rate' => $l['gst_rate'], 'amount' => $l['amount']]);
        });
        foreach (Upload::list($this->req->files, 'files') as $f) Upload::save($f, $this->cid, $this->uid(), 'purchase_order', $id);
        if ($this->req->input('submit')) Docs::submitPo($this->cid, $id, $this->user);
        $this->req->params['id'] = $id;
        return $this->show();
    }

    public function submit(): array
    {
        $this->need('purchase', true);
        $this->show();
        Docs::submitPo($this->cid, $this->param('id'), $this->user);
        return $this->show();
    }

    /** POST /erp/purchase-orders/{id}/status {status: ordered|closed|cancelled} */
    public function status(): array
    {
        $this->need('purchase', true);
        $po = $this->show();
        $s = $this->req->require(['status'])['status'];
        $allowed = ['ordered' => ['approved'], 'closed' => ['partial', 'ordered', 'approved'], 'cancelled' => ['draft', 'pending_approval', 'approved', 'ordered', 'rejected']];
        if (!isset($allowed[$s]) || !in_array($po['status'], $allowed[$s], true)) throw HttpError::badRequest("Can't move a {$po['status']} PO to $s");
        if ($s === 'cancelled' && $po['grns']) throw HttpError::badRequest('Goods already received against this PO; close it instead');
        Db::update('purchase_orders', (int) $po['id'], ['status' => $s]);
        if ($s === 'cancelled') Db::exec("UPDATE approvals SET status = 'skipped' WHERE company_id = ? AND doc_type = 'purchase_order' AND doc_id = ? AND status IN ('pending','waiting')", [$this->cid, $po['id']]);
        Audit::log($this->cid, $this->uid(), 'purchase_order', (int) $po['id'], $s, ['reason' => $this->req->input('reason')]);
        return $this->show();
    }

    // ───────── GRN ─────────
    public function grnIndex(): array
    {
        $this->need('inventory');
        $where = ['g.company_id = ?']; $p = [$this->cid];
        if ($s = $this->q('status')) { $where[] = 'g.status = ?'; $p[] = $s; }
        if ($q = $this->q('q')) { $where[] = '(g.grn_no LIKE ? OR v.name LIKE ? OR g.bill_no LIKE ?)'; array_push($p, "%$q%", "%$q%", "%$q%"); }
        return Db::all('SELECT g.*, v.name AS vendor_name, po.po_no, w.name AS warehouse_name, u.name AS created_by_name
                          FROM grns g JOIN vendors v ON v.id = g.vendor_id LEFT JOIN purchase_orders po ON po.id = g.po_id
                          LEFT JOIN warehouses w ON w.id = g.warehouse_id LEFT JOIN users u ON u.id = g.created_by
                         WHERE ' . implode(' AND ', $where) . ' ORDER BY g.id DESC LIMIT 500', $p);
    }

    public function grnShow(): array
    {
        $this->need('inventory');
        $g = Db::one('SELECT g.*, v.name AS vendor_name, po.po_no, w.name AS warehouse_name, u.name AS created_by_name
                         FROM grns g JOIN vendors v ON v.id = g.vendor_id LEFT JOIN purchase_orders po ON po.id = g.po_id
                         LEFT JOIN warehouses w ON w.id = g.warehouse_id LEFT JOIN users u ON u.id = g.created_by
                        WHERE g.id = ? AND g.company_id = ?', [$this->param('id'), $this->cid]);
        if (!$g) throw HttpError::notFound();
        $g['items'] = $this->items('grn_items', 'grn_id', (int) $g['id']);
        $g['approvals'] = Approvals::history($this->cid, 'grn', (int) $g['id']);
        $g['history'] = Audit::history($this->cid, 'grn', (int) $g['id']);
        $g['files'] = $this->files('grn', (int) $g['id']);
        return $g;
    }

    /**
     * Bill date cannot be in the future.
     * POST /erp/grns {po_id?, vendor_id, warehouse_id, bill_no, bill_date, bill_amount?, notes,
     *                 items:[{product_id, po_item_id?, qty (accepted), damaged_qty, rate}]}  + photos/bill files
     * Partial receipt is fine; damaged quantity is recorded but not added to stock.
     */
    public function grnStore(): array
    {
        $this->need('inventory', true);
        $billDate = $this->req->input('bill_date') ?: date('Y-m-d');
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $billDate) || $billDate > date('Y-m-d')) throw HttpError::badRequest('Bill date cannot be in the future (today is ' . date('d M Y') . ')');
        if ($billDate < date('Y-m-d', strtotime('-1 year'))) throw HttpError::badRequest('Bill date is more than a year old — please check');
        $poId = $this->req->int('po_id');
        $po = null;
        if ($poId) {
            $po = Db::one('SELECT * FROM purchase_orders WHERE id = ? AND company_id = ?', [$poId, $this->cid]);
            if (!$po) throw HttpError::badRequest('Unknown PO');
            if (!in_array($po['status'], ['approved', 'ordered', 'partial'], true)) throw HttpError::badRequest('PO must be approved before receiving goods');
        }
        $vendor = (int) ($po['vendor_id'] ?? $this->req->require(['vendor_id'])['vendor_id']);
        if (!Db::value('SELECT 1 FROM vendors WHERE id = ? AND company_id = ?', [$vendor, $this->cid])) throw HttpError::badRequest('Unknown vendor');
        $raw = array_values(array_filter((array) $this->req->input('items', []), fn($l) => (float) ($l['qty'] ?? 0) > 0 || (float) ($l['damaged_qty'] ?? 0) > 0));
        foreach ($raw as &$l) if ((float) ($l['qty'] ?? 0) <= 0) $l['qty'] = 0.0001; // damaged-only line keeps its place
        unset($l);
        [$lines, $sub, , $tax, $total] = $this->lines($raw, false, 'purchase_price');
        if ($po) {
            foreach ($lines as $l) {
                if (!$l['po_item_id']) continue;
                $pi = Db::one('SELECT * FROM purchase_order_items WHERE id = ? AND po_id = ?', [$l['po_item_id'], $poId]);
                if (!$pi) throw HttpError::badRequest('Item not on this PO');
                $pending = (float) Db::value("SELECT COALESCE(SUM(gi.qty + gi.damaged_qty),0) FROM grn_items gi JOIN grns g ON g.id = gi.grn_id WHERE gi.po_item_id = ? AND g.status = 'pending_approval'", [$pi['id']]);
                $left = (float) $pi['qty'] - (float) $pi['received_qty'] - $pending;
                if ($l['qty'] + $l['damaged_qty'] > $left + 0.0005) {
                    throw HttpError::badRequest('Receiving more than ordered for ' . Db::value('SELECT name FROM products WHERE id = ?', [$pi['product_id']]) . " (left: $left)");
                }
            }
        }
        $billAmount = $this->req->input('bill_amount');
        $id = Db::tx(function () use ($po, $poId, $vendor, $lines, $sub, $tax, $total, $billAmount) {
            $id = Db::insert('grns', ['company_id' => $this->cid, 'grn_no' => DocNo::next($this->cid, 'GRN'), 'po_id' => $poId, 'vendor_id' => $vendor,
                'warehouse_id' => $this->warehouse($this->req->int('warehouse_id') ?? ($po['warehouse_id'] ?? null)), 'bill_no' => $this->req->input('bill_no'),
                'bill_date' => $billDate, 'subtotal' => $sub, 'tax' => $tax,
                'total' => $billAmount !== null && $billAmount !== '' ? round((float) $billAmount, 2) : $total,
                'notes' => $this->req->input('notes'), 'created_by' => $this->uid()]);
            foreach ($lines as $l) {
                $q = $l['qty'] < 0.001 ? 0 : $l['qty'];
                Db::insert('grn_items', ['grn_id' => $id, 'po_item_id' => $l['po_item_id'], 'product_id' => $l['product_id'], 'qty' => $q, 'damaged_qty' => $l['damaged_qty'],
                    'rate' => $l['rate'], 'gst_rate' => $l['gst_rate'], 'amount' => round($q * $l['rate'] * (1 + $l['gst_rate'] / 100), 2)]);
            }
            Audit::log($this->cid, $this->uid(), 'grn', $id, 'created', ['total' => $total]);
            return $id;
        });
        foreach (array_merge(Upload::list($this->req->files, 'photos'), Upload::list($this->req->files, 'files')) as $f) Upload::save($f, $this->cid, $this->uid(), 'grn', $id);
        Docs::submitGrn($this->cid, $id, $this->user);
        $this->req->params['id'] = $id;
        return $this->grnShow();
    }
}
