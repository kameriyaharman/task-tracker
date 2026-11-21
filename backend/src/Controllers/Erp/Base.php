<?php
namespace App\Controllers\Erp;

use App\Core\{Controller, Db, HttpError};
use App\Services\Erp\Perm;

abstract class Base extends Controller
{
    protected function need(string $module, bool $write = false): void { Perm::need($this->user, $module, $write); }

    protected function num($v): float { return round((float) ($v ?? 0), 3); }

    /** Page query helpers */
    protected function q(string $k, $d = null) { $v = $this->req->query[$k] ?? $d; return $v === '' ? $d : $v; }

    /**
     * Normalise item lines [{product_id, qty, rate, gst_rate?, discount_pct?}] and compute totals.
     * Rates are GST-exclusive. Returns [lines, subtotal, discount, tax, total(rounded)].
     */
    protected function lines(array $raw, bool $withDiscount = false, string $priceCol = 'purchase_price'): array
    {
        $out = []; $sub = 0; $disc = 0; $tax = 0;
        foreach ($raw as $l) {
            $pid = (int) ($l['product_id'] ?? 0);
            $qty = $this->num($l['qty'] ?? 0);
            if (!$pid || $qty <= 0) continue;
            $p = Db::one('SELECT * FROM products WHERE id = ? AND company_id = ?', [$pid, $this->cid]);
            if (!$p) throw HttpError::badRequest('Unknown product');
            $rate = isset($l['rate']) && $l['rate'] !== '' ? round((float) $l['rate'], 2) : (float) $p[$priceCol];
            $gst = isset($l['gst_rate']) && $l['gst_rate'] !== '' ? (float) $l['gst_rate'] : (float) $p['gst_rate'];
            $dp = $withDiscount ? max(0, min(100, (float) ($l['discount_pct'] ?? 0))) : 0;
            $gross = $qty * $rate;
            $d = round($gross * $dp / 100, 2);
            $taxable = $gross - $d;
            $t = round($taxable * $gst / 100, 2);
            $out[] = ['product_id' => $pid, 'qty' => $qty, 'rate' => $rate, 'gst_rate' => $gst, 'discount_pct' => $dp,
                      'amount' => round($taxable + $t, 2), 'ref_item_id' => $l['ref_item_id'] ?? null, 'damaged_qty' => $this->num($l['damaged_qty'] ?? 0),
                      'restock' => isset($l['restock']) ? (int) (bool) $l['restock'] : 1, 'po_item_id' => $l['po_item_id'] ?? null];
            $sub += $gross; $disc += $d; $tax += $t;
        }
        if (!$out) throw HttpError::badRequest('Add at least one item');
        $exact = $sub - $disc + $tax;
        return [$out, round($sub, 2), round($disc, 2), round($tax, 2), round($exact)];
    }

    protected function items(string $table, string $fk, int $id): array
    {
        return Db::all("SELECT i.*, p.name AS product_name, p.unit, p.sku, p.hsn FROM $table i JOIN products p ON p.id = i.product_id WHERE i.$fk = ? ORDER BY i.id", [$id]);
    }

    protected function warehouse(?int $id): int
    {
        if ($id && Db::value('SELECT 1 FROM warehouses WHERE id = ? AND company_id = ?', [$id, $this->cid])) return $id;
        $def = Db::value("SELECT id FROM warehouses WHERE company_id = ? AND is_active = 1 ORDER BY type = 'showroom' DESC, id LIMIT 1", [$this->cid]);
        if (!$def) throw HttpError::badRequest('Create a warehouse first');
        return (int) $def;
    }

    protected function files(string $entity, int $id): array
    {
        return Db::all('SELECT id, kind, file_name, mime, created_at FROM attachments WHERE company_id = ? AND entity_type = ? AND entity_id = ? ORDER BY id', [$this->cid, $entity, $id]);
    }
}
