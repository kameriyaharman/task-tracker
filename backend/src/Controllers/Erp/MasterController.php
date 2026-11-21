<?php
namespace App\Controllers\Erp;

use App\Core\{Db, HttpError};
use App\Services\Erp\{Audit, Ledger, Stock};

/** CRUD for masters: products, vendors, customers, warehouses, categories, brands, units. */
final class MasterController extends Base
{
    private const ENTITIES = [
        'products' => ['sku', 'barcode', 'name', 'category_id', 'brand_id', 'unit', 'alt_unit', 'alt_factor', 'hsn', 'gst_rate', 'purchase_price', 'retail_price', 'wholesale_price', 'contractor_price', 'min_stock', 'rack', 'is_active'],
        'vendors' => ['name', 'contact_person', 'mobile', 'email', 'gstin', 'address', 'city', 'credit_days', 'opening_balance', 'is_active'],
        'customers' => ['name', 'type', 'mobile', 'email', 'gstin', 'address', 'city', 'credit_limit', 'credit_days', 'opening_balance', 'recovery_user_id', 'is_active'],
        'warehouses' => ['name', 'type', 'address', 'is_active'],
        'categories' => ['name', 'is_active'],
        'brands' => ['name', 'is_active'],
        'units' => ['name', 'is_active'],
    ];
    private const TABLE = ['categories' => 'product_categories'];

    private function entity(): array
    {
        $e = $this->req->params['entity'] ?? '';
        if (!isset(self::ENTITIES[$e])) throw HttpError::notFound();
        return [$e, self::TABLE[$e] ?? $e, self::ENTITIES[$e]];
    }

