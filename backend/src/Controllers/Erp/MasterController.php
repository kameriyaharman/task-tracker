<?php
namespace App\Controllers\Erp;

use App\Core\{Db, HttpError};
use App\Services\Erp\{Audit, Ledger, Stock};

/** CRUD for masters: products, vendors, customers, warehouses, categories, brands, units. */
final class MasterController extends Base
{
    private const ENTITIES = [
        'products' => ['sku', 'barcode', 'name', 'category_id', 'brand_id', 'unit', 'alt_unit', 'alt_factor', 'hsn', 'gst_rate', 'purchase_price', 'retail_price', 'wholesale_price', 'contractor_price', 'min_stock', 'rack', 'is_active'],
        'vendors' => ['code', 'name', 'business_name', 'contact_person', 'contacts', 'mobile', 'whatsapp', 'email', 'gstin', 'pan', 'address', 'billing_address', 'city', 'state', 'pincode',
                      'dob', 'anniversary', 'credit_days', 'opening_balance', 'bank_name', 'account_holder', 'account_no', 'ifsc', 'upi_id', 'notes', 'is_active'],
        'customers' => ['code', 'name', 'business_name', 'type', 'contacts', 'mobile', 'whatsapp', 'email', 'gstin', 'pan', 'address', 'billing_address', 'city', 'state', 'pincode',
                        'dob', 'anniversary', 'credit_limit', 'credit_days', 'opening_balance', 'recovery_user_id', 'sales_user_id', 'notes', 'is_active'],
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
            $cols = $e === 'products' ? ['x.name', 'x.sku', 'x.barcode', 'x.hsn'] : ($e === 'vendors' || $e === 'customers' ? ['x.name', 'x.business_name', 'x.mobile', 'x.whatsapp', 'x.gstin', 'x.city', 'x.contacts'] : ['x.name']);
            $where[] = '(' . implode(' OR ', array_map(fn($c) => "$c LIKE ?", $cols)) . (($e === 'vendors' || $e === 'customers') ? ' OR x.code = ?' : '') . ')';
            foreach ($cols as $_) $p[] = "%$q%";
            if ($e === 'vendors' || $e === 'customers') $p[] = $q;
        }
        if ($e === 'products' && ($b = $this->q('barcode'))) { $where[] = '(x.barcode = ? OR x.sku = ?)'; $p[] = $b; $p[] = $b; }
        if ($e === 'products' && ($c = $this->q('category_id'))) { $where[] = 'x.category_id = ?'; $p[] = (int) $c; }
        if ($e === 'customers' && ($t = $this->q('type'))) { $where[] = 'x.type = ?'; $p[] = $t; }
        if ($e === 'customers' && ($su = $this->q('sales_user_id'))) { $where[] = $su === 'none' ? 'x.sales_user_id IS NULL' : 'x.sales_user_id = ?'; if ($su !== 'none') $p[] = (int) $su; }
        $w = implode(' AND ', $where);
        $limit = min(2000, (int) $this->q('limit', 500));

