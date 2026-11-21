<?php
namespace App\Services\Erp;

use App\Core\{Db, HttpError};
use App\Services\Notifier;

/**
 * Business effects of documents: what happens when a document is submitted, approved or rejected.
 * Submitting runs the approval matrix; if no approval is needed the "approved" effect runs at once.
 */
final class Docs
{
    // ───────── dispatch from the approval engine ─────────
    public static function onApproved(string $type, int $id, int $cid, int $by): void
    {
        match ($type) {
            'purchase_order' => self::poApproved($cid, $id, $by),
            'grn' => self::grnApproved($cid, $id, $by),
            'sales_invoice' => self::invoiceFinal($cid, $id, $by),
            'vendor_payment' => self::paymentApproved($cid, $id, $by),
            'expense' => self::expenseApproved($cid, $id, $by),
            'sales_return', 'purchase_return' => self::returnApproved($cid, $id, $by),
            default => null,
        };
    }

    public static function onRejected(string $type, int $id, int $cid, int $by, string $reason): void
    {
        $map = ['purchase_order' => 'purchase_orders', 'grn' => 'grns', 'sales_invoice' => 'sales_docs', 'vendor_payment' => 'payments',
                'expense' => 'expenses', 'sales_return' => 'returns_docs', 'purchase_return' => 'returns_docs'];
        if (isset($map[$type])) Db::exec("UPDATE {$map[$type]} SET status = 'rejected' WHERE id = ? AND company_id = ?", [$id, $cid]);
    }

    // ───────── Purchase ─────────
    public static function submitPo(int $cid, int $id, array $user): string
    {
        $po = Db::one('SELECT p.*, v.name AS vname FROM purchase_orders p JOIN vendors v ON v.id = p.vendor_id WHERE p.id = ? AND p.company_id = ?', [$id, $cid]);
        if (!in_array($po['status'], ['draft', 'rejected'], true)) throw HttpError::badRequest('Only a draft can be submitted');
        $summary = "PO {$po['po_no']} · {$po['vname']} · ₹" . number_format((float) $po['total']);
        if (Approvals::start($cid, 'purchase_order', $id, ['purchase_order' => (float) $po['total']], $summary, (float) $po['total'], $user)) {
            Db::update('purchase_orders', $id, ['status' => 'pending_approval']);
            Workflow::fire($cid, 'purchase_order.created', 'purchase_order', $id, $summary, ['amount' => (float) $po['total'], 'creator_id' => $user['id']]);
            return 'pending_approval';
        }
        Workflow::fire($cid, 'purchase_order.created', 'purchase_order', $id, $summary, ['amount' => (float) $po['total'], 'creator_id' => $user['id']]);
        self::poApproved($cid, $id, (int) $user['id']);
        return 'approved';
    }

    public static function poApproved(int $cid, int $id, int $by): void
    {
        Db::update('purchase_orders', $id, ['status' => 'approved'], $cid);
        $po = Db::one('SELECT p.*, v.name AS vname FROM purchase_orders p JOIN vendors v ON v.id = p.vendor_id WHERE p.id = ?', [$id]);
        Audit::log($cid, $by, 'purchase_order', $id, 'approved');
        Workflow::fire($cid, 'purchase_order.approved', 'purchase_order', $id, "PO {$po['po_no']} · {$po['vname']}", ['amount' => (float) $po['total'], 'creator_id' => (int) $po['created_by']]);
    }

    public static function submitGrn(int $cid, int $id, array $user): string
    {
        $g = Db::one('SELECT g.*, v.name AS vname FROM grns g JOIN vendors v ON v.id = g.vendor_id WHERE g.id = ? AND g.company_id = ?', [$id, $cid]);
        $summary = "GRN {$g['grn_no']} · {$g['vname']} · ₹" . number_format((float) $g['total']);
        Workflow::fire($cid, 'grn.created', 'grn', $id, $summary, ['amount' => (float) $g['total'], 'creator_id' => $user['id']]);
        if (Approvals::start($cid, 'grn', $id, ['grn' => (float) $g['total']], $summary, (float) $g['total'], $user)) return 'pending_approval';
        self::grnApproved($cid, $id, (int) $user['id']);
        return 'approved';
    }

