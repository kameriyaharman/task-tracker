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

    /** Re-derive paid_amount for every bill of a party (after a reversal). */
    public static function reallocate(string $table, string $partyCol, int $cid, int $partyId): void
    {
        Db::exec("UPDATE $table SET paid_amount = 0 WHERE company_id = ? AND $partyCol = ?", [$cid, $partyId]);
        if ($table === 'sales_docs') {
            $paid = (float) Db::value("SELECT COALESCE(SUM(amount),0) FROM payments WHERE company_id = ? AND party_type = 'customer' AND party_id = ? AND direction = 'in' AND status = 'approved'", [$cid, $partyId])
                  + (float) Db::value("SELECT COALESCE(SUM(total),0) FROM returns_docs WHERE company_id = ? AND type = 'sales' AND party_id = ? AND status = 'approved'", [$cid, $partyId]);
        } else {
            $paid = (float) Db::value("SELECT COALESCE(SUM(amount),0) FROM payments WHERE company_id = ? AND party_type = 'vendor' AND party_id = ? AND direction = 'out' AND status = 'approved'", [$cid, $partyId])
                  + (float) Db::value("SELECT COALESCE(SUM(total),0) FROM returns_docs WHERE company_id = ? AND type = 'purchase' AND party_id = ? AND status = 'approved'", [$cid, $partyId]);
        }
        // Old dues (opening balance) are settled first, then bills oldest-first
        $opening = (float) Db::value('SELECT opening_balance FROM ' . ($table === 'sales_docs' ? 'customers' : 'vendors') . ' WHERE id = ?', [$partyId]);
        self::allocate($table, $partyCol, $cid, $partyId, $paid - max(0, $opening));
    }
}