        if ($e === 'products') {
            $rows = Db::all("SELECT x.*, c.name AS category_name, b.name AS brand_name,
                                    COALESCE((SELECT SUM(qty) FROM stock_ledger s WHERE s.product_id = x.id), 0) AS stock
                               FROM products x LEFT JOIN product_categories c ON c.id = x.category_id LEFT JOIN brands b ON b.id = x.brand_id
                              WHERE $w ORDER BY x.name LIMIT $limit", $p);
        } else {
            $extra = $e === 'customers' ? ', su.name AS sales_user_name, ru.name AS recovery_user_name' : '';
            $join = $e === 'customers' ? ' LEFT JOIN users su ON su.id = x.sales_user_id LEFT JOIN users ru ON ru.id = x.recovery_user_id' : '';
            $rows = Db::all("SELECT x.* $extra FROM $table x $join WHERE $w ORDER BY x.name LIMIT $limit", $p);
        }
        if ($e === 'customers' || $e === 'vendors') {
            $vol = self::volumes($this->cid, $e);
            foreach ($rows as &$r) {
                $r['outstanding'] = $e === 'customers' ? Ledger::customerOutstanding($this->cid, (int) $r['id']) : Ledger::vendorOutstanding($this->cid, (int) $r['id']);
                self::decorate($r, $vol[(int) $r['id']] ?? 0);
            }
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
        if ($e === 'customers' || $e === 'vendors') {
            self::decorate($r, self::volumes($this->cid, $e, (int) $r['id'])[(int) $r['id']] ?? 0);
            $r['files'] = $this->files(rtrim($e, 's'), (int) $r['id']);
            $r['bills'] = $e === 'customers'
                ? Db::all("SELECT id, doc_no AS no, doc_date AS dt, total, paid_amount, total - paid_amount AS due, DATEDIFF(CURDATE(), doc_date) AS age FROM sales_docs WHERE company_id = ? AND customer_id = ? AND doc_type = 'invoice' AND status = 'final' AND paid_amount < total - 0.5 ORDER BY doc_date, id", [$this->cid, $r['id']])
                : Db::all("SELECT g.id, COALESCE(g.bill_no, g.grn_no) AS no, COALESCE(g.bill_date, DATE(g.created_at)) AS dt, g.total, g.paid_amount, g.total - g.paid_amount AS due, DATEDIFF(CURDATE(), COALESCE(g.bill_date, DATE(g.created_at))) AS age, po.po_no
                             FROM grns g LEFT JOIN purchase_orders po ON po.id = g.po_id WHERE g.company_id = ? AND g.vendor_id = ? AND g.status = 'approved' AND g.paid_amount < g.total - 0.5 ORDER BY dt, g.id", [$this->cid, $r['id']]);
        }
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
            foreach (['mobile', 'whatsapp'] as $n) if (!empty($d[$n])) $d[$n] = substr(preg_replace('/\D/', '', $d[$n]), -10);
            if (array_key_exists('contacts', $d)) {
                $c = is_string($d['contacts']) ? json_decode($d['contacts'], true) : $d['contacts'];
                $c = array_values(array_filter(array_map(fn($x) => ['name' => trim((string) ($x['name'] ?? '')), 'mobile' => substr(preg_replace('/\D/', '', (string) ($x['mobile'] ?? '')), -10), 'role' => trim((string) ($x['role'] ?? ''))], (array) $c), fn($x) => $x['name'] !== '' || $x['mobile'] !== ''));
                $d['contacts'] = $c ? json_encode($c, JSON_UNESCAPED_UNICODE) : null;
            }
            foreach (['pan', 'gstin', 'ifsc'] as $n) if (!empty($d[$n])) $d[$n] = strtoupper(trim($d[$n]));
            if (!empty($d['pan']) && !preg_match('/^[A-Z]{5}[0-9]{4}[A-Z]$/', $d['pan'])) throw HttpError::badRequest('PAN should look like ABCDE1234F');
            if (!empty($d['gstin']) && strlen($d['gstin']) !== 15) throw HttpError::badRequest('GSTIN must be 15 characters');
            if (!empty($d['ifsc']) && !preg_match('/^[A-Z]{4}0[A-Z0-9]{6}$/', $d['ifsc'])) throw HttpError::badRequest('IFSC should look like SBIN0001234');
            if (!empty($d['email']) && !filter_var($d['email'], FILTER_VALIDATE_EMAIL)) throw HttpError::badRequest('Email is not valid');
            if (!empty($d['code'])) {
                $d['code'] = strtoupper(trim($d['code']));
                if (Db::value("SELECT 1 FROM $table WHERE company_id = ? AND code = ? AND id <> ?", [$this->cid, $d['code'], (int) $id])) throw HttpError::badRequest("Code {$d['code']} is already used");
            } elseif (!$id) {
                $d['code'] = (string) ((int) Db::value("SELECT COALESCE(MAX(CAST(code AS UNSIGNED)),0) FROM $table WHERE company_id = ?", [$this->cid]) + 1);
            }
            if ($e === 'customers') {
                // the customer type decides which price list the bill uses
                if (!empty($d['type'])) {
                    $pt = Db::value('SELECT price_type FROM customer_types WHERE company_id = ? AND name = ?', [$this->cid, $d['type']]);
                    if (!$pt) throw HttpError::badRequest('Unknown customer type');
                    $d['price_type'] = $pt;
                }
                if (!$id && !empty($d['mobile']) && Db::value('SELECT 1 FROM customers WHERE company_id = ? AND mobile = ?', [$this->cid, $d['mobile']])) {
                    throw HttpError::badRequest('A customer with this mobile number already exists');
                }
            }
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

    /** Last-12-months business with each party → rating tier (customers: sales, vendors: purchases). */
    public static function volumes(int $cid, string $e, ?int $one = null): array
    {
        $since = date('Y-m-d', strtotime('-12 months'));
        $sql = $e === 'customers'
            ? "SELECT customer_id AS pid, SUM(total) AS v FROM sales_docs WHERE company_id = ? AND doc_type = 'invoice' AND status = 'final' AND doc_date >= ?" . ($one ? ' AND customer_id = ?' : '') . ' GROUP BY customer_id'
            : "SELECT vendor_id AS pid, SUM(total) AS v FROM grns WHERE company_id = ? AND status = 'approved' AND created_at >= ?" . ($one ? ' AND vendor_id = ?' : '') . ' GROUP BY vendor_id';
        $out = [];
        foreach (Db::all($sql, $one ? [$cid, $since, $one] : [$cid, $since]) as $r) $out[(int) $r['pid']] = (float) $r['v'];
        return $out;
    }

    public const TIERS = [['Platinum', 1000000], ['Gold', 300000], ['Silver', 50000]];

    private static function decorate(array &$r, float $vol): void
    {
        $r['business_12m'] = round($vol, 2);
        $r['rating'] = 'Regular';
        foreach (self::TIERS as [$name, $min]) if ($vol >= $min) { $r['rating'] = $name; break; }
        $r['contacts'] = $r['contacts'] ? (json_decode($r['contacts'], true) ?: []) : [];
        foreach (['dob', 'anniversary'] as $k) {
            $r[$k . '_in_days'] = null;
            if (!empty($r[$k])) {
                $next = strtotime(date('Y') . substr($r[$k], 4));
                if ($next < strtotime('today')) $next = strtotime((date('Y') + 1) . substr($r[$k], 4));
                $r[$k . '_in_days'] = (int) round(($next - strtotime('today')) / 86400);
            }
        }
    }

    /** GET /erp/customer-types · POST {name, price_type} · DELETE /erp/customer-types/{id} */
    public function types(): array
    {
        return Db::all('SELECT t.*, (SELECT COUNT(*) FROM customers c WHERE c.company_id = t.company_id AND c.type = t.name) AS customers FROM customer_types t WHERE t.company_id = ? ORDER BY t.sort, t.name', [$this->cid]);
    }

    public function addType(): array
    {
        $this->need('masters', true);
        $name = mb_substr(trim((string) $this->req->input('name')), 0, 40);
        if ($name === '') throw HttpError::badRequest('Type name is required');
        if (Db::value('SELECT 1 FROM customer_types WHERE company_id = ? AND name = ?', [$this->cid, $name])) throw HttpError::badRequest('This type already exists');
        $pt = in_array($this->req->input('price_type'), ['retail', 'wholesale', 'contractor'], true) ? $this->req->input('price_type') : 'retail';
        Db::insert('customer_types', ['company_id' => $this->cid, 'name' => $name, 'price_type' => $pt, 'sort' => 100]);
        return $this->types();
    }

    public function deleteType(): array
    {
        $this->need('masters', true);
        $t = Db::one('SELECT * FROM customer_types WHERE id = ? AND company_id = ?', [$this->param('id'), $this->cid]);
        if (!$t) throw HttpError::notFound();
        if (Db::value('SELECT 1 FROM customers WHERE company_id = ? AND type = ?', [$this->cid, $t['name']])) throw HttpError::badRequest('Some customers use this type — change them first');
        Db::exec('DELETE FROM customer_types WHERE id = ?', [$t['id']]);
        return $this->types();
    }

    /** POST /erp/masters/customers/reassign {from_user, to_user, field: sales|recovery} — when a sales person leaves */
    public function reassign(): array
    {
        $this->need('masters', true);
        $field = $this->req->input('field') === 'recovery' ? 'recovery_user_id' : 'sales_user_id';
        $from = $this->req->int('from_user'); $to = $this->req->int('to_user');
        if (!$from || !$to || $from === $to) throw HttpError::badRequest('Choose both people');
        foreach ([$from, $to] as $u) if (!Db::value('SELECT 1 FROM users WHERE id = ? AND company_id = ?', [$u, $this->cid])) throw HttpError::badRequest('Unknown employee');
        $n = Db::exec("UPDATE customers SET $field = ? WHERE company_id = ? AND $field = ?", [$to, $this->cid, $from]);
        Audit::log($this->cid, $this->uid(), 'customer', 0, 'reassigned', ['field' => $field, 'from' => $from, 'to' => $to, 'count' => $n]);
        return ['moved' => $n];
    }

    /** GET /erp/masters/customers/by-person — how many customers / how much business each sales person handles */
    public function byPerson(): array
    {
        $this->need('masters');
        return Db::all("SELECT u.id, u.name, u.is_active, COUNT(c.id) AS customers,
                               COALESCE(SUM((SELECT SUM(s.total) FROM sales_docs s WHERE s.customer_id = c.id AND s.doc_type = 'invoice' AND s.status = 'final' AND s.doc_date >= CURDATE() - INTERVAL 12 MONTH)),0) AS business_12m
                          FROM customers c JOIN users u ON u.id = c.sales_user_id WHERE c.company_id = ? AND c.is_active = 1 GROUP BY u.id ORDER BY customers DESC", [$this->cid]);
    }

    /** GET /erp/wishes — birthdays & anniversaries of customers / vendors in the next N days */
    public function wishes(): array
    {
        $days = max(1, min(60, (int) $this->q('days', 7)));
        $out = [];
        foreach (['customers' => 'customer', 'vendors' => 'vendor'] as $tb => $kind) {
            foreach (Db::all("SELECT id, code, name, business_name, mobile, whatsapp, dob, anniversary FROM $tb WHERE company_id = ? AND is_active = 1 AND (dob IS NOT NULL OR anniversary IS NOT NULL)", [$this->cid]) as $r) {
                foreach (['dob' => 'Birthday', 'anniversary' => 'Anniversary'] as $k => $label) {
                    if (empty($r[$k])) continue;
                    $next = strtotime(date('Y') . substr($r[$k], 4));
                    if ($next < strtotime('today')) $next = strtotime((date('Y') + 1) . substr($r[$k], 4));
                    $in = (int) round(($next - strtotime('today')) / 86400);
                    if ($in <= $days) $out[] = ['kind' => $kind, 'id' => (int) $r['id'], 'name' => $r['name'], 'business_name' => $r['business_name'], 'phone' => $r['whatsapp'] ?: $r['mobile'], 'occasion' => $label, 'date' => date('Y-m-d', $next), 'in_days' => $in];
                }
            }
        }
        usort($out, fn($a, $b) => $a['in_days'] <=> $b['in_days']);
        return $out;
    }

    /** POST /erp/files/{entity}/{id} (multipart files[]) · DELETE /erp/files/{fileId} — documents on a party (GST certificate, visiting card, blank cheque…) */
    public function upload(): array
    {
        $entity = $this->req->params['entity'] ?? '';
        $map = ['customer' => 'customers', 'vendor' => 'vendors'];
        if (!isset($map[$entity])) throw HttpError::notFound();
        $this->need('masters', true);
        $id = (int) $this->param('id');
        if (!Db::value("SELECT 1 FROM {$map[$entity]} WHERE id = ? AND company_id = ?", [$id, $this->cid])) throw HttpError::notFound();
        $files = \App\Services\Upload::list($this->req->files, 'files');
        if (!$files) throw HttpError::badRequest('Choose a file');
        foreach ($files as $f) {
            $a = \App\Services\Upload::save($f, $this->cid, $this->uid(), $entity, $id);
            if ($label = trim((string) $this->req->input('label'))) Db::exec('UPDATE attachments SET file_name = ? WHERE id = ?', [mb_substr($label . ' — ' . $a['file_name'], 0, 200), $a['id']]);
        }
        return $this->files($entity, $id);
    }

    public function deleteFile(): array
    {
        $this->need('masters', true);
        $a = Db::one("SELECT * FROM attachments WHERE id = ? AND company_id = ? AND entity_type IN ('customer','vendor')", [$this->param('id'), $this->cid]);
        if (!$a) throw HttpError::notFound();
        Db::exec('DELETE FROM attachments WHERE id = ?', [$a['id']]);
        return ['deleted' => true];
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