    /** Stock goes up only after the GRN is approved; vendor bill (outstanding) is created. */
    public static function grnApproved(int $cid, int $id, int $by): void
    {
        Db::tx(function () use ($cid, $id, $by) {
            $g = Db::one("SELECT * FROM grns WHERE id = ? AND company_id = ? FOR UPDATE", [$id, $cid]);
            if ($g['status'] === 'approved') return;
            $credit = (int) Db::value('SELECT credit_days FROM vendors WHERE id = ?', [$g['vendor_id']]);
            Db::update('grns', $id, ['status' => 'approved', 'approved_at' => date('Y-m-d H:i:s'),
                'due_date' => date('Y-m-d', strtotime(($g['bill_date'] ?: date('Y-m-d')) . " +$credit days"))]);
            foreach (Db::all('SELECT * FROM grn_items WHERE grn_id = ?', [$id]) as $it) {
                Stock::move($cid, (int) $it['product_id'], (int) $g['warehouse_id'], (float) $it['qty'], 'grn', $id, $by, (float) $it['rate'], $g['grn_no']);
                if ($it['po_item_id']) Db::exec('UPDATE purchase_order_items SET received_qty = received_qty + ? WHERE id = ?', [(float) $it['qty'] + (float) $it['damaged_qty'], $it['po_item_id']]);
                Db::exec('UPDATE products SET purchase_price = ? WHERE id = ? AND ? > 0', [$it['rate'], $it['product_id'], $it['rate']]);
            }
            if ($g['po_id']) {
                $left = (float) Db::value('SELECT COALESCE(SUM(GREATEST(qty - received_qty, 0)),0) FROM purchase_order_items WHERE po_id = ?', [$g['po_id']]);
                Db::update('purchase_orders', (int) $g['po_id'], ['status' => $left > 0.0005 ? 'partial' : 'received']);
            }
            Ledger::reallocate('grns', 'vendor_id', $cid, (int) $g['vendor_id']);
            Audit::log($cid, $by, 'grn', $id, 'stock_in');
            Tally::enqueue($cid, 'grn', $id, 'Purchase');
        });
        $g = Db::one('SELECT g.*, v.name AS vname FROM grns g JOIN vendors v ON v.id = g.vendor_id WHERE g.id = ?', [$id]);
        Workflow::fire($cid, 'grn.approved', 'grn', $id, "GRN {$g['grn_no']} · {$g['vname']}", ['amount' => (float) $g['total'], 'creator_id' => (int) $g['created_by']]);
    }

    // ───────── Sales ─────────
    /** Turns a draft invoice final (or sends it for approval if discount / credit limit needs it). */
    public static function submitInvoice(int $cid, int $id, array $user): string
    {
        $doc = Db::one("SELECT * FROM sales_docs WHERE id = ? AND company_id = ? AND doc_type = 'invoice'", [$id, $cid]);
        if (!in_array($doc['status'], ['draft', 'rejected'], true)) throw HttpError::badRequest('Invoice already submitted');
        $items = Db::all('SELECT * FROM sales_doc_items WHERE doc_id = ?', [$id]);
        Stock::assertAvailable($cid, (int) $doc['warehouse_id'], $items);

        $checks = ['sales_discount' => (float) $doc['max_discount_pct'] > 0 ? (float) $doc['max_discount_pct'] : null];
        if ($doc['payment_mode'] === 'credit') {
            if (!$doc['customer_id']) throw HttpError::badRequest('Credit (udhari) sale needs a saved customer');
            $c = Db::one('SELECT * FROM customers WHERE id = ?', [$doc['customer_id']]);
            $after = Ledger::customerOutstanding($cid, (int) $c['id']) + (float) $doc['total'];
            $over = $after - (float) $c['credit_limit'];
            if ($over > 0.005) $checks['credit_limit'] = $over;
        }
        $party = $doc['customer_id'] ? Db::value('SELECT name FROM customers WHERE id = ?', [$doc['customer_id']]) : ($doc['customer_name'] ?: 'Walk-in');
        $why = [];
        if ($checks['sales_discount']) $why[] = 'discount ' . rtrim(rtrim((string) $doc['max_discount_pct'], '0'), '.') . '%';
        if (isset($checks['credit_limit'])) $why[] = 'over credit limit by ₹' . number_format($checks['credit_limit']);
        $summary = "Invoice {$doc['doc_no']} · $party · ₹" . number_format((float) $doc['total']) . ($why ? ' · ' . implode(', ', $why) : '');
        if (Approvals::start($cid, 'sales_invoice', $id, $checks, $summary, (float) $doc['total'], $user)) {
            Db::update('sales_docs', $id, ['status' => 'pending_approval']);
            return 'pending_approval';
        }
        self::invoiceFinal($cid, $id, (int) $user['id']);
        return 'final';
    }

