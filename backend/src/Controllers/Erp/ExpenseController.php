<?php
namespace App\Controllers\Erp;

use App\Core\{Db, HttpError};
use App\Services\Erp\{Approvals, Audit, DocNo, Docs};
use App\Services\Upload;

final class ExpenseController extends Base
{
    public const CATEGORIES = ['Transport / freight', 'Labour', 'Fuel', 'Electricity', 'Rent', 'Salary advance', 'Shop maintenance', 'Tea & refreshment', 'Stationery', 'Telephone / internet', 'Other'];

    /** Everyone can see their own expenses; expenses/accounts permission sees all. */
    public function index(): array
    {
        $where = ['e.company_id = ?']; $p = [$this->cid];
        $all = \App\Services\Erp\Perm::can($this->user, 'expenses') || \App\Services\Erp\Perm::can($this->user, 'accounts');
        if (!$all) { $where[] = 'e.created_by = ?'; $p[] = $this->uid(); }
        if ($s = $this->q('status')) { $where[] = 'e.status = ?'; $p[] = $s; }
        if ($c = $this->q('category')) { $where[] = 'e.category = ?'; $p[] = $c; }
        if ($f = $this->q('from')) { $where[] = 'e.exp_date >= ?'; $p[] = $f; }
        if ($t = $this->q('to')) { $where[] = 'e.exp_date <= ?'; $p[] = $t; }
        $rows = Db::all('SELECT e.*, u.name AS created_by_name, (SELECT COUNT(*) FROM attachments a WHERE a.entity_type = \'expense_bill\' AND a.entity_id = e.id) AS bills
                           FROM expenses e LEFT JOIN users u ON u.id = e.created_by WHERE ' . implode(' AND ', $where) . ' ORDER BY e.id DESC LIMIT 1000', $p);
        return ['categories' => self::CATEGORIES, 'items' => $rows];
    }

    /** POST /erp/expenses {exp_date, category, amount, mode, paid_to, notes} + bills[] */
    /** Any employee can submit an expense; it always goes through the approval matrix. */
    public function store(): array
    {
        $in = $this->req->require(['category', 'amount']);
        $amt = round((float) $in['amount'], 2);
        if ($amt <= 0) throw HttpError::badRequest('Amount must be more than zero');
        $id = Db::insert('expenses', ['company_id' => $this->cid, 'exp_no' => DocNo::next($this->cid, 'EXP'), 'exp_date' => $this->req->input('exp_date') ?: date('Y-m-d'),
            'category' => mb_substr($in['category'], 0, 60), 'amount' => $amt, 'mode' => in_array($this->req->input('mode'), ['cash', 'upi', 'bank', 'card', 'cheque'], true) ? $this->req->input('mode') : 'cash',
            'paid_to' => $this->req->input('paid_to'), 'notes' => $this->req->input('notes'), 'created_by' => $this->uid()]);
        foreach (Upload::list($this->req->files, 'bills') as $f) Upload::save($f, $this->cid, $this->uid(), 'expense_bill', $id);
        Audit::log($this->cid, $this->uid(), 'expense', $id, 'created', ['amount' => $amt]);
        Docs::submitExpense($this->cid, $id, $this->user);
        return Db::one('SELECT * FROM expenses WHERE id = ?', [$id]) + ['approvals' => Approvals::history($this->cid, 'expense', $id), 'files' => $this->files('expense_bill', $id)];
    }
}
