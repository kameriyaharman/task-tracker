<?php
namespace App\Controllers\Erp;

use App\Core\{Db, HttpError};
use App\Services\Erp\{Approvals, Perm};

/** Owner business dashboard + ERP reports (JSON or CSV with ?format=csv). */
final class ReportController extends Base
{
    /** GET /erp/meta — everything the UI needs to render forms, filtered by my permissions */
    public function meta(): array
    {
        $erpRole = !empty($this->user['erp_role_id']) ? Db::value('SELECT name FROM erp_roles WHERE id = ?', [$this->user['erp_role_id']]) : null;
        return [
            'perms' => Perm::perms($this->user), 'role' => $this->user['role'], 'erp_role' => $erpRole,
            'warehouses' => Db::all('SELECT id, name, type FROM warehouses WHERE company_id = ? AND is_active = 1 ORDER BY id', [$this->cid]),
            'units' => array_column(Db::all('SELECT name FROM units WHERE company_id = ? AND is_active = 1 ORDER BY id', [$this->cid]), 'name'),
            'categories' => Db::all('SELECT id, name FROM product_categories WHERE company_id = ? AND is_active = 1 ORDER BY name', [$this->cid]),
            'brands' => Db::all('SELECT id, name FROM brands WHERE company_id = ? AND is_active = 1 ORDER BY name', [$this->cid]),
            'erp_roles' => Db::all('SELECT id, name FROM erp_roles WHERE company_id = ? ORDER BY name', [$this->cid]),
            'users' => Db::all('SELECT u.id, u.name, u.role, u.erp_role_id, u.department_id, r.name AS erp_role FROM users u LEFT JOIN erp_roles r ON r.id = u.erp_role_id WHERE u.company_id = ? AND u.is_active = 1 ORDER BY u.name', [$this->cid]),
            'pending_approvals' => count(Approvals::pendingFor($this->user)),
            'doc_labels' => Approvals::DOC_LABELS,
        ];
    }