    public static function invoiceFinal(int $cid, int $id, int $by): void
    {
        $doc = null;
        Db::tx(function () use ($cid, $id, $by, &$doc) {
            $doc = Db::one('SELECT * FROM sales_docs WHERE id = ? AND company_id = ? FOR UPDATE', [$id, $cid]);
            if ($doc['status'] === 'final') return;
            $items = Db::all('SELECT * FROM sales_doc_items WHERE doc_id = ?', [$id]);
            Stock::assertAvailable($cid, (int) $doc['warehouse_id'], $items);
            foreach ($items as $it) Stock::move($cid, (int) $it['product_id'], (int) $doc['warehouse_id'], -(float) $it['qty'], 'sale', $id, $by, (float) $it['rate'], $doc['doc_no']);
            $due = $doc['payment_mode'] === 'credit' && $doc['customer_id']
                ? date('Y-m-d', strtotime($doc['doc_date'] . ' +' . (int) Db::value('SELECT credit_days FROM customers WHERE id = ?', [$doc['customer_id']]) . ' days'))
                : $doc['doc_date'];
            Db::update('sales_docs', $id, ['status' => 'final', 'due_date' => $due]);
            // Paid on the spot → record the receipt now
            if ($doc['payment_mode'] !== 'credit' && (float) $doc['total'] > 0) {
                $payId = Db::insert('payments', ['company_id' => $cid, 'pay_no' => DocNo::next($cid, 'RCT'), 'direction' => 'in', 'party_type' => 'customer',
                    'party_id' => $doc['customer_id'], 'invoice_id' => $id, 'amount' => $doc['total'], 'mode' => $doc['payment_mode'], 'pay_date' => $doc['doc_date'],
                    'status' => 'approved', 'notes' => 'Against ' . $doc['doc_no'], 'created_by' => $by]);
                if ($doc['customer_id']) Ledger::reallocate('sales_docs', 'customer_id', $cid, (int) $doc['customer_id']);
                else Db::update('sales_docs', $id, ['paid_amount' => $doc['total']]);
                Tally::enqueue($cid, 'payment', $payId, 'Receipt');
            } elseif ($doc['customer_id']) {
                Ledger::reallocate('sales_docs', 'customer_id', $cid, (int) $doc['customer_id']);
            }
            if ($doc['source_id']) Db::update('sales_docs', (int) $doc['source_id'], ['status' => 'converted']);
            Audit::log($cid, $by, 'sales_invoice', $id, 'final', ['total' => $doc['total']]);
            Tally::enqueue($cid, 'sales_invoice', $id, 'Sales');
        });
        $party = $doc['customer_id'] ? Db::value('SELECT name FROM customers WHERE id = ?', [$doc['customer_id']]) : ($doc['customer_name'] ?: 'Walk-in');
        $title = "Invoice {$doc['doc_no']} · $party";
        if ($doc['needs_delivery']) self::createDelivery($cid, $id, $by);
        Workflow::fire($cid, 'invoice.final', 'sales_invoice', $id, $title, ['amount' => (float) $doc['total'], 'creator_id' => (int) $doc['created_by']]);
        if ($doc['payment_mode'] === 'credit') Workflow::fire($cid, 'invoice.credit', 'sales_invoice', $id, $title, ['amount' => (float) $doc['total'], 'creator_id' => (int) $doc['created_by']]);
    }

