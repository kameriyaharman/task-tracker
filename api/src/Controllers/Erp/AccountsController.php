<?php
namespace App\Controllers\Erp;

use App\Core\{Db, HttpError};
use App\Services\Erp\{Approvals, Audit, DocNo, Docs, Ledger, Tally};

/** Receipts, vendor payments, cash book / bank book, outstanding with aging. */
final class AccountsController extends Base
{
    public function payments(): array
    {
        if (!\App\Services\Erp\Perm::can($this->user, 'accounts') && !\App\Services\Erp\Perm::can($this->user, 'recovery')) $this->need('accounts');
        $where = ['p.company_id = ?']; $pa = [$this->cid];
        if ($d = $this->q('direction')) { $where[] = 'p.direction = ?'; $pa[] = $d; }
        if ($s = $this->q('status')) { $where[] = 'p.status = ?'; $pa[] = $s; }
        if ($m = $this->q('mode')) { $where[] = 'p.mode = ?'; $pa[] = $m; }
        if ($f = $this->q('from')) { $where[] = 'p.pay_date >= ?'; $pa[] = $f; }
        if ($t = $this->q('to')) { $where[] = 'p.pay_date <= ?'; $pa[] = $t; }
        if ($pt = $this->q('party_type')) { $where[] = 'p.party_type = ?'; $pa[] = $pt; }
        if ($pid = $this->q('party_id')) { $where[] = 'p.party_id = ?'; $pa[] = (int) $pid; }
        return Db::all("SELECT p.*, CASE WHEN p.party_type = 'customer' THEN COALESCE(c.name, 'Walk-in') ELSE v.name END AS party_name, u.name AS created_by_name, s.doc_no AS invoice_no, COALESCE(g.bill_no, g.grn_no) AS grn_no, po.po_no
                          FROM payments p LEFT JOIN grns g ON g.id = p.grn_id LEFT JOIN purchase_orders po ON po.id = p.po_id LEFT JOIN customers c ON p.party_type = 'customer' AND c.id = p.party_id LEFT JOIN vendors v ON p.party_type = 'vendor' AND v.id = p.party_id
                          LEFT JOIN users u ON u.id = p.created_by LEFT JOIN sales_docs s ON s.id = p.invoice_id
                         WHERE " . implode(' AND ', $where) . ' ORDER BY p.id DESC LIMIT 1000', $pa);
    }

    /**
     * POST /erp/payments {direction: in|out, party_id, amount, mode, reference, pay_date, notes, followup_id?}
     * in  = customer receipt (accounts or recovery staff) → outstanding updates immediately.
     * out = vendor payment → goes through the approval matrix before it counts.
     */
    public function store(): array
    {
        $in = $this->req->require(['direction', 'party_id', 'amount']);
        $dir = $in['direction'] === 'out' ? 'out' : 'in';
        if ($dir === 'out') $this->need('accounts', true);
        elseif (!\App\Services\Erp\Perm::can($this->user, 'recovery', true)) $this->need('accounts', true);
        $amount = round((float) $in['amount'], 2);
        if ($amount <= 0) throw HttpError::badRequest('Amount must be more than zero');
        $ptype = $dir === 'in' ? 'customer' : 'vendor';
        $table = $dir === 'in' ? 'customers' : 'vendors';
        if (!Db::value("SELECT 1 FROM $table WHERE id = ? AND company_id = ?", [(int) $in['party_id'], $this->cid])) throw HttpError::badRequest('Unknown ' . $ptype);
        $mode = in_array($this->req->input('mode'), ['cash', 'upi', 'bank', 'card', 'cheque'], true) ? $this->req->input('mode') : 'cash';
        // Against which bill: a customer invoice (in) or a vendor bill / GRN (out); part or full payment
        $billId = $this->req->int($dir === 'in' ? 'invoice_id' : 'grn_id') ?: null;
        $settle = in_array($this->req->input('settlement'), ['part', 'full', 'advance', 'on_account'], true) ? $this->req->input('settlement') : ($billId ? 'part' : 'on_account');
        $poId = $this->req->int('po_id') ?: null;
        if ($billId) {
            $bill = $dir === 'in'
                ? Db::one("SELECT doc_no AS no, total - paid_amount AS due FROM sales_docs WHERE id = ? AND company_id = ? AND customer_id = ? AND doc_type = 'invoice' AND status = 'final'", [$billId, $this->cid, (int) $in['party_id']])
                : Db::one("SELECT COALESCE(bill_no, grn_no) AS no, total - paid_amount AS due, po_id FROM grns WHERE id = ? AND company_id = ? AND vendor_id = ? AND status = 'approved'", [$billId, $this->cid, (int) $in['party_id']]);
            if (!$bill) throw HttpError::badRequest('That bill does not belong to this ' . $ptype);
            if ($settle === 'full' && abs($amount - (float) $bill['due']) > 0.5) throw HttpError::badRequest('Full payment of ' . $bill['no'] . ' is ₹' . number_format((float) $bill['due'], 2) . ' — change the amount or choose "Part payment"');
            if ($settle === 'part' && $amount > (float) $bill['due'] + 0.5) throw HttpError::badRequest('Amount is more than the balance of ' . $bill['no'] . ' (₹' . number_format((float) $bill['due'], 2) . ')');
            if ($dir === 'out') $poId = $poId ?: ($bill['po_id'] ? (int) $bill['po_id'] : null);
        }
        if ($dir === 'out' && $poId && !$billId && !Db::value('SELECT 1 FROM purchase_orders WHERE id = ? AND company_id = ? AND vendor_id = ?', [$poId, $this->cid, (int) $in['party_id']])) throw HttpError::badRequest('That PO does not belong to this vendor');
        if ($dir === 'out' && $poId && !$billId) $settle = 'advance';
        $id = Db::insert('payments', ['company_id' => $this->cid, 'pay_no' => DocNo::next($this->cid, $dir === 'in' ? 'RCT' : 'PAY'), 'direction' => $dir, 'party_type' => $ptype,
            'party_id' => (int) $in['party_id'], 'amount' => $amount, 'mode' => $mode, 'reference' => $this->req->input('reference'),
            'pay_date' => $this->req->input('pay_date') ?: date('Y-m-d'), 'status' => $dir === 'in' ? 'approved' : 'pending_approval',
            'notes' => $this->req->input('notes'), 'created_by' => $this->uid(),
            'invoice_id' => $dir === 'in' ? $billId : null, 'grn_id' => $dir === 'out' ? $billId : null, 'po_id' => $dir === 'out' ? $poId : null, 'settlement' => $settle]);
        Audit::log($this->cid, $this->uid(), 'payment', $id, 'created', ['amount' => $amount, 'direction' => $dir, 'against' => $billId, 'settlement' => $settle]);
        if ($dir === 'in') {
            Ledger::reallocate('sales_docs', 'customer_id', $this->cid, (int) $in['party_id']);
            Tally::enqueue($this->cid, 'payment', $id, 'Receipt');
            // Close an open promise follow-up task for this customer
            foreach (Db::all("SELECT t.* FROM tasks t WHERE t.company_id = ? AND t.ref_type = 'customer' AND t.ref_id = ? AND t.status IN ('not_started','in_progress','on_hold')", [$this->cid, (int) $in['party_id']]) as $t) {
                if (Ledger::customerOutstanding($this->cid, (int) $in['party_id']) <= 0.5) \App\Controllers\TaskController::setStatus($t, 'done', $this->uid());
            }
            Db::insert('recovery_followups', ['company_id' => $this->cid, 'customer_id' => (int) $in['party_id'], 'assigned_to' => $this->uid(), 'outcome' => 'paid',
                'promise_amount' => $amount, 'note' => 'Received ₹' . number_format($amount) . " ($mode)", 'created_by' => $this->uid()]);
        } else {
            Docs::submitVendorPayment($this->cid, $id, $this->user);
        }
        return Db::one('SELECT * FROM payments WHERE id = ?', [$id]) + ['approvals' => Approvals::history($this->cid, 'vendor_payment', $id)];
    }

    /** GET /erp/books?book=cash|bank&from=&to= — every money movement with running balance */
    public function book(): array
    {
        $this->need('accounts');
        $book = $this->q('book', 'cash');
        $modes = $book === 'cash' ? ["'cash'"] : ["'upi'", "'bank'", "'card'", "'cheque'"];
        $m = implode(',', $modes);
        $from = $this->q('from', date('Y-m-01'));
        $to = $this->q('to', date('Y-m-d'));
        $sql = "SELECT * FROM (
                  SELECT p.pay_date AS dt, p.pay_no AS no, p.mode, CASE WHEN p.direction = 'in' THEN p.amount ELSE 0 END AS inflow, CASE WHEN p.direction = 'out' THEN p.amount ELSE 0 END AS outflow,
                         CONCAT(IF(p.direction = 'in', 'Receipt · ', 'Payment · '), COALESCE(c.name, v.name, 'Walk-in')) AS particulars, p.id AS ref_id, 'payment' AS ref_type
                    FROM payments p LEFT JOIN customers c ON p.party_type = 'customer' AND c.id = p.party_id LEFT JOIN vendors v ON p.party_type = 'vendor' AND v.id = p.party_id
                   WHERE p.company_id = ? AND p.status = 'approved' AND p.mode IN ($m)
                  UNION ALL
                  SELECT e.exp_date, e.exp_no, e.mode, 0, e.amount, CONCAT('Expense · ', e.category, IF(e.paid_to IS NULL, '', CONCAT(' · ', e.paid_to))), e.id, 'expense'
                    FROM expenses e WHERE e.company_id = ? AND e.status = 'approved' AND e.mode IN ($m)
                ) x";
        $opening = (float) Db::value("SELECT COALESCE(SUM(inflow - outflow),0) FROM ($sql) y WHERE dt < ?", [$this->cid, $this->cid, $from]);
        $rows = Db::all("$sql WHERE dt BETWEEN ? AND ? ORDER BY dt, no", [$this->cid, $this->cid, $from, $to]);
        $bal = $opening;
        foreach ($rows as &$r) { $bal += (float) $r['inflow'] - (float) $r['outflow']; $r['balance'] = round($bal, 2); }
        return ['book' => $book, 'from' => $from, 'to' => $to, 'opening' => round($opening, 2), 'closing' => round($bal, 2),
                'total_in' => round(array_sum(array_column($rows, 'inflow')), 2), 'total_out' => round(array_sum(array_column($rows, 'outflow')), 2), 'rows' => $rows];
    }