    /** GET /erp/dashboard — owner/manager business overview */
    public function dashboard(): array
    {
        if ($this->user['role'] === 'employee' && !Perm::can($this->user, 'reports')) throw HttpError::forbidden();
        $c = $this->cid;
        $today = date('Y-m-d'); $m0 = date('Y-m-01');
        $sales = fn(string $from, string $to) => (float) Db::value("SELECT COALESCE(SUM(total),0) FROM sales_docs WHERE company_id = ? AND doc_type = 'invoice' AND status = 'final' AND doc_date BETWEEN ? AND ?", [$c, $from, $to]);
        $receiv = (float) Db::value("SELECT COALESCE(SUM(opening_balance),0) FROM customers WHERE company_id = ?", [$c])
            + (float) Db::value("SELECT COALESCE(SUM(total),0) FROM sales_docs WHERE company_id = ? AND doc_type = 'invoice' AND status = 'final' AND customer_id IS NOT NULL", [$c])
            - (float) Db::value("SELECT COALESCE(SUM(amount),0) FROM payments WHERE company_id = ? AND direction = 'in' AND status = 'approved' AND party_id IS NOT NULL", [$c])
            - (float) Db::value("SELECT COALESCE(SUM(total),0) FROM returns_docs WHERE company_id = ? AND type = 'sales' AND status = 'approved' AND party_id IS NOT NULL", [$c]);
        $payab = (float) Db::value("SELECT COALESCE(SUM(opening_balance),0) FROM vendors WHERE company_id = ?", [$c])
            + (float) Db::value("SELECT COALESCE(SUM(total),0) FROM grns WHERE company_id = ? AND status = 'approved'", [$c])
            - (float) Db::value("SELECT COALESCE(SUM(amount),0) FROM payments WHERE company_id = ? AND direction = 'out' AND status = 'approved'", [$c])
            - (float) Db::value("SELECT COALESCE(SUM(total),0) FROM returns_docs WHERE company_id = ? AND type = 'purchase' AND status = 'approved'", [$c]);
        $cashIn = (float) Db::value("SELECT COALESCE(SUM(CASE WHEN direction='in' THEN amount ELSE -amount END),0) FROM payments WHERE company_id = ? AND status = 'approved' AND mode = 'cash'", [$c]);
        $cashExp = (float) Db::value("SELECT COALESCE(SUM(amount),0) FROM expenses WHERE company_id = ? AND status = 'approved' AND mode = 'cash'", [$c]);
        // Estimated gross profit this month: (sale price after discount − current purchase price) × qty
        $gp = (float) Db::value("SELECT COALESCE(SUM(i.qty * (i.rate * (1 - i.discount_pct/100) - p.purchase_price)),0) FROM sales_doc_items i JOIN sales_docs s ON s.id = i.doc_id JOIN products p ON p.id = i.product_id
                                  WHERE s.company_id = ? AND s.doc_type = 'invoice' AND s.status = 'final' AND s.doc_date >= ?", [$c, $m0]);
        $trend = Db::all("SELECT doc_date AS d, SUM(total) AS total FROM sales_docs WHERE company_id = ? AND doc_type = 'invoice' AND status = 'final' AND doc_date >= CURDATE() - INTERVAL 13 DAY GROUP BY doc_date ORDER BY doc_date", [$c]);
        return [
            'sales_today' => $sales($today, $today), 'sales_month' => $sales($m0, $today),
            'bills_today' => (int) Db::value("SELECT COUNT(*) FROM sales_docs WHERE company_id = ? AND doc_type = 'invoice' AND status = 'final' AND doc_date = ?", [$c, $today]),
            'collection_today' => (float) Db::value("SELECT COALESCE(SUM(amount),0) FROM payments WHERE company_id = ? AND direction = 'in' AND status = 'approved' AND pay_date = ?", [$c, $today]),
            'purchase_month' => (float) Db::value("SELECT COALESCE(SUM(total),0) FROM grns WHERE company_id = ? AND status = 'approved' AND COALESCE(bill_date, DATE(created_at)) >= ?", [$c, $m0]),
            'expense_month' => (float) Db::value("SELECT COALESCE(SUM(amount),0) FROM expenses WHERE company_id = ? AND status = 'approved' AND exp_date >= ?", [$c, $m0]),
            'gross_profit_month' => round($gp, 2),
            'receivable' => round($receiv, 2), 'payable' => round($payab, 2),
            'overdue_receivable' => (float) Db::value("SELECT COALESCE(SUM(total - paid_amount),0) FROM sales_docs WHERE company_id = ? AND doc_type = 'invoice' AND status = 'final' AND due_date < CURDATE() AND customer_id IS NOT NULL", [$c]),
            'cash_in_hand' => round($cashIn - $cashExp, 2),
            'stock_value' => (float) Db::value('SELECT COALESCE(SUM(s.qty * p.purchase_price),0) FROM stock_ledger s JOIN products p ON p.id = s.product_id WHERE s.company_id = ?', [$c]),
            'low_stock' => (int) Db::value('SELECT COUNT(*) FROM (SELECT p.id FROM products p LEFT JOIN stock_ledger s ON s.product_id = p.id WHERE p.company_id = ? AND p.is_active = 1 AND p.min_stock > 0 GROUP BY p.id HAVING COALESCE(SUM(s.qty),0) <= MAX(p.min_stock)) x', [$c]),
            'pending_approvals' => count(Approvals::pendingFor($this->user)),
            'pending_deliveries' => (int) Db::value("SELECT COUNT(*) FROM deliveries WHERE company_id = ? AND status IN ('pending','packed','dispatched')", [$c]),
            'open_pos' => (int) Db::value("SELECT COUNT(*) FROM purchase_orders WHERE company_id = ? AND status IN ('approved','ordered','partial')", [$c]),
            'open_complaints' => (int) Db::value("SELECT COUNT(*) FROM complaints WHERE company_id = ? AND status IN ('open','in_progress')", [$c]),
            'promises_today' => Db::all("SELECT f.promise_amount, c.name, c.mobile FROM recovery_followups f JOIN customers c ON c.id = f.customer_id WHERE f.company_id = ? AND f.outcome = 'promise' AND f.promise_date = ?", [$c, $today]),
            'tally_pending' => (int) Db::value("SELECT COUNT(*) FROM tally_queue WHERE company_id = ? AND status <> 'synced'", [$c]),
            'trend' => $trend,
            'top_products' => Db::all("SELECT p.name, SUM(i.qty) AS qty, SUM(i.amount) AS amount FROM sales_doc_items i JOIN sales_docs s ON s.id = i.doc_id JOIN products p ON p.id = i.product_id
                                        WHERE s.company_id = ? AND s.doc_type = 'invoice' AND s.status = 'final' AND s.doc_date >= ? GROUP BY p.id ORDER BY amount DESC LIMIT 8", [$c, $m0]),
        ];
    }

    /** GET /erp/reports/{type}?from=&to=&format=csv */
    public function report(): ?array
    {
        $type = $this->req->params['type'] ?? '';
        $from = $this->q('from', date('Y-m-01'));
        $to = $this->q('to', date('Y-m-d'));
        $c = $this->cid;
        $need = ['purchase' => 'purchase', 'sales' => 'sales', 'sales_by_product' => 'sales', 'sales_by_customer' => 'sales', 'stock' => 'inventory', 'product_movement' => 'inventory',
                 'recovery' => 'recovery', 'delivery' => 'delivery', 'expenses' => 'expenses', 'gst' => 'accounts', 'employee_performance' => 'reports', 'pending_tasks' => 'reports', 'overdue_tasks' => 'reports'];
        if (!isset($need[$type])) throw HttpError::notFound('Unknown report');
        if (!Perm::can($this->user, $need[$type]) && !Perm::can($this->user, 'reports')) throw HttpError::forbidden();

        switch ($type) {
            case 'purchase':
                $rows = Db::all("SELECT g.grn_no, COALESCE(g.bill_date, DATE(g.created_at)) AS date, v.name AS vendor, g.bill_no, po.po_no, g.subtotal, g.tax, g.total, g.paid_amount, g.total - g.paid_amount AS balance, g.status
                                   FROM grns g JOIN vendors v ON v.id = g.vendor_id LEFT JOIN purchase_orders po ON po.id = g.po_id
                                  WHERE g.company_id = ? AND COALESCE(g.bill_date, DATE(g.created_at)) BETWEEN ? AND ? ORDER BY date, g.id", [$c, $from, $to]);
                break;
            case 'sales':
                $rows = Db::all("SELECT s.doc_no, s.doc_date AS date, COALESCE(cu.name, s.customer_name, 'Walk-in') AS customer, s.price_type, s.payment_mode, s.subtotal, s.discount, s.tax, s.total, s.paid_amount, s.total - s.paid_amount AS balance, u.name AS billed_by
                                   FROM sales_docs s LEFT JOIN customers cu ON cu.id = s.customer_id LEFT JOIN users u ON u.id = s.created_by
                                  WHERE s.company_id = ? AND s.doc_type = 'invoice' AND s.status = 'final' AND s.doc_date BETWEEN ? AND ? ORDER BY s.doc_date, s.id", [$c, $from, $to]);
                break;
            case 'sales_by_product':
                $rows = Db::all("SELECT p.name AS product, p.unit, SUM(i.qty) AS qty, SUM(i.amount) AS amount, SUM(i.qty * (i.rate * (1 - i.discount_pct/100) - p.purchase_price)) AS est_profit
                                   FROM sales_doc_items i JOIN sales_docs s ON s.id = i.doc_id JOIN products p ON p.id = i.product_id
                                  WHERE s.company_id = ? AND s.doc_type = 'invoice' AND s.status = 'final' AND s.doc_date BETWEEN ? AND ? GROUP BY p.id ORDER BY amount DESC", [$c, $from, $to]);
                break;
            case 'sales_by_customer':
                $rows = Db::all("SELECT COALESCE(cu.name, 'Walk-in') AS customer, cu.type, COUNT(*) AS bills, SUM(s.total) AS amount, SUM(s.total - s.paid_amount) AS unpaid
                                   FROM sales_docs s LEFT JOIN customers cu ON cu.id = s.customer_id
                                  WHERE s.company_id = ? AND s.doc_type = 'invoice' AND s.status = 'final' AND s.doc_date BETWEEN ? AND ? GROUP BY s.customer_id ORDER BY amount DESC", [$c, $from, $to]);
                break;
            case 'stock':
                $rows = Db::all('SELECT p.name AS product, p.sku, c.name AS category, p.unit, COALESCE(SUM(s.qty),0) AS qty, p.min_stock, p.purchase_price, COALESCE(SUM(s.qty),0) * p.purchase_price AS value
                                   FROM products p LEFT JOIN stock_ledger s ON s.product_id = p.id LEFT JOIN product_categories c ON c.id = p.category_id
                                  WHERE p.company_id = ? AND p.is_active = 1 GROUP BY p.id ORDER BY p.name', [$c]);
                break;
            case 'product_movement': // fast / slow / dead stock
                $rows = Db::all("SELECT p.name AS product, p.unit, COALESCE((SELECT SUM(qty) FROM stock_ledger s WHERE s.product_id = p.id),0) AS stock,
                                        COALESCE((SELECT SUM(i.qty) FROM sales_doc_items i JOIN sales_docs d ON d.id = i.doc_id WHERE i.product_id = p.id AND d.status = 'final' AND d.doc_type = 'invoice' AND d.doc_date BETWEEN ? AND ?),0) AS sold,
                                        (SELECT MAX(d.doc_date) FROM sales_doc_items i JOIN sales_docs d ON d.id = i.doc_id WHERE i.product_id = p.id AND d.status = 'final' AND d.doc_type = 'invoice') AS last_sold
                                   FROM products p WHERE p.company_id = ? AND p.is_active = 1 ORDER BY sold DESC", [$from, $to, $c]);
                $n = count($rows);
                foreach ($rows as $i => &$r) $r['movement'] = (float) $r['sold'] <= 0 ? ((float) $r['stock'] > 0 ? 'Dead stock' : 'No sale') : ($i < max(1, $n * 0.2) ? 'Fast moving' : ($i >= $n * 0.6 ? 'Slow moving' : 'Normal'));
                unset($r);
                break;
            case 'recovery':
                $rows = Db::all("SELECT p.pay_date AS date, p.pay_no, c.name AS customer, p.amount, p.mode, u.name AS collected_by
                                   FROM payments p JOIN customers c ON c.id = p.party_id LEFT JOIN users u ON u.id = p.created_by
                                  WHERE p.company_id = ? AND p.direction = 'in' AND p.status = 'approved' AND p.invoice_id IS NULL AND p.pay_date BETWEEN ? AND ? ORDER BY p.pay_date", [$c, $from, $to]);
                break;
            case 'delivery':
                $rows = Db::all("SELECT d.delivery_no, DATE(d.created_at) AS date, s.doc_no AS invoice, d.customer_name, d.address, u.name AS delivered_by, d.vehicle, d.status, d.otp_verified, d.delivered_at, d.failure_reason
                                   FROM deliveries d JOIN sales_docs s ON s.id = d.invoice_id LEFT JOIN users u ON u.id = d.assigned_to
                                  WHERE d.company_id = ? AND DATE(d.created_at) BETWEEN ? AND ? ORDER BY d.id", [$c, $from, $to]);
                break;
            case 'expenses':
                $rows = Db::all("SELECT e.exp_date AS date, e.exp_no, e.category, e.paid_to, e.amount, e.mode, e.status, u.name AS by_user FROM expenses e LEFT JOIN users u ON u.id = e.created_by
                                  WHERE e.company_id = ? AND e.exp_date BETWEEN ? AND ? ORDER BY e.exp_date", [$c, $from, $to]);
                break;
            case 'gst':
                $rows = Db::all("SELECT 'Sales' AS side, i.gst_rate, SUM(i.qty * i.rate * (1 - i.discount_pct/100)) AS taxable, SUM(i.amount) - SUM(i.qty * i.rate * (1 - i.discount_pct/100)) AS gst
                                   FROM sales_doc_items i JOIN sales_docs s ON s.id = i.doc_id WHERE s.company_id = ? AND s.doc_type = 'invoice' AND s.status = 'final' AND s.doc_date BETWEEN ? AND ? GROUP BY i.gst_rate
                                 UNION ALL
                                 SELECT 'Purchase', gi.gst_rate, SUM(gi.qty * gi.rate), SUM(gi.amount) - SUM(gi.qty * gi.rate)
                                   FROM grn_items gi JOIN grns g ON g.id = gi.grn_id WHERE g.company_id = ? AND g.status = 'approved' AND COALESCE(g.bill_date, DATE(g.created_at)) BETWEEN ? AND ? GROUP BY gi.gst_rate", [$c, $from, $to, $c, $from, $to]);
                break;
            case 'employee_performance':
                $rows = Db::all("SELECT u.name AS employee, r.name AS erp_role,
                                        SUM(t.status = 'done') AS done, SUM(t.status = 'done' AND (t.due_at IS NULL OR t.completed_at <= t.due_at)) AS on_time,
                                        SUM(t.status IN ('not_started','in_progress','on_hold')) AS open, SUM(t.status IN ('not_started','in_progress','on_hold') AND t.due_at < NOW()) AS overdue,
                                        (SELECT COALESCE(SUM(s.total),0) FROM sales_docs s WHERE s.created_by = u.id AND s.status = 'final' AND s.doc_type = 'invoice' AND s.doc_date BETWEEN ? AND ?) AS sales,
                                        (SELECT COALESCE(SUM(p.amount),0) FROM payments p WHERE p.created_by = u.id AND p.direction = 'in' AND p.invoice_id IS NULL AND p.status = 'approved' AND p.pay_date BETWEEN ? AND ?) AS recovered
                                   FROM users u LEFT JOIN erp_roles r ON r.id = u.erp_role_id LEFT JOIN tasks t ON t.assigned_to = u.id AND DATE(t.created_at) BETWEEN ? AND ?
                                  WHERE u.company_id = ? AND u.is_active = 1 GROUP BY u.id ORDER BY done DESC", [$from, $to, $from, $to, $from, $to, $c]);
                break;
            case 'pending_tasks':
            case 'overdue_tasks':
                $cond = $type === 'overdue_tasks' ? 'AND t.due_at < NOW()' : '';
                $rows = Db::all("SELECT t.id, t.title, u.name AS assignee, b.name AS assigned_by, t.priority, t.status, t.due_at, t.source, t.ref_type, t.ref_id
                                   FROM tasks t JOIN users u ON u.id = t.assigned_to JOIN users b ON b.id = t.assigned_by
                                  WHERE t.company_id = ? AND t.status IN ('not_started','in_progress','on_hold') $cond ORDER BY t.due_at IS NULL, t.due_at", [$c]);
                break;
        }
        if ($this->q('format') === 'csv') {
            header('Content-Type: text/csv; charset=utf-8');
            header('Content-Disposition: attachment; filename="' . $type . '-' . $from . '-to-' . $to . '.csv"');
            $out = fopen('php://output', 'w');
            fwrite($out, "\xEF\xBB\xBF");
            if ($rows) fputcsv($out, array_keys($rows[0]));
            foreach ($rows as $r) fputcsv($out, $r);
            fclose($out);
            return null;
        }
        return ['type' => $type, 'from' => $from, 'to' => $to, 'rows' => $rows];
    }
}