    public static function createDelivery(int $cid, int $invoiceId, int $by, ?int $assignTo = null): int
    {
        $doc = Db::one('SELECT s.*, c.name AS cname, c.mobile AS cmobile, c.address AS caddr FROM sales_docs s LEFT JOIN customers c ON c.id = s.customer_id WHERE s.id = ?', [$invoiceId]);
        $existing = Db::value("SELECT id FROM deliveries WHERE invoice_id = ? AND status NOT IN ('cancelled','failed') LIMIT 1", [$invoiceId]);
        if ($existing) return (int) $existing;
        $id = Db::insert('deliveries', ['company_id' => $cid, 'delivery_no' => DocNo::next($cid, 'DL'), 'invoice_id' => $invoiceId,
            'customer_name' => $doc['cname'] ?: $doc['customer_name'], 'customer_mobile' => $doc['cmobile'] ?: $doc['customer_mobile'],
            'address' => $doc['delivery_address'] ?: $doc['caddr'], 'assigned_to' => $assignTo, 'otp_code' => (string) random_int(1000, 9999), 'created_by' => $by]);
        Audit::log($cid, $by, 'delivery', $id, 'created');
        Workflow::fire($cid, 'delivery.created', 'delivery', $id, 'Delivery for ' . $doc['doc_no'] . ' · ' . ($doc['cname'] ?: $doc['customer_name']), ['amount' => (float) $doc['total'], 'creator_id' => $by]);
        return $id;
    }

    // ───────── Money ─────────
    public static function submitVendorPayment(int $cid, int $id, array $user): string
    {
        $p = Db::one('SELECT p.*, v.name AS vname FROM payments p JOIN vendors v ON v.id = p.party_id WHERE p.id = ?', [$id]);
        $summary = "Pay {$p['vname']} ₹" . number_format((float) $p['amount']) . " ({$p['mode']})";
        if (Approvals::start($cid, 'vendor_payment', $id, ['vendor_payment' => (float) $p['amount']], $summary, (float) $p['amount'], $user)) {
            Db::update('payments', $id, ['status' => 'pending_approval']);
            return 'pending_approval';
        }
        self::paymentApproved($cid, $id, (int) $user['id']);
        return 'approved';
    }

    public static function paymentApproved(int $cid, int $id, int $by): void
    {
        Db::update('payments', $id, ['status' => 'approved'], $cid);
        $p = Db::one('SELECT * FROM payments WHERE id = ?', [$id]);
        if ($p['party_type'] === 'vendor') Ledger::reallocate('grns', 'vendor_id', $cid, (int) $p['party_id']);
        elseif ($p['party_id']) Ledger::reallocate('sales_docs', 'customer_id', $cid, (int) $p['party_id']);
        Audit::log($cid, $by, 'payment', $id, 'approved', ['amount' => $p['amount']]);
        Tally::enqueue($cid, 'payment', $id, $p['direction'] === 'in' ? 'Receipt' : 'Payment');
    }

    public static function submitExpense(int $cid, int $id, array $user): string
    {
        $e = Db::one('SELECT * FROM expenses WHERE id = ?', [$id]);
        $summary = "Expense {$e['category']} ₹" . number_format((float) $e['amount']) . ($e['paid_to'] ? " · {$e['paid_to']}" : '');
        if (Approvals::start($cid, 'expense', $id, ['expense' => (float) $e['amount']], $summary, (float) $e['amount'], $user)) return 'pending_approval';
        self::expenseApproved($cid, $id, (int) $user['id']);
        return 'approved';
    }

    public static function expenseApproved(int $cid, int $id, int $by): void
    {
        Db::update('expenses', $id, ['status' => 'approved'], $cid);
        $e = Db::one('SELECT * FROM expenses WHERE id = ?', [$id]);
        Audit::log($cid, $by, 'expense', $id, 'approved');
        Tally::enqueue($cid, 'expense', $id, 'Payment');
        Workflow::fire($cid, 'expense.approved', 'expense', $id, "Expense {$e['exp_no']} · {$e['category']}", ['amount' => (float) $e['amount'], 'creator_id' => (int) $e['created_by']]);
    }