    /** GET /erp/outstanding?party=customer|vendor — balances with aging buckets (0-30, 31-60, 61-90, 90+) */
    public function outstanding(): array
    {
        $party = $this->q('party', 'customer');
        if ($party === 'vendor') $this->need('accounts'); elseif (!\App\Services\Erp\Perm::can($this->user, 'recovery')) $this->need('accounts');
        $out = [];
        if ($party === 'customer') {
            $bills = Db::all("SELECT customer_id AS pid, total - paid_amount AS due, DATEDIFF(CURDATE(), COALESCE(due_date, doc_date)) AS age, doc_date FROM sales_docs
                               WHERE company_id = ? AND doc_type = 'invoice' AND status = 'final' AND customer_id IS NOT NULL AND paid_amount < total", [$this->cid]);
            $parties = Db::all('SELECT c.id, c.code, c.name, c.business_name, c.mobile, c.type, c.credit_limit, c.opening_balance, c.recovery_user_id, u.name AS recovery_user FROM customers c LEFT JOIN users u ON u.id = c.recovery_user_id WHERE c.company_id = ?', [$this->cid]);
        } else {
            $bills = Db::all("SELECT vendor_id AS pid, total - paid_amount AS due, DATEDIFF(CURDATE(), COALESCE(due_date, bill_date)) AS age, bill_date FROM grns
                               WHERE company_id = ? AND status = 'approved' AND paid_amount < total", [$this->cid]);
            $parties = Db::all('SELECT id, code, name, business_name, mobile, opening_balance FROM vendors WHERE company_id = ?', [$this->cid]);
        }
        $by = [];
        foreach ($bills as $b) $by[$b['pid']][] = $b;
        foreach ($parties as $p) {
            $bal = $party === 'customer' ? Ledger::customerOutstanding($this->cid, (int) $p['id']) : Ledger::vendorOutstanding($this->cid, (int) $p['id']);
            if (abs($bal) < 0.5) continue;
            $buckets = ['b0_7' => 0, 'b8_30' => 0, 'b0_30' => 0, 'b31_60' => 0, 'b61_90' => 0, 'b90' => 0];
            $billSum = 0; $oldest = 0;
            foreach ($by[$p['id']] ?? [] as $b) {
                $a = (int) $b['age']; $due = (float) $b['due']; $billSum += $due; $oldest = max($oldest, $a);
                $k = $a <= 30 ? 'b0_30' : ($a <= 60 ? 'b31_60' : ($a <= 90 ? 'b61_90' : 'b90'));
                $buckets[$k] += $due;
                if ($a <= 30) $buckets[$a <= 7 ? 'b0_7' : 'b8_30'] += $due;
            }
            $buckets['b90'] += max(0, $bal - $billSum); // unallocated old dues (opening balance)
            $buckets['oldest_days'] = $bal - $billSum > 0.5 ? max($oldest, 91) : $oldest;
            $buckets['bills'] = count($by[$p['id']] ?? []);
            $overdue = $party === 'customer' ? (float) Db::value("SELECT COALESCE(SUM(total - paid_amount),0) FROM sales_docs WHERE customer_id = ? AND doc_type = 'invoice' AND status = 'final' AND due_date < CURDATE()", [$p['id']]) : 0;
            $row = $p + ['outstanding' => $bal, 'overdue' => $overdue] + array_map(fn($v) => round($v, 2), $buckets);
            if ($party === 'customer') {
                $row['last_followup'] = Db::one('SELECT outcome, promise_date, promise_amount, note, created_at FROM recovery_followups WHERE customer_id = ? ORDER BY id DESC LIMIT 1', [$p['id']]);
            }
            $out[] = $row;
        }
        usort($out, fn($a, $b) => $b['outstanding'] <=> $a['outstanding']);
        return $out;
    }

    /** GET /erp/open-bills?party=customer|vendor&id= — unpaid bills with balance & age, plus open POs (vendor advance) */
    public function openBills(): array
    {
        $party = $this->q('party', 'customer') === 'vendor' ? 'vendor' : 'customer';
        if ($party === 'vendor') $this->need('accounts'); elseif (!\App\Services\Erp\Perm::can($this->user, 'recovery')) $this->need('accounts');
        $id = (int) $this->q('id');
        $out = ['bills' => Ledger::openBills($this->cid, $party, $id),
                'outstanding' => $party === 'customer' ? Ledger::customerOutstanding($this->cid, $id) : Ledger::vendorOutstanding($this->cid, $id)];
        if ($party === 'vendor') $out['pos'] = Db::all("SELECT id, po_no, total, status, created_at FROM purchase_orders WHERE company_id = ? AND vendor_id = ? AND status IN ('approved','ordered','partial') ORDER BY id DESC LIMIT 20", [$this->cid, $id]);
        return $out;
    }

    /** GET /erp/statement?party=customer|vendor&id= — party ledger */
    public function statement(): array
    {
        $party = $this->q('party', 'customer');
        $id = (int) $this->q('id');
        if ($party === 'vendor') $this->need('accounts'); elseif (!\App\Services\Erp\Perm::can($this->user, 'recovery')) $this->need('accounts');
        if ($party === 'customer') {
            $p = Db::one('SELECT * FROM customers WHERE id = ? AND company_id = ?', [$id, $this->cid]);
            $rows = Db::all("SELECT doc_date AS dt, doc_no AS no, 'Invoice' AS kind, total AS debit, 0 AS credit FROM sales_docs WHERE customer_id = ? AND doc_type = 'invoice' AND status = 'final'
                             UNION ALL SELECT pay_date, pay_no, CONCAT('Receipt (', mode, ')'), 0, amount FROM payments WHERE party_type = 'customer' AND party_id = ? AND direction = 'in' AND status = 'approved'
                             UNION ALL SELECT DATE(created_at), return_no, 'Sales return', 0, total FROM returns_docs WHERE type = 'sales' AND party_id = ? AND status = 'approved'
                             ORDER BY dt, no", [$id, $id, $id]);
        } else {
            $p = Db::one('SELECT * FROM vendors WHERE id = ? AND company_id = ?', [$id, $this->cid]);
            $rows = Db::all("SELECT COALESCE(bill_date, DATE(created_at)) AS dt, COALESCE(bill_no, grn_no) AS no, 'Purchase bill' AS kind, 0 AS debit, total AS credit FROM grns WHERE vendor_id = ? AND status = 'approved'
                             UNION ALL SELECT pay_date, pay_no, CONCAT('Payment (', mode, ')'), amount, 0 FROM payments WHERE party_type = 'vendor' AND party_id = ? AND direction = 'out' AND status = 'approved'
                             UNION ALL SELECT DATE(created_at), return_no, 'Purchase return', total, 0 FROM returns_docs WHERE type = 'purchase' AND party_id = ? AND status = 'approved'
                             ORDER BY dt, no", [$id, $id, $id]);
        }
        if (!$p) throw HttpError::notFound();
        $bal = (float) $p['opening_balance'];
        foreach ($rows as &$r) {
            $bal += $party === 'customer' ? (float) $r['debit'] - (float) $r['credit'] : (float) $r['credit'] - (float) $r['debit'];
            $r['balance'] = round($bal, 2);
        }
        return ['party' => $p, 'opening' => (float) $p['opening_balance'], 'closing' => round($bal, 2), 'rows' => $rows];
    }
}
