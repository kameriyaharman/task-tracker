<?php
namespace App\Controllers\Erp;

use App\Core\{Db, HttpError};
use App\Services\Erp\{Approvals, Audit, DocNo, Docs, Ledger};

/** Quotations and sales invoices (retail / wholesale / contractor prices, cash or credit). */
final class SalesController extends Base
{
    public function index(): array
    {
        $this->need('sales');
        $where = ['s.company_id = ?', 's.doc_type = ?']; $p = [$this->cid, $this->q('type', 'invoice')];
        if ($st = $this->q('status')) { $where[] = 's.status = ?'; $p[] = $st; }
        if ($c = $this->q('customer_id')) { $where[] = 's.customer_id = ?'; $p[] = (int) $c; }
        if ($m = $this->q('payment_mode')) { $where[] = 's.payment_mode = ?'; $p[] = $m; }
        if ($f = $this->q('from')) { $where[] = 's.doc_date >= ?'; $p[] = $f; }
        if ($t = $this->q('to')) { $where[] = 's.doc_date <= ?'; $p[] = $t; }
        if ($this->q('unpaid')) $where[] = "s.status = 'final' AND s.paid_amount < s.total";
        if ($q = $this->q('q')) { $where[] = '(s.doc_no LIKE ? OR c.name LIKE ? OR s.customer_name LIKE ? OR s.customer_mobile LIKE ? OR c.mobile LIKE ?)'; array_push($p, "%$q%", "%$q%", "%$q%", "%$q%", "%$q%"); }
        return Db::all('SELECT s.*, COALESCE(c.name, s.customer_name, \'Walk-in\') AS party_name, c.mobile AS party_mobile, u.name AS created_by_name,
                               (SELECT d.status FROM deliveries d WHERE d.invoice_id = s.id ORDER BY d.id DESC LIMIT 1) AS delivery_status
                          FROM sales_docs s LEFT JOIN customers c ON c.id = s.customer_id LEFT JOIN users u ON u.id = s.created_by
                         WHERE ' . implode(' AND ', $where) . ' ORDER BY s.id DESC LIMIT 500', $p);
    }

    public function show(): array
    {
        $this->need('sales');
        $s = Db::one('SELECT s.*, COALESCE(c.name, s.customer_name, \'Walk-in\') AS party_name, c.mobile AS party_mobile, c.gstin AS party_gstin, c.address AS party_address,
                             c.credit_limit, w.name AS warehouse_name, u.name AS created_by_name
                        FROM sales_docs s LEFT JOIN customers c ON c.id = s.customer_id LEFT JOIN warehouses w ON w.id = s.warehouse_id LEFT JOIN users u ON u.id = s.created_by
                       WHERE s.id = ? AND s.company_id = ?', [$this->param('id'), $this->cid]);
        if (!$s) throw HttpError::notFound();
        $s['items'] = $this->items('sales_doc_items', 'doc_id', (int) $s['id']);
        $s['payments'] = Db::all("SELECT * FROM payments WHERE company_id = ? AND (invoice_id = ? OR (party_type = 'customer' AND party_id = ? AND ? IS NOT NULL)) AND direction = 'in' ORDER BY id DESC LIMIT 50",
            [$this->cid, $s['id'], $s['customer_id'], $s['customer_id']]);
        $s['deliveries'] = Db::all('SELECT d.*, u.name AS assigned_name FROM deliveries d LEFT JOIN users u ON u.id = d.assigned_to WHERE d.invoice_id = ? ORDER BY d.id', [$s['id']]);
        $s['returns'] = Db::all("SELECT id, return_no, status, total, created_at FROM returns_docs WHERE company_id = ? AND type = 'sales' AND ref_id = ?", [$this->cid, $s['id']]);
        $s['approvals'] = Approvals::history($this->cid, 'sales_invoice', (int) $s['id']);
        $s['history'] = Audit::history($this->cid, 'sales_invoice', (int) $s['id']);
        if ($s['customer_id']) $s['customer_outstanding'] = Ledger::customerOutstanding($this->cid, (int) $s['customer_id']);
        $s['company'] = Db::one('SELECT name, erp_settings FROM companies WHERE id = ?', [$this->cid]);
        return $s;
    }

    /**
     * POST /erp/sales {doc_type: quotation|invoice, customer_id?, customer_name?, customer_mobile?, price_type, warehouse_id,
     *                  payment_mode, needs_delivery, delivery_address, notes, items:[{product_id, qty, rate?, discount_pct?}], submit}
     */
    public function store(): array { $this->need('sales', true); return $this->save(null); }
    public function update(): array { $this->need('sales', true); return $this->save($this->param('id')); }

    private function save(?int $id): array
    {
        $type = $this->req->input('doc_type', 'invoice') === 'quotation' ? 'quotation' : 'invoice';
        $cust = $this->req->int('customer_id');
        $c = null;
        if ($cust) {
            $c = Db::one('SELECT * FROM customers WHERE id = ? AND company_id = ?', [$cust, $this->cid]);
            if (!$c) throw HttpError::badRequest('Unknown customer');
        }
        $priceType = in_array($this->req->input('price_type'), ['retail', 'wholesale', 'contractor'], true) ? $this->req->input('price_type') : ($c['type'] ?? 'retail');
        [$lines, $sub, $disc, $tax, $total] = $this->lines((array) $this->req->input('items', []), true, $priceType . '_price');
        $mode = in_array($this->req->input('payment_mode'), ['cash', 'upi', 'bank', 'card', 'credit'], true) ? $this->req->input('payment_mode') : 'cash';
        // Check stock before saving a bill that is being finalised, so a failed bill doesn't leave a draft behind
        if ($type === 'invoice' && $this->req->input('submit')) \App\Services\Erp\Stock::assertAvailable($this->cid, $this->warehouse($this->req->int('warehouse_id')), $lines);
        $data = ['doc_type' => $type, 'customer_id' => $cust, 'customer_name' => $c ? null : ($this->req->input('customer_name') ?: null),
                 'customer_mobile' => $c ? null : (preg_replace('/\D/', '', (string) $this->req->input('customer_mobile')) ?: null),
                 'price_type' => $priceType, 'warehouse_id' => $this->warehouse($this->req->int('warehouse_id')), 'payment_mode' => $mode,
                 'subtotal' => $sub, 'discount' => $disc, 'tax' => $tax, 'total' => $total, 'max_discount_pct' => max(array_column($lines, 'discount_pct') ?: [0]),
                 'needs_delivery' => $this->req->input('needs_delivery') ? 1 : 0, 'delivery_address' => $this->req->input('delivery_address'), 'notes' => $this->req->input('notes')];
        Db::tx(function () use (&$id, $data, $lines, $type) {
            if ($id) {
                $old = Db::one('SELECT * FROM sales_docs WHERE id = ? AND company_id = ?', [$id, $this->cid]);
                if (!$old) throw HttpError::notFound();
                if (!in_array($old['status'], ['draft', 'rejected'], true)) throw HttpError::badRequest('Only a draft can be edited');
                Db::update('sales_docs', $id, $data + ['status' => 'draft']);
                Db::exec('DELETE FROM sales_doc_items WHERE doc_id = ?', [$id]);
                Audit::log($this->cid, $this->uid(), 'sales_invoice', $id, 'edited', ['total' => $data['total']]);
            } else {
                $id = Db::insert('sales_docs', $data + ['company_id' => $this->cid, 'doc_no' => DocNo::next($this->cid, $type === 'quotation' ? 'QT' : 'INV'),
                    'doc_date' => date('Y-m-d'), 'created_by' => $this->uid(), 'source_id' => $this->req->int('source_id')]);
                Audit::log($this->cid, $this->uid(), 'sales_invoice', $id, 'created', ['type' => $type, 'total' => $data['total']]);
            }
            foreach ($lines as $l) Db::insert('sales_doc_items', ['doc_id' => $id, 'product_id' => $l['product_id'], 'qty' => $l['qty'], 'rate' => $l['rate'],
                'discount_pct' => $l['discount_pct'], 'gst_rate' => $l['gst_rate'], 'amount' => $l['amount']]);
        });
        if ($this->req->input('submit')) $this->doSubmit($id, $type);
        $this->req->params['id'] = $id;
        return $this->show();
    }

    private function doSubmit(int $id, string $type): void
    {
        if ($type === 'quotation') { Db::update('sales_docs', $id, ['status' => 'final']); return; }
        Docs::submitInvoice($this->cid, $id, $this->user);
    }

    public function submit(): array
    {
        $this->need('sales', true);
        $s = $this->show();
        $this->doSubmit((int) $s['id'], $s['doc_type']);
        return $this->show();
    }

    /** POST /erp/sales/{id}/convert — quotation → draft invoice */
    public function convert(): array
    {
        $this->need('sales', true);
        $q = $this->show();
        if ($q['doc_type'] !== 'quotation') throw HttpError::badRequest('Not a quotation');
        if ($q['status'] === 'converted') throw HttpError::badRequest('Already converted');
        $this->req->body = ['doc_type' => 'invoice', 'customer_id' => $q['customer_id'], 'customer_name' => $q['customer_name'], 'customer_mobile' => $q['customer_mobile'],
            'price_type' => $q['price_type'], 'warehouse_id' => $q['warehouse_id'], 'payment_mode' => $this->req->input('payment_mode', $q['payment_mode']),
            'needs_delivery' => $q['needs_delivery'], 'delivery_address' => $q['delivery_address'], 'notes' => $q['notes'], 'source_id' => $q['id'],
            'items' => array_map(fn($i) => ['product_id' => $i['product_id'], 'qty' => $i['qty'], 'rate' => $i['rate'], 'discount_pct' => $i['discount_pct'], 'gst_rate' => $i['gst_rate']], $q['items'])];
        return $this->save(null);
    }

    public function cancel(): array
    {
        $this->need('sales', true);
        $s = $this->show();
        if ($s['status'] === 'final' && $s['doc_type'] === 'invoice') throw HttpError::badRequest('A final invoice cannot be cancelled — make a sales return instead');
        Db::update('sales_docs', (int) $s['id'], ['status' => 'cancelled']);
        Db::exec("UPDATE approvals SET status = 'skipped' WHERE company_id = ? AND doc_type = 'sales_invoice' AND doc_id = ? AND status IN ('pending','waiting')", [$this->cid, $s['id']]);
        Audit::log($this->cid, $this->uid(), 'sales_invoice', (int) $s['id'], 'cancelled', ['reason' => $this->req->input('reason')]);
        return $this->show();
    }

    /** GET /erp/price?product_id=&customer_id=&price_type= — price + stock helper for the billing screen */
    public function price(): array
    {
        $this->need('sales');
        $p = Db::one('SELECT * FROM products WHERE id = ? AND company_id = ?', [$this->q('product_id'), $this->cid]);
        if (!$p) throw HttpError::notFound();
        $type = $this->q('price_type') ?: (Db::value('SELECT type FROM customers WHERE id = ?', [(int) $this->q('customer_id', 0)]) ?: 'retail');
        $last = $this->q('customer_id') ? Db::value("SELECT i.rate FROM sales_doc_items i JOIN sales_docs s ON s.id = i.doc_id WHERE s.customer_id = ? AND i.product_id = ? AND s.status = 'final' ORDER BY s.id DESC LIMIT 1", [(int) $this->q('customer_id'), $p['id']]) : null;
        return ['rate' => (float) $p[$type . '_price'], 'gst_rate' => (float) $p['gst_rate'], 'last_rate' => $last !== null ? (float) $last : null,
                'stock' => (float) Db::value('SELECT COALESCE(SUM(qty),0) FROM stock_ledger WHERE product_id = ?', [$p['id']])];
    }
}