    // ───────── Returns ─────────
    public static function submitReturn(int $cid, int $id, array $user): string
    {
        $r = Db::one('SELECT * FROM returns_docs WHERE id = ?', [$id]);
        $type = $r['type'] === 'sales' ? 'sales_return' : 'purchase_return';
        $summary = ($r['type'] === 'sales' ? 'Sales' : 'Purchase') . " return {$r['return_no']} · ₹" . number_format((float) $r['total']) . ($r['reason'] ? " · {$r['reason']}" : '');
        if (Approvals::start($cid, $type, $id, [$type => (float) $r['total']], $summary, (float) $r['total'], $user)) return 'pending_approval';
        self::returnApproved($cid, $id, (int) $user['id']);
        return 'approved';
    }

    public static function returnApproved(int $cid, int $id, int $by): void
    {
        Db::tx(function () use ($cid, $id, $by) {
            $r = Db::one('SELECT * FROM returns_docs WHERE id = ? AND company_id = ? FOR UPDATE', [$id, $cid]);
            if ($r['status'] === 'approved') return;
            $items = Db::all('SELECT * FROM return_items WHERE return_id = ?', [$id]);
            if ($r['type'] === 'purchase') Stock::assertAvailable($cid, (int) $r['warehouse_id'], $items);
            foreach ($items as $it) {
                $q = (float) $it['qty'];
                if ($r['type'] === 'sales') {
                    if ($it['restock']) Stock::move($cid, (int) $it['product_id'], (int) $r['warehouse_id'], $q, 'sales_return', $id, $by, (float) $it['rate'], $r['return_no']);
                    if ($it['ref_item_id']) Db::exec('UPDATE sales_doc_items SET returned_qty = returned_qty + ? WHERE id = ?', [$q, $it['ref_item_id']]);
                } else {
                    Stock::move($cid, (int) $it['product_id'], (int) $r['warehouse_id'], -$q, 'purchase_return', $id, $by, (float) $it['rate'], $r['return_no']);
                }
            }
            Db::update('returns_docs', $id, ['status' => 'approved']);
            if ($r['party_id']) {
                if ($r['type'] === 'sales') Ledger::reallocate('sales_docs', 'customer_id', $cid, (int) $r['party_id']);
                else Ledger::reallocate('grns', 'vendor_id', $cid, (int) $r['party_id']);
            }
            Audit::log($cid, $by, 'return', $id, 'approved');
            Tally::enqueue($cid, 'return', $id, $r['type'] === 'sales' ? 'Credit Note' : 'Debit Note');
        });
        $r = Db::one('SELECT * FROM returns_docs WHERE id = ?', [$id]);
        Workflow::fire($cid, 'return.approved', 'return', $id, ucfirst($r['type']) . " return {$r['return_no']}", ['amount' => (float) $r['total'], 'creator_id' => (int) $r['created_by']]);
    }

    // ───────── Recovery ─────────
    /** Payment promise → automatic follow-up task on the promised date. */
    public static function promiseTask(int $cid, int $followupId, int $by): ?int
    {
        $f = Db::one('SELECT f.*, c.name AS cname, c.mobile FROM recovery_followups f JOIN customers c ON c.id = f.customer_id WHERE f.id = ?', [$followupId]);
        if (!$f['promise_date']) return null;
        $assignee = (int) ($f['assigned_to'] ?: $by);
        $tid = Db::insert('tasks', ['company_id' => $cid, 'title' => mb_substr("Collect ₹" . number_format((float) $f['promise_amount']) . " from {$f['cname']} (promised)", 0, 200),
            'description' => trim("Customer promised payment on " . date('j M', strtotime($f['promise_date'])) . ". Mobile: {$f['mobile']}. " . $f['note']),
            'assigned_to' => $assignee, 'assigned_by' => $by, 'priority' => 'high', 'due_at' => $f['promise_date'] . ' 18:00:00', 'remind_before_min' => 240,
            'source' => 'erp', 'ref_type' => 'customer', 'ref_id' => $f['customer_id']]);
        Db::update('recovery_followups', $followupId, ['task_id' => $tid]);
        if ($assignee !== $by) Notifier::notify($cid, $assignee, 'task_assigned', 'Recovery follow-up: ' . $f['cname'], null, 'task', $tid);
        Workflow::fire($cid, 'payment.promise', 'customer', (int) $f['customer_id'], 'Payment promise · ' . $f['cname'], ['amount' => (float) $f['promise_amount'], 'creator_id' => $by]);
        return $tid;
    }
}
