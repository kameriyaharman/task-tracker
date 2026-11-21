<?php
namespace App\Services\Erp;

use App\Core\{Db, HttpError};

final class Stock
{
    public static function move(int $cid, int $productId, int $warehouseId, float $qty, string $refType, ?int $refId, ?int $by, float $rate = 0, ?string $note = null): void
    {
        if (abs($qty) < 0.0005) return;
        Db::insert('stock_ledger', ['company_id' => $cid, 'product_id' => $productId, 'warehouse_id' => $warehouseId, 'qty' => round($qty, 3),
            'rate' => $rate, 'ref_type' => $refType, 'ref_id' => $refId, 'note' => $note, 'created_by' => $by]);
    }

    public static function balance(int $cid, int $productId, ?int $warehouseId = null): float
    {
        $sql = 'SELECT COALESCE(SUM(qty),0) FROM stock_ledger WHERE company_id = ? AND product_id = ?';
        $p = [$cid, $productId];
        if ($warehouseId) { $sql .= ' AND warehouse_id = ?'; $p[] = $warehouseId; }
        return (float) Db::value($sql, $p);
    }

    /** Throws if any line would take stock below zero in that warehouse. */
    public static function assertAvailable(int $cid, int $warehouseId, array $lines): void
    {
        $need = [];
        foreach ($lines as $l) $need[(int) $l['product_id']] = ($need[(int) $l['product_id']] ?? 0) + (float) $l['qty'];
        foreach ($need as $pid => $q) {
            $have = self::balance($cid, $pid, $warehouseId);
            if ($have + 0.0005 < $q) {
                $name = Db::value('SELECT name FROM products WHERE id = ?', [$pid]);
                throw HttpError::badRequest("Not enough stock for $name: available " . rtrim(rtrim(number_format($have, 3, '.', ''), '0'), '.') . ", needed $q");
            }
        }
    }
}
