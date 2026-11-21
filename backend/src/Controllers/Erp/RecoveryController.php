<?php
namespace App\Controllers\Erp;

use App\Core\{Db, HttpError};
use App\Services\Erp\{Docs, Ledger};
use App\Services\Notifier;

/** Udhari recovery: follow-ups, payment promises (auto task), disputes, escalation. */
final class RecoveryController extends Base
{
    /** GET /erp/recovery?customer_id= — follow-up history */
    public function index(): array
    {
        $this->need('recovery');
        $where = ['f.company_id = ?']; $p = [$this->cid];
        if ($c = $this->q('customer_id')) { $where[] = 'f.customer_id = ?'; $p[] = (int) $c; }
        if ($this->q('mine')) { $where[] = 'f.assigned_to = ?'; $p[] = $this->uid(); }
        if ($this->q('promises')) { $where[] = "f.outcome = 'promise' AND f.promise_date >= CURDATE() - INTERVAL 7 DAY"; }
        return Db::all('SELECT f.*, c.name AS customer_name, c.mobile, u.name AS by_name, a.name AS assigned_name FROM recovery_followups f
                          JOIN customers c ON c.id = f.customer_id LEFT JOIN users u ON u.id = f.created_by LEFT JOIN users a ON a.id = f.assigned_to
                         WHERE ' . implode(' AND ', $where) . ' ORDER BY f.id DESC LIMIT 500', $p);
    }

    /** GET /erp/recovery/my — customers assigned to me with dues (for the app) */
    public function mine(): array
    {
        $this->need('recovery');
        $where = $this->user['role'] === 'employee' ? 'AND (c.recovery_user_id = ? OR c.recovery_user_id IS NULL)' : '';
        $p = $this->user['role'] === 'employee' ? [$this->cid, $this->uid()] : [$this->cid];
        $out = [];
        foreach (Db::all("SELECT c.* FROM customers c WHERE c.company_id = ? AND c.is_active = 1 $where", $p) as $c) {
            $bal = Ledger::customerOutstanding($this->cid, (int) $c['id']);
            if ($bal < 0.5) continue;
            $c['outstanding'] = $bal;
            $c['oldest_due'] = Db::value("SELECT MIN(due_date) FROM sales_docs WHERE customer_id = ? AND doc_type = 'invoice' AND status = 'final' AND paid_amount < total", [$c['id']]);
            $c['last_followup'] = Db::one('SELECT outcome, promise_date, promise_amount, note, created_at FROM recovery_followups WHERE customer_id = ? ORDER BY id DESC LIMIT 1', [$c['id']]);
            $out[] = $c;
        }
        usort($out, fn($a, $b) => strcmp((string) $a['oldest_due'], (string) $b['oldest_due']) ?: $b['outstanding'] <=> $a['outstanding']);
        return $out;
    }

    /** POST /erp/recovery {customer_id, outcome, promise_date?, promise_amount?, note, assigned_to?} */
    public function store(): array
    {
        $this->need('recovery', true);
        $in = $this->req->require(['customer_id', 'outcome']);
        $c = Db::one('SELECT * FROM customers WHERE id = ? AND company_id = ?', [(int) $in['customer_id'], $this->cid]);
        if (!$c) throw HttpError::badRequest('Unknown customer');
        $outcome = in_array($in['outcome'], ['called', 'promise', 'dispute', 'no_response', 'note'], true) ? $in['outcome'] : 'note';
        if ($outcome === 'promise' && !$this->req->input('promise_date')) throw HttpError::badRequest('Promise date is required');
        $assign = $this->req->int('assigned_to') ?: ((int) $c['recovery_user_id'] ?: $this->uid());
        $id = Db::insert('recovery_followups', ['company_id' => $this->cid, 'customer_id' => $c['id'], 'assigned_to' => $assign, 'outcome' => $outcome,
            'promise_date' => $outcome === 'promise' ? $this->req->input('promise_date') : null,
            'promise_amount' => $outcome === 'promise' ? (float) $this->req->input('promise_amount', 0) : null,
            'note' => $this->req->input('note'), 'created_by' => $this->uid()]);
        if ($outcome === 'promise') Docs::promiseTask($this->cid, $id, $this->uid());
        // Dispute / no response → managers are told (escalation to manager → boss review)
        if (in_array($outcome, ['dispute', 'no_response'], true)) {
            foreach (Db::all("SELECT id FROM users WHERE company_id = ? AND role IN ('manager','owner') AND is_active = 1 AND id <> ?", [$this->cid, $this->uid()]) as $u) {
                Notifier::notify($this->cid, (int) $u['id'], 'recovery_' . $outcome, ($outcome === 'dispute' ? 'Payment dispute: ' : 'No response: ') . $c['name'],
                    '₹' . number_format(Ledger::customerOutstanding($this->cid, (int) $c['id'])) . ' due · ' . $this->req->input('note'), 'customer', (int) $c['id']);
            }
        }
        return Db::one('SELECT * FROM recovery_followups WHERE id = ?', [$id]);
    }
}
