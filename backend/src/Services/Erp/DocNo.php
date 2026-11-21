<?php
namespace App\Services\Erp;

use App\Core\Db;

/** Sequential document numbers per financial year: PO/25-26/0001 */
final class DocNo
{
    public static function fy(?string $date = null): string
    {
        $t = $date ? strtotime($date) : time();
        $y = (int) date('Y', $t);
        $start = (int) date('n', $t) >= 4 ? $y : $y - 1;
        return substr((string) $start, 2) . '-' . substr((string) ($start + 1), 2);
    }

    public static function next(int $cid, string $prefix, ?string $date = null): string
    {
        $fy = self::fy($date);
        Db::exec('INSERT INTO doc_counters (company_id, prefix, fy, last_no) VALUES (?, ?, ?, 1)
                  ON DUPLICATE KEY UPDATE last_no = LAST_INSERT_ID(last_no + 1)', [$cid, $prefix, $fy]);
        $n = (int) Db::pdo()->lastInsertId();
        if ($n === 0) $n = 1;
        return sprintf('%s/%s/%04d', $prefix, $fy, $n);
    }
}
