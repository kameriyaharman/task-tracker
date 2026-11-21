<?php
namespace App\Controllers\Erp;

use App\Core\{Db, HttpError};
use App\Services\Erp\{Audit, Stock};

final class InventoryController extends Base
{
    /** GET /erp/stock?warehouse_id=&q=&low=1&category_id= */
    public function index(): array
    {
        $this->need('inventory');
        $wh = (int) $this->q('warehouse_id', 0);
        $where = ['p.company_id = ?', 'p.is_active = 1']; $p = [$wh, $this->cid];
        if ($q = $this->q('q')) { $where[] = '(p.name LIKE ? OR p.sku LIKE ? OR p.barcode = ?)'; array_push($p, "%$q%", "%$q%", $q); }
        if ($c = $this->q('category_id')) { $where[] = 'p.category_id = ?'; $p[] = (int) $c; }
        $rows = Db::all('SELECT p.id, p.name, p.sku, p.barcode, p.unit, p.alt_unit, p.alt_factor, p.min_stock, p.rack, p.purchase_price, p.retail_price, c.name AS category_name,
                                COALESCE(SUM(CASE WHEN ? = 0 OR s.warehouse_id = ? THEN s.qty END), 0) AS qty
                           FROM products p LEFT JOIN product_categories c ON c.id = p.category_id
                           LEFT JOIN stock_ledger s ON s.product_id = p.id
                          WHERE ' . implode(' AND ', $where) . ' GROUP BY p.id ORDER BY p.name LIMIT 3000', array_merge([$wh], $p));
        // reserved = on final invoices not yet delivered
        $res = array_column(Db::all("SELECT i.product_id, SUM(i.qty - i.delivered_qty) AS r FROM sales_doc_items i JOIN sales_docs s ON s.id = i.doc_id
                                        JOIN deliveries d ON d.invoice_id = s.id AND d.status IN ('pending','packed','dispatched')
                                       WHERE s.company_id = ? GROUP BY i.product_id", [$this->cid]), 'r', 'product_id');
        $out = [];
        foreach ($rows as $r) {
            $r['qty'] = (float) $r['qty'];
            $r['pending_delivery'] = (float) ($res[$r['id']] ?? 0);
            $r['value'] = round($r['qty'] * (float) $r['purchase_price'], 2);
            $r['low'] = (float) $r['min_stock'] > 0 && $r['qty'] <= (float) $r['min_stock'];
            if ($this->q('low') && !$r['low']) continue;
            $out[] = $r;
        }
        return $out;
    }

    /** POST /erp/stock/adjust {product_id, warehouse_id, qty (+/-) | new_qty, reason} */
    public function adjust(): array
    {
        $this->need('inventory', true);
        if ($this->user['role'] === 'employee') throw HttpError::forbidden('Only a manager or the boss can adjust stock');
        $in = $this->req->require(['product_id', 'reason']);
        $pid = (int) $in['product_id'];
        if (!Db::value('SELECT 1 FROM products WHERE id = ? AND company_id = ?', [$pid, $this->cid])) throw HttpError::badRequest('Unknown product');
        $wh = $this->warehouse($this->req->int('warehouse_id'));
        $qty = $this->req->input('new_qty') !== null && $this->req->input('new_qty') !== ''
            ? (float) $this->req->input('new_qty') - Stock::balance($this->cid, $pid, $wh)
            : (float) $this->req->input('qty', 0);
        if (abs($qty) < 0.0005) throw HttpError::badRequest('Nothing to adjust');
        Stock::move($this->cid, $pid, $wh, $qty, 'adjustment', null, $this->uid(), 0, mb_substr((string) $in['reason'], 0, 255));
        Audit::log($this->cid, $this->uid(), 'product', $pid, 'stock_adjusted', ['qty' => $qty, 'warehouse_id' => $wh, 'reason' => $in['reason']]);
        return ['ok' => true, 'qty' => Stock::balance($this->cid, $pid, $wh)];
    }

    /** POST /erp/stock/transfer {from_warehouse_id, to_warehouse_id, items:[{product_id, qty}], note} */
    public function transfer(): array
    {
        $this->need('inventory', true);
        $in = $this->req->require(['from_warehouse_id', 'to_warehouse_id']);
        $from = $this->warehouse((int) $in['from_warehouse_id']); $to = $this->warehouse((int) $in['to_warehouse_id']);
        if ($from === $to) throw HttpError::badRequest('Choose two different warehouses');
        $items = array_values(array_filter((array) $this->req->input('items', []), fn($l) => (float) ($l['qty'] ?? 0) > 0));
        if (!$items) throw HttpError::badRequest('Add at least one item');
        Stock::assertAvailable($this->cid, $from, $items);
        $note = 'Transfer ' . Db::value('SELECT name FROM warehouses WHERE id = ?', [$from]) . ' → ' . Db::value('SELECT name FROM warehouses WHERE id = ?', [$to]) . ($this->req->input('note') ? ' · ' . $this->req->input('note') : '');
        Db::tx(function () use ($items, $from, $to, $note) {
            foreach ($items as $l) {
                Stock::move($this->cid, (int) $l['product_id'], $from, -(float) $l['qty'], 'transfer', null, $this->uid(), 0, $note);
                Stock::move($this->cid, (int) $l['product_id'], $to, (float) $l['qty'], 'transfer', null, $this->uid(), 0, $note);
            }
        });
        Audit::log($this->cid, $this->uid(), 'stock', null, 'transfer', ['from' => $from, 'to' => $to, 'items' => $items]);
        return ['ok' => true];
    }

    /** GET /erp/stock/ledger?product_id=&from=&to= */
    public function ledger(): array
    {
        $this->need('inventory');
        $where = ['s.company_id = ?']; $p = [$this->cid];
        if ($pid = $this->q('product_id')) { $where[] = 's.product_id = ?'; $p[] = (int) $pid; }
        if ($f = $this->q('from')) { $where[] = 's.created_at >= ?'; $p[] = $f; }
        if ($t = $this->q('to')) { $where[] = 's.created_at < DATE_ADD(?, INTERVAL 1 DAY)'; $p[] = $t; }
        if ($rt = $this->q('ref_type')) { $where[] = 's.ref_type = ?'; $p[] = $rt; }
        return Db::all('SELECT s.*, p.name AS product_name, p.unit, w.name AS warehouse_name, u.name AS user_name FROM stock_ledger s
                          JOIN products p ON p.id = s.product_id JOIN warehouses w ON w.id = s.warehouse_id LEFT JOIN users u ON u.id = s.created_by
                         WHERE ' . implode(' AND ', $where) . ' ORDER BY s.id DESC LIMIT 1000', $p);
    }
}
