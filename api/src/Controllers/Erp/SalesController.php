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
        $s = Db::one('SELECT s.*, COALESCE(c.name, s.customer_name, \'Walk-in\') AS party_name, c.mobile AS party_mobile, c.gstin AS party_gstin, COALESCE(s.billing_address, c.billing_address, c.address, s.customer_address) AS party_address, c.code AS party_code, c.business_name AS party_business,
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
        $s['profile'] = BusinessController::profileOf($this->cid);
        $s['charges'] = json_decode((string) $s['charges'], true) ?: [];
        $s['can_finalise'] = \App\Services\Erp\Perm::can($this->user, 'sales_final', true);
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
        // Walk-in → "save as customer" creates the customer master record right here
        if (!$c && $this->req->input('save_customer') && trim((string) $this->req->input('customer_name'))) {
            $mob = substr(preg_replace('/\D/', '', (string) $this->req->input('customer_mobile')), -10) ?: null;
            if ($mob && ($ex = Db::value('SELECT id FROM customers WHERE company_id = ? AND mobile = ?', [$this->cid, $mob]))) $cust = (int) $ex;
            else {
                $cust = Db::insert('customers', ['company_id' => $this->cid, 'name' => mb_substr(trim($this->req->input('customer_name')), 0, 160), 'mobile' => $mob,
                    'address' => $this->req->input('customer_address') ?: null, 'billing_address' => $this->req->input('customer_address') ?: null,
                    'type' => 'Retail Customer', 'price_type' => 'retail', 'sales_user_id' => $this->uid(),
                    'code' => (string) ((int) Db::value('SELECT COALESCE(MAX(CAST(code AS UNSIGNED)),0) FROM customers WHERE company_id = ?', [$this->cid]) + 1)]);
                Audit::log($this->cid, $this->uid(), 'customer', $cust, 'created', ['from' => 'walk-in bill']);
            }
            $c = Db::one('SELECT * FROM customers WHERE id = ?', [$cust]);
        }
        $priceType = in_array($this->req->input('price_type'), ['retail', 'wholesale', 'contractor'], true) ? $this->req->input('price_type') : ($c['price_type'] ?? 'retail');
        [$lines, $sub, $disc, $tax, $total] = $this->lines((array) $this->req->input('items', []), true, $priceType . '_price');
        // Extra charges printed on the bill: handling, packing, transport (rickshaw / tempo / truck / porter)…
        $charges = [];
        foreach ((array) $this->req->input('charges', []) as $ch) {
            $amt = round((float) ($ch['amount'] ?? 0), 2);
            $label = mb_substr(trim((string) ($ch['label'] ?? '')), 0, 60);
            if ($amt > 0 && $label !== '') $charges[] = ['label' => $label, 'amount' => $amt];
        }
        $chargesTotal = round(array_sum(array_column($charges, 'amount')), 2);
        $total = round($total + $chargesTotal, 2);
        $mode = in_array($this->req->input('payment_mode'), ['cash', 'upi', 'bank', 'card', 'credit'], true) ? $this->req->input('payment_mode') : 'cash';
        // Check stock before saving a bill that is being finalised, so a failed bill doesn't leave a draft behind
        if ($type === 'invoice' && $this->req->input('submit')) \App\Services\Erp\Stock::assertAvailable($this->cid, $this->warehouse($this->req->int('warehouse_id')), $lines);
        $data = ['doc_type' => $type, 'customer_id' => $cust, 'customer_name' => $c ? null : ($this->req->input('customer_name') ?: null),
                 'customer_mobile' => $c ? null : (preg_replace('/\D/', '', (string) $this->req->input('customer_mobile')) ?: null),
                 'price_type' => $priceType, 'warehouse_id' => $this->warehouse($this->req->int('warehouse_id')), 'payment_mode' => $mode,
                 'subtotal' => $sub, 'discount' => $disc, 'tax' => $tax, 'total' => $total, 'max_discount_pct' => max(array_column($lines, 'discount_pct') ?: [0]),
                 'needs_delivery' => $this->req->input('needs_delivery') ? 1 : 0, 'delivery_address' => $this->req->input('delivery_address'), 'notes' => $this->req->input('notes'),
                 'charges' => $charges ? json_encode($charges, JSON_UNESCAPED_UNICODE) : null, 'charges_total' => $chargesTotal,
                 'customer_address' => $c ? null : ($this->req->input('customer_address') ?: null),
                 'billing_address' => $this->req->input('billing_address') ?: ($c ? ($c['billing_address'] ?: $c['address']) : null),
                 'terms' => $this->req->input('terms') ?: null];
        if ($cust && !$data['customer_id']) $data['customer_id'] = $cust;
        if ($cust) { $data['customer_name'] = null; $data['customer_mobile'] = null; }
        Db::tx(function () use (&$id, $data, $lines, $type) {
            if ($id) {
                $old = Db::one('SELECT * FROM sales_docs WHERE id = ? AND company_id = ?', [$id, $this->cid]);
                if (!$old) throw HttpError::notFound();
                if (!in_array($old['status'], ['draft', 'rejected'], true)) throw HttpError::badRequest("This {$old['doc_no']} is already " . str_replace('_', ' ', $old['status']) . ' — it cannot be changed. Make a sales return or a new bill instead.');
                // a changed proforma has to be approved by the customer again
                Db::update('sales_docs', $id, $data + ['status' => 'draft'] + ($old['customer_approval'] === 'approved' && abs((float) $old['total'] - $data['total']) > 0.5 ? ['customer_approval' => 'sent', 'customer_approved_at' => null] : []));
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
        $notice = null;
        if ($this->req->input('submit')) {
            if ($type === 'invoice' && !\App\Services\Erp\Perm::can($this->user, 'sales_final', true)) {
                $notice = 'Saved as a draft. The accountant / manager will check and finalise this bill.';
                foreach (Db::all("SELECT id FROM users WHERE company_id = ? AND is_active = 1 AND (role IN ('owner','manager') OR erp_role_id IN (SELECT id FROM erp_roles WHERE perms LIKE '%sales_final%'))", [$this->cid]) as $u) {
                    \App\Services\Notifier::notify($this->cid, (int) $u['id'], 'approval_needed', 'Bill draft to finalise', ($c['name'] ?? $this->req->input('customer_name') ?? 'Walk-in') . ' · ₹' . number_format($total), null, null);
                }
            } else $this->doSubmit($id, $type);
        }
        $this->req->params['id'] = $id;
        return $this->show() + ['notice' => $notice];
    }

    private function doSubmit(int $id, string $type): void
    {
        $st = Db::value('SELECT status FROM sales_docs WHERE id = ?', [$id]);
        if (!in_array($st, ['draft', 'rejected'], true)) throw HttpError::badRequest('This ' . ($type === 'quotation' ? 'quotation' : 'bill') . ' is already ' . str_replace('_', ' ', $st) . '. Nothing to submit.');
        if ($type === 'quotation') { Db::update('sales_docs', $id, ['status' => 'final']); return; }
        // sales staff only make drafts — finalising a bill needs the "Finalise bills" permission
        if (!\App\Services\Erp\Perm::can($this->user, 'sales_final', true)) {
            throw HttpError::forbidden('Saved as draft. Only the accountant / manager can finalise a bill — they will see it under Sales → Drafts.');
        }
        Docs::submitInvoice($this->cid, $id, $this->user);
    }

    public function submit(): array
    {
        $this->need('sales');
        $s = $this->show();
        $this->doSubmit((int) $s['id'], $s['doc_type']);
        return $this->show();
    }

    /** POST /erp/sales/{id}/share — link for the customer (proforma approval / bill copy + UPI pay) + ready WhatsApp text */
    public function share(): array
    {
        $this->need('sales');
        $s = $this->show();
        if ($s['status'] === 'cancelled') throw HttpError::badRequest('Cancelled');
        $token = $s['share_token'] ?: bin2hex(random_bytes(12));
        $upd = ['share_token' => $token];
        $isBill = $s['doc_type'] === 'invoice' && $s['status'] === 'final';
        if (!$isBill && $s['customer_approval'] === 'none') $upd['customer_approval'] = 'sent';
        Db::update('sales_docs', (int) $s['id'], $upd);
        $base = rtrim((string) ($this->req->input('base') ?: ''), '/');
        $url = $base . '/p/' . $token;
        $p = BusinessController::profileOf($this->cid);
        $due = $isBill ? max(0, (float) $s['total'] - (float) $s['paid_amount']) : (float) $s['total'];
        $kind = $isBill ? 'bill' : ($s['doc_type'] === 'quotation' ? 'quotation' : 'proforma bill');
        $text = "Namaste {$s['party_name']} ji,\n" . ($isBill ? "Your bill {$s['doc_no']} from {$p['display_name']}: ₹" . number_format((float) $s['total'], 2) . ($due > 0.5 ? " (balance ₹" . number_format($due, 2) . ")" : ' — fully paid, thank you!')
                : "Please check your $kind {$s['doc_no']} from {$p['display_name']} for ₹" . number_format((float) $s['total'], 2) . " and tap Approve.")
              . "\nView" . ($isBill && $due > 0.5 && $p['upi_id'] ? ' & pay by UPI' : '') . ": $url\n— {$p['display_name']}" . ($p['phone'] ? ", {$p['phone']}" : '');
        $mob = preg_replace('/\D/', '', (string) ($s['party_mobile'] ?: $s['customer_mobile']));
        Audit::log($this->cid, $this->uid(), 'sales_invoice', (int) $s['id'], 'shared with customer');
        return ['url' => $url, 'text' => $text, 'wa' => 'https://wa.me/' . ($mob ? (strlen($mob) === 10 ? "91$mob" : $mob) : '') . '?text=' . rawurlencode($text)];
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
            'charges' => $q['charges'], 'billing_address' => $q['billing_address'], 'customer_address' => $q['customer_address'], 'terms' => $q['terms'],
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
        $type = $this->q('price_type') ?: (Db::value('SELECT price_type FROM customers WHERE id = ?', [(int) $this->q('customer_id', 0)]) ?: 'retail');
        $last = $this->q('customer_id') ? Db::value("SELECT i.rate FROM sales_doc_items i JOIN sales_docs s ON s.id = i.doc_id WHERE s.customer_id = ? AND i.product_id = ? AND s.status = 'final' ORDER BY s.id DESC LIMIT 1", [(int) $this->q('customer_id'), $p['id']]) : null;
        return ['rate' => (float) $p[$type . '_price'], 'gst_rate' => (float) $p['gst_rate'], 'last_rate' => $last !== null ? (float) $last : null,
                'stock' => (float) Db::value('SELECT COALESCE(SUM(qty),0) FROM stock_ledger WHERE product_id = ?', [$p['id']])];
    }
}
