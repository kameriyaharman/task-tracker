<?php
namespace App\Services\Erp;

use App\Core\Db;

/**
 * Outstanding balances.
 * Customer owes = opening + Σ final credit invoices − Σ receipts − Σ approved sales returns (credited).
 * Receipts are allocated FIFO to the oldest unpaid invoice (sales_docs.paid_amount) so aging is per bill.
 */
final class Ledger
{
    public static function customerOutstanding(int $cid, int $customerId): float
    {
        $c = Db::one('SELECT opening_balance FROM customers WHERE id = ? AND company_id = ?', [$customerId, $cid]);
        if (!$c) return 0;
        $inv = (float) Db::value("SELECT COALESCE(SUM(total),0) FROM sales_docs WHERE company_id = ? AND customer_id = ? AND doc_type = 'invoice' AND status = 'final'", [$cid, $customerId]);
        $paid = (float) Db::value("SELECT COALESCE(SUM(amount),0) FROM payments WHERE company_id = ? AND party_type = 'customer' AND party_id = ? AND direction = 'in' AND status = 'approved'", [$cid, $customerId]);
        $ret = (float) Db::value("SELECT COALESCE(SUM(total),0) FROM returns_docs WHERE company_id = ? AND type = 'sales' AND party_id = ? AND status = 'approved'", [$cid, $customerId]);
        return round((float) $c['opening_balance'] + $inv - $paid - $ret, 2);
    }

    public static function vendorOutstanding(int $cid, int $vendorId): float
    {
        $v = Db::one('SELECT opening_balance FROM vendors WHERE id = ? AND company_id = ?', [$vendorId, $cid]);
        if (!$v) return 0;
        $bills = (float) Db::value("SELECT COALESCE(SUM(total),0) FROM grns WHERE company_id = ? AND vendor_id = ? AND status = 'approved'", [$cid, $vendorId]);
        $paid = (float) Db::value("SELECT COALESCE(SUM(amount),0) FROM payments WHERE company_id = ? AND party_type = 'vendor' AND party_id = ? AND direction = 'out' AND status = 'approved'", [$cid, $vendorId]);
        $ret = (float) Db::value("SELECT COALESCE(SUM(total),0) FROM returns_docs WHERE company_id = ? AND type = 'purchase' AND party_id = ? AND status = 'approved'", [$cid, $vendorId]);
        return round((float) $v['opening_balance'] + $bills - $paid - $ret, 2);
    }

    /** Spread an amount over unpaid bills oldest-first. $table = sales_docs | grns */
    public static function allocate(string $table, string $partyCol, int $cid, int $partyId, float $amount): void
    {
        $where = $table === 'sales_docs' ? "doc_type = 'invoice' AND status = 'final'" : "status = 'approved'";
        $dateCol = $table === 'sales_docs' ? 'doc_date' : 'created_at';
        $rows = Db::all("SELECT id, total, paid_amount FROM $table WHERE company_id = ? AND $partyCol = ? AND $where AND paid_amount < total ORDER BY $dateCol, id", [$cid, $partyId]);
        foreach ($rows as $r) {
            if ($amount <= 0.004) break;
            $take = min($amount, (float) $r['total'] - (float) $r['paid_amount']);
            Db::exec("UPDATE $table SET paid_amount = paid_amount + ? WHERE id = ?", [$take, $r['id']]);
            $amount -= $take;
        }
    }

    /**
     * Re-derive paid_amount for every bill of a party.
     * Payments made against a specific bill go to that bill first; everything else (and any extra) settles
     * old dues (opening balance) and then bills oldest-first.
     */
    public static function reallocate(string $table, string $partyCol, int $cid, int $partyId): void
    {
        Db::exec("UPDATE $table SET paid_amount = 0 WHERE company_id = ? AND $partyCol = ?", [$cid, $partyId]);
        $isSales = $table === 'sales_docs';
        $pays = Db::all('SELECT amount, ' . ($isSales ? 'invoice_id' : 'grn_id') . " AS bill FROM payments WHERE company_id = ? AND party_type = ? AND party_id = ? AND direction = ? AND status = 'approved' ORDER BY id",
            [$cid, $isSales ? 'customer' : 'vendor', $partyId, $isSales ? 'in' : 'out']);
        $pool = (float) Db::value("SELECT COALESCE(SUM(total),0) FROM returns_docs WHERE company_id = ? AND type = ? AND party_id = ? AND status = 'approved'", [$cid, $isSales ? 'sales' : 'purchase', $partyId]);
        $where = $isSales ? "doc_type = 'invoice' AND status = 'final'" : "status = 'approved'";
        foreach ($pays as $p) {
            $amt = (float) $p['amount'];
            if ($p['bill']) {
                $b = Db::one("SELECT id, total, paid_amount FROM $table WHERE id = ? AND company_id = ? AND $partyCol = ? AND $where", [$p['bill'], $cid, $partyId]);
                if ($b) {
                    $take = min($amt, max(0, (float) $b['total'] - (float) $b['paid_amount']));
                    if ($take > 0) Db::exec("UPDATE $table SET paid_amount = paid_amount + ? WHERE id = ?", [$take, $b['id']]);
                    $amt -= $take;
                }
            }
            $pool += $amt;
        }
        // Old dues (opening balance) are settled first, then bills oldest-first
        $opening = (float) Db::value('SELECT opening_balance FROM ' . ($isSales ? 'customers' : 'vendors') . ' WHERE id = ?', [$partyId]);
        self::allocate($table, $partyCol, $cid, $partyId, $pool - max(0, $opening));
    }

    /** Unpaid bills of a party with balance and age (for "against which bill" + aging). */
    public static function openBills(int $cid, string $party, int $partyId): array
    {
        return $party === 'customer'
            ? Db::all("SELECT id, doc_no AS no, doc_date AS dt, due_date, total, paid_amount, ROUND(total - paid_amount, 2) AS due, DATEDIFF(CURDATE(), doc_date) AS age
                         FROM sales_docs WHERE company_id = ? AND customer_id = ? AND doc_type = 'invoice' AND status = 'final' AND paid_amount < total - 0.5 ORDER BY doc_date, id", [$cid, $partyId])
            : Db::all("SELECT g.id, COALESCE(g.bill_no, g.grn_no) AS no, g.grn_no, COALESCE(g.bill_date, DATE(g.created_at)) AS dt, g.due_date, g.total, g.paid_amount, ROUND(g.total - g.paid_amount, 2) AS due,
                              DATEDIFF(CURDATE(), COALESCE(g.bill_date, DATE(g.created_at))) AS age, po.po_no, g.po_id
                         FROM grns g LEFT JOIN purchase_orders po ON po.id = g.po_id WHERE g.company_id = ? AND g.vendor_id = ? AND g.status = 'approved' AND g.paid_amount < g.total - 0.5 ORDER BY dt, g.id", [$cid, $partyId]);
    }
}