    /** GET /erp/masters/{entity}?q=&all=1 */
    public function index(): array
    {
        [$e, $table] = $this->entity();
        $where = ['x.company_id = ?']; $p = [$this->cid];
        if (!$this->q('all')) $where[] = 'x.is_active = 1';
        if ($q = $this->q('q')) {
            $cols = $e === 'products' ? ['x.name', 'x.sku', 'x.barcode', 'x.hsn'] : ($e === 'vendors' || $e === 'customers' ? ['x.name', 'x.mobile', 'x.gstin', 'x.city'] : ['x.name']);
            $where[] = '(' . implode(' OR ', array_map(fn($c) => "$c LIKE ?", $cols)) . ')';
            foreach ($cols as $_) $p[] = "%$q%";
        }
        if ($e === 'products' && ($b = $this->q('barcode'))) { $where[] = '(x.barcode = ? OR x.sku = ?)'; $p[] = $b; $p[] = $b; }
        if ($e === 'products' && ($c = $this->q('category_id'))) { $where[] = 'x.category_id = ?'; $p[] = (int) $c; }
        if ($e === 'customers' && ($t = $this->q('type'))) { $where[] = 'x.type = ?'; $p[] = $t; }
        $w = implode(' AND ', $where);
        $limit = min(2000, (int) $this->q('limit', 500));

        if ($e === 'products') {
            $rows = Db::all("SELECT x.*, c.name AS category_name, b.name AS brand_name,
                                    COALESCE((SELECT SUM(qty) FROM stock_ledger s WHERE s.product_id = x.id), 0) AS stock
                               FROM products x LEFT JOIN product_categories c ON c.id = x.category_id LEFT JOIN brands b ON b.id = x.brand_id
                              WHERE $w ORDER BY x.name LIMIT $limit", $p);
        } else {
            $rows = Db::all("SELECT x.* FROM $table x WHERE $w ORDER BY x.name LIMIT $limit", $p);
        }
        if ($e === 'customers' || $e === 'vendors') {
            foreach ($rows as &$r) $r['outstanding'] = $e === 'customers' ? Ledger::customerOutstanding($this->cid, (int) $r['id']) : Ledger::vendorOutstanding($this->cid, (int) $r['id']);
        }
        return $rows;
    }

    public function show(): array
    {
        [$e, $table] = $this->entity();
        $r = Db::one("SELECT * FROM $table WHERE id = ? AND company_id = ?", [$this->param('id'), $this->cid]);
        if (!$r) throw HttpError::notFound();
        if ($e === 'products') {
            $r['stock'] = Db::all('SELECT w.id AS warehouse_id, w.name, COALESCE(SUM(s.qty),0) AS qty FROM warehouses w
                                    LEFT JOIN stock_ledger s ON s.warehouse_id = w.id AND s.product_id = ? WHERE w.company_id = ? GROUP BY w.id ORDER BY w.id', [$r['id'], $this->cid]);
            $r['ledger'] = Db::all('SELECT s.*, w.name AS warehouse_name, u.name AS user_name FROM stock_ledger s JOIN warehouses w ON w.id = s.warehouse_id
                                     LEFT JOIN users u ON u.id = s.created_by WHERE s.product_id = ? AND s.company_id = ? ORDER BY s.id DESC LIMIT 100', [$r['id'], $this->cid]);
        }
        if ($e === 'customers') $r['outstanding'] = Ledger::customerOutstanding($this->cid, (int) $r['id']);
        if ($e === 'vendors') $r['outstanding'] = Ledger::vendorOutstanding($this->cid, (int) $r['id']);
        $r['history'] = Audit::history($this->cid, rtrim($e, 's'), (int) $r['id']);
        return $r;
    }

    public function store(): array { return $this->save(null); }
    public function update(): array { return $this->save($this->param('id')); }

    private function save(?int $id): array
    {
        [$e, $table, $cols] = $this->entity();
        $this->need('masters', true);
        $d = $this->req->only($cols);
        foreach ($d as $k => $v) if ($v === '') $d[$k] = null;
        if (!$id && empty($d['name'])) throw HttpError::badRequest('Name is required');
        if (isset($d['is_active'])) $d['is_active'] = $d['is_active'] ? 1 : 0;
        if ($e === 'products') {
            foreach (['gst_rate', 'purchase_price', 'retail_price', 'wholesale_price', 'contractor_price', 'min_stock'] as $n) if (array_key_exists($n, $d)) $d[$n] = (float) ($d[$n] ?? 0);
            if (!empty($d['barcode']) && Db::value('SELECT 1 FROM products WHERE company_id = ? AND barcode = ? AND id <> ?', [$this->cid, $d['barcode'], (int) $id])) throw HttpError::badRequest('Barcode already used by another product');
        }
        if (in_array($e, ['vendors', 'customers'], true)) {
            foreach (['opening_balance', 'credit_limit'] as $n) if (array_key_exists($n, $d)) $d[$n] = (float) ($d[$n] ?? 0);
            if (!empty($d['mobile'])) $d['mobile'] = preg_replace('/\D/', '', $d['mobile']);
        }
        if ($id) {
            $old = Db::one("SELECT * FROM $table WHERE id = ? AND company_id = ?", [$id, $this->cid]);
            if (!$old) throw HttpError::notFound();
            Db::update($table, $id, $d, $this->cid);
            $changes = array_filter($d, fn($v, $k) => (string) ($old[$k] ?? '') !== (string) $v, ARRAY_FILTER_USE_BOTH);
            if ($changes) Audit::log($this->cid, $this->uid(), rtrim($e, 's'), $id, 'updated', array_map(fn($k) => ['from' => $old[$k] ?? null, 'to' => $d[$k]], array_combine(array_keys($changes), array_keys($changes))));
        } else {
            $id = Db::insert($table, $d + ['company_id' => $this->cid]);
            Audit::log($this->cid, $this->uid(), rtrim($e, 's'), $id, 'created');
            // Opening stock for a new product
            if ($e === 'products' && ($os = (float) $this->req->input('opening_stock', 0)) > 0) {
                Stock::move($this->cid, $id, $this->warehouse($this->req->int('warehouse_id')), $os, 'opening', $id, $this->uid(), (float) ($d['purchase_price'] ?? 0), 'Opening stock');
            }
        }
        $this->req->params['id'] = $id;
        return $this->show();
    }

    /** POST /erp/masters/products/import  {rows:[{name, sku, unit, gst_rate, hsn, purchase_price, retail_price, wholesale_price, opening_stock, category}]} */
    public function importProducts(): array
    {
        $this->need('masters', true);
        $rows = (array) $this->req->input('rows', []);
        $wh = $this->warehouse($this->req->int('warehouse_id'));
        $made = 0; $updated = 0;
        foreach ($rows as $r) {
            $name = trim((string) ($r['name'] ?? ''));
            if ($name === '') continue;
            $cat = null;
            if (!empty($r['category'])) {
                $cat = Db::value('SELECT id FROM product_categories WHERE company_id = ? AND name = ?', [$this->cid, $r['category']])
                    ?: Db::insert('product_categories', ['company_id' => $this->cid, 'name' => mb_substr($r['category'], 0, 80)]);
            }
            $d = ['name' => mb_substr($name, 0, 160), 'sku' => $r['sku'] ?? null, 'barcode' => $r['barcode'] ?? null, 'unit' => $r['unit'] ?? 'Piece', 'hsn' => $r['hsn'] ?? null,
                  'gst_rate' => (float) ($r['gst_rate'] ?? 18), 'purchase_price' => (float) ($r['purchase_price'] ?? 0), 'retail_price' => (float) ($r['retail_price'] ?? 0),
                  'wholesale_price' => (float) ($r['wholesale_price'] ?? ($r['retail_price'] ?? 0)), 'contractor_price' => (float) ($r['contractor_price'] ?? ($r['wholesale_price'] ?? ($r['retail_price'] ?? 0))),
                  'min_stock' => (float) ($r['min_stock'] ?? 0), 'category_id' => $cat];
            $existing = Db::value('SELECT id FROM products WHERE company_id = ? AND (name = ? OR (sku IS NOT NULL AND sku = ?))', [$this->cid, $d['name'], $d['sku'] ?? '']);
            if ($existing) { Db::update('products', (int) $existing, $d, $this->cid); $updated++; continue; }
            $pid = Db::insert('products', $d + ['company_id' => $this->cid]);
            if (($os = (float) ($r['opening_stock'] ?? 0)) > 0) Stock::move($this->cid, $pid, $wh, $os, 'opening', $pid, $this->uid(), $d['purchase_price'], 'Opening stock');
            $made++;
        }
        return ['created' => $made, 'updated' => $updated];
    }
}
