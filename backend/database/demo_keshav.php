<?php
/**
 * Demo data for the Keshav company (one login per role + data in every screen).
 *   php database/demo_keshav.php          → load once (skips if already loaded)
 *   php database/demo_keshav.php --clear  → remove ALL demo users and every ERP / task / attendance record of the company
 * Push notifications are switched off while loading so nobody's phone gets spammed.
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
require dirname(__DIR__) . '/src/bootstrap.php';

use App\Core\{Config, Db};
use App\Services\Erp\{Approvals, DocNo, Docs, Ledger, Seed, Stock};

Config::set('push.enabled', false);
$code = strtoupper((string) (getenv('COMPANY_CODE') ?: 'KESHAV'));
$cid = (int) Db::value('SELECT id FROM companies WHERE code = ?', [$code]);
if (!$cid) { fwrite(STDERR, "Company $code not found\n"); exit(1); }
$settings = json_decode((string) Db::value('SELECT erp_settings FROM companies WHERE id = ?', [$cid]), true) ?: [];

const DEMO_MOBILES = ['9000000002', '9000000003', '9000000004', '9000000005', '9000000006', '9000000007', '9000000008', '9000000009', '9000000010'];

// ───────────────────────── clear ─────────────────────────
if (in_array('--clear', $argv, true)) {
    Db::pdo()->exec('SET FOREIGN_KEY_CHECKS = 0');
    foreach (['purchase_order_items' => 'po_id IN (SELECT id FROM purchase_orders WHERE company_id = ?)', 'grn_items' => 'grn_id IN (SELECT id FROM grns WHERE company_id = ?)',
              'sales_doc_items' => 'doc_id IN (SELECT id FROM sales_docs WHERE company_id = ?)', 'return_items' => 'return_id IN (SELECT id FROM returns_docs WHERE company_id = ?)'] as $t => $w) {
        Db::exec("DELETE FROM $t WHERE $w", [$cid]);
    }
    foreach (['stock_ledger', 'purchase_orders', 'grns', 'deliveries', 'sales_docs', 'payments', 'recovery_followups', 'returns_docs', 'expenses', 'complaints',
              'approvals', 'workflow_runs', 'tally_queue', 'audit_log', 'doc_counters', 'products', 'vendors', 'customers', 'brands'] as $t) {
        Db::exec("DELETE FROM $t WHERE company_id = ?", [$cid]);
    }
    $ids = array_map('intval', array_column(Db::all('SELECT id FROM users WHERE company_id = ? AND mobile IN ' . Db::in(DEMO_MOBILES), array_merge([$cid], DEMO_MOBILES)), 'id'));
    // everything task / people related (demo period)
    Db::exec('DELETE c FROM task_checklist c JOIN tasks t ON t.id = c.task_id WHERE t.company_id = ?', [$cid]);
    Db::exec('DELETE c FROM task_comments c JOIN tasks t ON t.id = c.task_id WHERE t.company_id = ?', [$cid]);
    Db::exec('DELETE a FROM task_activity a JOIN tasks t ON t.id = a.task_id WHERE t.company_id = ?', [$cid]);
    Db::exec('DELETE m FROM chat_messages m JOIN chat_rooms r ON r.id = m.room_id WHERE r.company_id = ?', [$cid]);
    Db::exec('DELETE m FROM chat_members m JOIN chat_rooms r ON r.id = m.room_id WHERE r.company_id = ?', [$cid]);
    foreach (['tasks', 'recurring_rules', 'attendance', 'location_pings', 'requests', 'chat_rooms', 'campaigns', 'notifications', 'goals', 'geofences', 'timesheet_entries', 'events', 'rewards'] as $t) {
        Db::exec("DELETE FROM $t WHERE company_id = ?", [$cid]);
    }
    if ($ids) Db::exec('DELETE FROM users WHERE id IN ' . Db::in($ids), $ids);
    Db::pdo()->exec('SET FOREIGN_KEY_CHECKS = 1');
    unset($settings['demo_loaded']);
    Db::update('companies', $cid, ['erp_settings' => json_encode($settings)]);
    Seed::run($cid);
    echo "Demo data removed\n";
    exit;
}

if (!empty($settings['demo_loaded'])) { echo "Demo data already loaded\n"; exit; }
Seed::run($cid);
mt_srand(7);

$ago = fn(int $days, string $time = '11:00:00') => date('Y-m-d', strtotime("-$days days")) . ' ' . $time;
$day = fn(int $days) => date('Y-m-d', strtotime("-$days days"));
$owner = Db::one("SELECT * FROM users WHERE company_id = ? AND role = 'owner' ORDER BY id LIMIT 1", [$cid]);
$roleId = fn(string $n) => (int) Db::value('SELECT id FROM erp_roles WHERE company_id = ? AND name = ?', [$cid, $n]);
$dept = fn(string $n) => (int) (Db::value('SELECT id FROM departments WHERE company_id = ? AND name = ?', [$cid, $n]) ?: Db::insert('departments', ['company_id' => $cid, 'name' => $n]));
$pw = password_hash(getenv('DEMO_STAFF_PASSWORD') ?: 'demo@123', PASSWORD_DEFAULT);

// ───────────────────────── people (one per role) ─────────────────────────
$people = [
    'manager' => ['Manoj Sharma', '9000000002', 'Store Manager', 'manager', null, 'Sales', true],
    'purchase' => ['Pawan Kumar', '9000000003', 'Purchase Executive', 'employee', 'Purchase Executive', 'Store', true],
    'store' => ['Sunil Yadav', '9000000004', 'Store Incharge', 'employee', 'Store Incharge', 'Store', true],
    'sales' => ['Sita Verma', '9000000005', 'Sales Executive', 'employee', 'Sales Executive', 'Sales', true],
    'accounts' => ['Anil Gupta', '9000000006', 'Accountant', 'employee', 'Accountant', 'Accounts', true],
    'recovery' => ['Ravi Singh', '9000000007', 'Recovery Executive', 'employee', 'Recovery Executive', 'Accounts', false],
    'delivery' => ['Deepak Kumar', '9000000008', 'Delivery Staff', 'employee', 'Delivery Staff', 'Delivery', false],
    'hr' => ['Neha Arora', '9000000009', 'HR Executive', 'employee', 'HR Executive', 'HR', false],
    'head' => ['Vikram Malhotra', '9000000010', 'Department Head – Sales', 'employee', 'Department Head', 'Sales', true],
];
$U = ['owner' => $owner];
foreach ($people as $k => [$name, $mob, $des, $role, $erp, $dp, $desk]) {
    $id = Db::value('SELECT id FROM users WHERE company_id = ? AND mobile = ?', [$cid, $mob]);
    $row = ['name' => $name, 'designation' => $des, 'role' => $role, 'erp_role_id' => $erp ? $roleId($erp) : null, 'department_id' => $dept($dp),
            'manager_id' => $k === 'manager' ? $owner['id'] : null, 'password_hash' => $desk ? $pw : null, 'location_consent' => 1, 'is_active' => 1, 'joined_on' => '2024-04-01'];
    if ($id) Db::update('users', (int) $id, $row); else $id = Db::insert('users', $row + ['company_id' => $cid, 'mobile' => $mob]);
    $U[$k] = Db::one('SELECT * FROM users WHERE id = ?', [$id]);
}
foreach (['purchase', 'store', 'sales', 'accounts', 'recovery', 'delivery', 'hr', 'head'] as $k) Db::exec('UPDATE users SET manager_id = ? WHERE id = ?', [$U['manager']['id'], $U[$k]['id']]);
$uid = fn(string $k) => (int) $U[$k]['id'];

// Tally on (so the sync queue has something to show; the connector is not installed yet)
$settings['tally'] = array_merge(['enabled' => true, 'company' => 'Keshav Home Solution', 'url' => 'http://localhost:9000', 'token' => bin2hex(random_bytes(20))], $settings['tally'] ?? []);
Db::update('companies', $cid, ['erp_settings' => json_encode($settings)]);

// ───────────────────────── masters ─────────────────────────
$wh = [];
foreach (Db::all('SELECT id, type FROM warehouses WHERE company_id = ?', [$cid]) as $w) $wh[$w['type']] = (int) $w['id'];
$cat = fn(string $n) => (int) (Db::value('SELECT id FROM product_categories WHERE company_id = ? AND name = ?', [$cid, $n]) ?: Db::insert('product_categories', ['company_id' => $cid, 'name' => $n]));
$brand = fn(string $n) => (int) (Db::value('SELECT id FROM brands WHERE company_id = ? AND name = ?', [$cid, $n]) ?: Db::insert('brands', ['company_id' => $cid, 'name' => $n]));

// name, category, brand, unit, alt unit/factor, hsn, gst, purchase, retail, wholesale, contractor, min, godown qty, showroom qty, rack
$catalog = [
    ['UltraTech OPC 53 Cement 50kg', 'Cement', 'UltraTech', 'Bag', null, null, '2523', 28, 330, 395, 380, 372, 100, 420, 40, 'G-1'],
    ['ACC PPC Cement 50kg', 'Cement', 'ACC', 'Bag', null, null, '2523', 28, 315, 375, 360, 355, 80, 260, 30, 'G-1'],
    ['Tata Tiscon TMT 12mm', 'Steel / TMT', 'Tata Tiscon', 'Kg', 'MT', 1000, '7214', 18, 62, 72, 68, 67, 1000, 4200, 0, 'G-2'],
    ['Kamdhenu TMT 8mm', 'Steel / TMT', 'Kamdhenu', 'Kg', 'MT', 1000, '7214', 18, 58, 68, 64, 63, 800, 650, 0, 'G-2'],
    ['Supreme PVC Pipe 4" (6m)', 'Pipes & Fittings', 'Supreme', 'Piece', null, null, '3917', 18, 520, 680, 620, 600, 20, 60, 12, 'S-3'],
    ['Astral CPVC Pipe 1" (3m)', 'Pipes & Fittings', 'Astral', 'Piece', null, null, '3917', 18, 290, 380, 345, 335, 30, 90, 40, 'S-3'],
    ['Ashirvad CPVC Elbow 1"', 'Pipes & Fittings', 'Ashirvad', 'Piece', 'Box', 50, '3917', 18, 18, 30, 25, 24, 100, 400, 300, 'S-4'],
    ['Asian Paints Apex Ultima 20L', 'Paint', 'Asian Paints', 'Piece', null, null, '3209', 18, 6200, 7600, 7100, 6950, 5, 14, 6, 'S-1'],
    ['Asian Paints Royale 4L', 'Paint', 'Asian Paints', 'Piece', null, null, '3209', 18, 1850, 2350, 2200, 2150, 10, 22, 40, 'S-1'],
    ['Berger Primer 10L', 'Paint', 'Berger', 'Piece', null, null, '3208', 18, 1450, 1850, 1720, 1690, 8, 4, 3, 'S-1'],
    ['Birla White Wall Putty 40kg', 'Paint', 'Birla White', 'Bag', null, null, '3214', 18, 720, 890, 840, 825, 25, 90, 60, 'G-3'],
    ['Havells Wire 2.5 sqmm (90m)', 'Electrical', 'Havells', 'Coil', null, null, '8544', 18, 2350, 2990, 2800, 2750, 10, 30, 15, 'S-5'],
    ['Polycab Wire 1.5 sqmm (90m)', 'Electrical', 'Polycab', 'Coil', null, null, '8544', 18, 1450, 1890, 1760, 1720, 10, 6, 4, 'S-5'],
    ['Anchor Roma Switch 6A', 'Electrical', 'Anchor', 'Piece', 'Box', 20, '8536', 18, 32, 55, 45, 43, 100, 600, 400, 'S-6'],
    ['Havells MCB 32A', 'Electrical', 'Havells', 'Piece', null, null, '8536', 18, 210, 320, 280, 270, 30, 90, 40, 'S-6'],
    ['Philips LED Bulb 9W', 'Electrical', 'Philips', 'Piece', 'Box', 10, '8539', 12, 70, 120, 95, 92, 50, 300, 200, 'S-6'],
    ['Crompton Ceiling Fan 1200mm', 'Electrical', 'Crompton', 'Piece', null, null, '8414', 18, 1650, 2290, 2050, 1990, 6, 20, 14, 'S-7'],
    ['Jaquar Basin Mixer', 'Sanitary', 'Jaquar', 'Piece', null, null, '8481', 18, 3200, 4250, 3900, 3800, 3, 6, 4, 'S-8'],
    ['Hindware Wall-hung WC', 'Sanitary', 'Hindware', 'Piece', null, null, '6910', 18, 4800, 6200, 5750, 5600, 2, 3, 2, 'S-8'],
    ['Cera Wash Basin', 'Sanitary', 'Cera', 'Piece', null, null, '6910', 18, 1400, 1990, 1800, 1750, 4, 12, 5, 'S-8'],
    ['Kajaria Floor Tile 2x2 ft', 'Tiles', 'Kajaria', 'Box', null, null, '6907', 18, 410, 560, 520, 505, 40, 380, 60, 'G-4'],
    ['Somany Wall Tile 1x1.5 ft', 'Tiles', 'Somany', 'Box', null, null, '6907', 18, 360, 480, 450, 440, 40, 25, 10, 'G-4'],
    ['Godrej Ultra Lock', 'Hardware & Tools', 'Godrej', 'Piece', null, null, '8301', 18, 650, 890, 820, 800, 10, 35, 15, 'S-9'],
    ['Hettich Auto Hinge', 'Hardware & Tools', 'Hettich', 'Pair', 'Box', 10, '8302', 18, 45, 75, 62, 60, 50, 220, 80, 'S-9'],
    ['Fevicol SH 1kg', 'Hardware & Tools', 'Pidilite', 'Piece', null, null, '3506', 18, 310, 390, 365, 355, 20, 70, 30, 'S-9'],
    ['Bosch Drill Machine GSB 500', 'Hardware & Tools', 'Bosch', 'Piece', null, null, '8467', 18, 2400, 3150, 2950, 2900, 3, 5, 3, 'S-10'],
    ['Century Plywood 18mm 8x4', 'Plywood', 'Century', 'Sheet', null, null, '4412', 18, 2650, 3200, 3000, 2950, 15, 70, 0, 'G-5'],
];
$P = [];
foreach ($catalog as $i => [$name, $c, $b, $unit, $alt, $af, $hsn, $gst, $pp, $rp, $wp, $cp, $min, $gq, $sq, $rack]) {
    $pid = Db::insert('products', ['company_id' => $cid, 'sku' => sprintf('KHS-%03d', $i + 1), 'barcode' => '89012' . str_pad((string) ($i + 1), 8, '0', STR_PAD_LEFT),
        'name' => $name, 'category_id' => $cat($c), 'brand_id' => $brand($b), 'unit' => $unit, 'alt_unit' => $alt, 'alt_factor' => $af, 'hsn' => $hsn, 'gst_rate' => $gst,
        'purchase_price' => $pp, 'retail_price' => $rp, 'wholesale_price' => $wp, 'contractor_price' => $cp, 'min_stock' => $min, 'rack' => $rack]);
    if ($gq) Stock::move($cid, $pid, $wh['godown'], $gq, 'opening', $pid, $uid('store'), $pp, 'Opening stock');
    if ($sq) Stock::move($cid, $pid, $wh['showroom'], $sq, 'opening', $pid, $uid('store'), $pp, 'Opening stock');
    Db::exec("UPDATE stock_ledger SET created_at = ? WHERE ref_type = 'opening' AND ref_id = ?", [$ago(120, '09:00:00'), $pid]);
    $P[$name] = Db::one('SELECT * FROM products WHERE id = ?', [$pid]);
}
$p = fn(string $n) => $P[$n] ?? throw new RuntimeException("No product $n");

$vend = [];
foreach ([['Shree Cement Agency', 'Rakesh Agarwal', '9811001001', '07AAKFS1234L1Z5', 'Najafgarh, Delhi', 30, 0],
          ['Rang Mahal Traders (Asian Paints)', 'Sanjay Bansal', '9811001002', '07AAGFR5678M1Z2', 'Kirti Nagar, Delhi', 21, 18500],
          ['Bright Electricals (Havells)', 'Amit Jain', '9811001003', '07AACFB4321K1Z9', 'Bhagirath Palace, Delhi', 30, 0],
          ['Jal Pipes & Fittings', 'Harish Kumar', '9811001004', '07AABFJ8765N1Z1', 'Mundka, Delhi', 15, 0],
          ['Tile Point Distributors', 'Mohit Sethi', '9811001005', '06AAEFT2468P1Z3', 'Gurugram', 30, 0]] as [$n, $cp, $m, $g, $city, $cd, $ob]) {
    $vend[$n] = Db::insert('vendors', ['company_id' => $cid, 'name' => $n, 'contact_person' => $cp, 'mobile' => $m, 'gstin' => $g, 'city' => $city, 'credit_days' => $cd, 'opening_balance' => $ob]);
}
$v = fn(string $prefix) => (int) current(array_filter($vend, fn($k) => str_starts_with($k, $prefix), ARRAY_FILTER_USE_KEY));

$cust = [];
foreach ([['Sharma Builders', 'contractor', '9812002001', '07AAQFS1111A1Z1', 'Sector 12, Dwarka', 300000, 30, 0],
          ['Mehta Constructions', 'contractor', '9812002002', '07AAJFM2222B1Z2', 'Uttam Nagar', 200000, 30, 45000],
          ['Gupta Hardware Store', 'wholesale', '9812002003', '07AABPG3333C1Z3', 'Palam', 150000, 15, 0],
          ['Singh Electricals', 'wholesale', '9812002004', null, 'Janakpuri', 80000, 15, 12000],
          ['Agarwal Interiors', 'contractor', '9812002005', '07AAIFA5555E1Z5', 'Rajouri Garden', 120000, 30, 0],
          ['Ramesh Kumar', 'retail', '9812002006', null, 'Sector 7, Dwarka', 20000, 7, 0],
          ['Kapoor Residency (Site)', 'contractor', '9812002007', null, 'Bijwasan', 100000, 30, 68000]] as [$n, $t, $m, $g, $addr, $cl, $cd, $ob]) {
    $cust[$n] = Db::insert('customers', ['company_id' => $cid, 'name' => $n, 'type' => ['retail' => 'Retail Customer', 'wholesale' => 'Wholesale Customer', 'contractor' => 'Contractor'][$t] ?? $t, 'price_type' => $t, 'code' => (string) (count($cust ?? []) + 1), 'mobile' => $m, 'gstin' => $g, 'address' => $addr, 'city' => 'New Delhi',
        'credit_limit' => $cl, 'credit_days' => $cd, 'opening_balance' => $ob, 'recovery_user_id' => $uid('recovery')]);
}
$c = fn(string $prefix) => (int) current(array_filter($cust, fn($k) => str_starts_with($k, $prefix), ARRAY_FILTER_USE_KEY));

// ───────────────────────── helpers ─────────────────────────
$calc = function (array $items, string $priceCol) use ($p): array {
    $lines = []; $sub = 0; $disc = 0; $tax = 0;
    foreach ($items as $it) {
        $pr = $p($it[0]); $q = (float) $it[1]; $rate = (float) ($it[3] ?? $pr[$priceCol]); $dp = (float) ($it[2] ?? 0); $gst = (float) $pr['gst_rate'];
        $g = $q * $rate; $d = round($g * $dp / 100, 2); $t = round(($g - $d) * $gst / 100, 2);
        $lines[] = ['product_id' => (int) $pr['id'], 'qty' => $q, 'rate' => $rate, 'discount_pct' => $dp, 'gst_rate' => $gst, 'amount' => round($g - $d + $t, 2)];
        $sub += $g; $disc += $d; $tax += $t;
    }
    return [$lines, round($sub, 2), round($disc, 2), round($tax, 2), round($sub - $disc + $tax)];
};
$approveAll = function (string $type, int $id, ?string $rejectReason = null) use ($cid, $U): void {
    for ($i = 0; $i < 3; $i++) {
        $a = Db::one("SELECT * FROM approvals WHERE company_id = ? AND doc_type = ? AND doc_id = ? AND status = 'pending' ORDER BY level LIMIT 1", [$cid, $type, $id]);
        if (!$a) return;
        $who = $a['approver_role'] === 'owner' ? $U['owner'] : $U['manager'];
        Approvals::act($who, (int) $a['id'], $rejectReason === null, $rejectReason);
    }
};
$backdate = function (string $table, int $id, string $when, array $dateCols = []) {
    $set = ['created_at = ?']; $pa = [$when];
    foreach ($dateCols as $col) { $set[] = "$col = ?"; $pa[] = substr($when, 0, 10); }
    $pa[] = $id;
    Db::exec("UPDATE $table SET " . implode(', ', $set) . ' WHERE id = ?', $pa);
};
$stamp = function (string $refType, int $id, string $when) use ($cid) {
    Db::exec('UPDATE stock_ledger SET created_at = ? WHERE company_id = ? AND ref_type = ? AND ref_id = ?', [$when, $cid, $refType, $id]);
    Db::exec('UPDATE approvals SET created_at = ?, acted_at = IF(acted_at IS NULL, NULL, DATE_ADD(?, INTERVAL 2 HOUR)) WHERE company_id = ? AND doc_type = ? AND doc_id = ?', [$when, $when, $cid, $refType === 'sale' ? 'sales_invoice' : $refType, $id]);
};

$po = function (string $by, int $vendorId, array $items, int $daysAgo, string $target) use ($cid, $calc, $U, $wh, $approveAll, $backdate, $ago, $day): int {
    [$lines, $sub, , $tax, $total] = $calc($items, 'purchase_price');
    $id = Db::insert('purchase_orders', ['company_id' => $cid, 'po_no' => DocNo::next($cid, 'PO'), 'vendor_id' => $vendorId, 'warehouse_id' => $wh['godown'],
        'order_date' => $day($daysAgo), 'expected_date' => $day(max(0, $daysAgo - 3)), 'subtotal' => $sub, 'tax' => $tax, 'total' => $total, 'created_by' => $U[$by]['id'],
        'notes' => 'Deliver to godown, unloading by vendor']);
    foreach ($lines as $l) Db::insert('purchase_order_items', ['po_id' => $id, 'product_id' => $l['product_id'], 'qty' => $l['qty'], 'rate' => $l['rate'], 'gst_rate' => $l['gst_rate'], 'amount' => $l['amount']]);
    $backdate('purchase_orders', $id, $ago($daysAgo, '10:30:00'));
    if ($target === 'draft') return $id;
    Docs::submitPo($cid, $id, $U[$by]);
    if ($target === 'pending') return $id;
    if ($target === 'rejected') { $approveAll('purchase_order', $id, 'Rate is higher than last purchase, renegotiate'); return $id; }
    $approveAll('purchase_order', $id);
    if (in_array($target, ['ordered', 'receive'], true)) Db::update('purchase_orders', $id, ['status' => 'ordered']);
    Db::exec('UPDATE approvals SET created_at = ?, acted_at = ? WHERE company_id = ? AND doc_type = ? AND doc_id = ?', [$ago($daysAgo, '10:31:00'), $ago($daysAgo, '12:10:00'), $cid, 'purchase_order', $id]);
    return $id;
};
$grn = function (int $poId, float $share, array $damaged, int $daysAgo, bool $approve, string $billNo) use ($cid, $U, $backdate, $approveAll, $stamp, $ago, $day): int {
    $po = Db::one('SELECT * FROM purchase_orders WHERE id = ?', [$poId]);
    $items = Db::all('SELECT * FROM purchase_order_items WHERE po_id = ?', [$poId]);
    $sub = 0; $tax = 0; $rows = [];
    foreach ($items as $i => $it) {
        $q = round(((float) $it['qty'] - (float) $it['received_qty']) * $share);
        $bad = (float) ($damaged[$i] ?? 0);
        $q = max(0, $q - $bad);
        $rows[] = [$it, $q, $bad];
        $sub += $q * (float) $it['rate']; $tax += $q * (float) $it['rate'] * (float) $it['gst_rate'] / 100;
    }
    $id = Db::insert('grns', ['company_id' => $cid, 'grn_no' => DocNo::next($cid, 'GRN'), 'po_id' => $poId, 'vendor_id' => $po['vendor_id'], 'warehouse_id' => $po['warehouse_id'],
        'bill_no' => $billNo, 'bill_date' => $day($daysAgo), 'subtotal' => round($sub, 2), 'tax' => round($tax, 2), 'total' => round($sub + $tax), 'created_by' => $U['store']['id'],
        'notes' => array_filter($damaged) ? 'Some bags torn / broken in transit — kept aside for return' : null]);
    foreach ($rows as [$it, $q, $bad]) {
        Db::insert('grn_items', ['grn_id' => $id, 'po_item_id' => $it['id'], 'product_id' => $it['product_id'], 'qty' => $q, 'damaged_qty' => $bad, 'rate' => $it['rate'],
            'gst_rate' => $it['gst_rate'], 'amount' => round($q * $it['rate'] * (1 + $it['gst_rate'] / 100), 2)]);
    }
    $backdate('grns', $id, $ago($daysAgo, '15:00:00'));
    Docs::submitGrn($cid, $id, $U['store']);
    if ($approve) { $approveAll('grn', $id); $stamp('grn', $id, $ago($daysAgo, '16:00:00')); Db::exec('UPDATE grns SET approved_at = ? WHERE id = ?', [$ago($daysAgo, '16:30:00'), $id]); }
    return $id;
};
$sale = function (string $by, ?int $customerId, array $items, string $mode, int $daysAgo, string $time, array $opt = []) use ($cid, $calc, $U, $wh, $approveAll, $backdate, $stamp, $ago, $day): int {
    $type = $customerId ? Db::value('SELECT type FROM customers WHERE id = ?', [$customerId]) : 'retail';
    [$lines, $sub, $disc, $tax, $total] = $calc($items, $type . '_price');
    $doc = $opt['doc_type'] ?? 'invoice';
    $id = Db::insert('sales_docs', ['company_id' => $cid, 'doc_type' => $doc, 'doc_no' => DocNo::next($cid, $doc === 'quotation' ? 'QT' : 'INV'), 'customer_id' => $customerId,
        'customer_name' => $customerId ? null : ($opt['name'] ?? 'Walk-in customer'), 'customer_mobile' => $customerId ? null : ($opt['mobile'] ?? null),
        'price_type' => $type, 'warehouse_id' => $opt['wh'] ?? $wh['godown'], 'payment_mode' => $mode, 'doc_date' => $day($daysAgo),
        'subtotal' => $sub, 'discount' => $disc, 'tax' => $tax, 'total' => $total, 'max_discount_pct' => max(array_column($lines, 'discount_pct')),
        'needs_delivery' => !empty($opt['delivery']) ? 1 : 0, 'delivery_address' => $opt['address'] ?? null, 'notes' => $opt['notes'] ?? null, 'created_by' => $U[$by]['id']]);
    foreach ($lines as $l) Db::insert('sales_doc_items', ['doc_id' => $id, 'product_id' => $l['product_id'], 'qty' => $l['qty'], 'rate' => $l['rate'], 'discount_pct' => $l['discount_pct'], 'gst_rate' => $l['gst_rate'], 'amount' => $l['amount']]);
    $when = $ago($daysAgo, $time);
    $backdate('sales_docs', $id, $when);
    if ($doc === 'quotation') { if (empty($opt['draft'])) Db::update('sales_docs', $id, ['status' => 'final']); return $id; }
    if (!empty($opt['draft'])) return $id;
    Docs::submitInvoice($cid, $id, $U[$by]);
    if (empty($opt['leave_pending'])) $approveAll('sales_invoice', $id);
    $s = Db::one('SELECT * FROM sales_docs WHERE id = ?', [$id]);
    if ($s['status'] === 'final') {
        $credit = $customerId ? (int) Db::value('SELECT credit_days FROM customers WHERE id = ?', [$customerId]) : 0;
        Db::exec('UPDATE sales_docs SET doc_date = ?, due_date = ? WHERE id = ?', [$day($daysAgo), date('Y-m-d', strtotime($day($daysAgo) . " +$credit days")), $id]);
        Db::exec('UPDATE payments SET pay_date = ?, created_at = ? WHERE invoice_id = ?', [$day($daysAgo), $when, $id]);
        Db::exec('UPDATE deliveries SET created_at = ? WHERE invoice_id = ?', [$when, $id]);
    }
    $stamp('sale', $id, $when);
    return $id;
};
$receipt = function (string $by, int $customerId, float $amount, string $mode, int $daysAgo, ?string $ref = null) use ($cid, $U, $ago, $day): int {
    $id = Db::insert('payments', ['company_id' => $cid, 'pay_no' => DocNo::next($cid, 'RCT'), 'direction' => 'in', 'party_type' => 'customer', 'party_id' => $customerId,
        'amount' => $amount, 'mode' => $mode, 'reference' => $ref, 'pay_date' => $day($daysAgo), 'status' => 'approved', 'created_by' => $U[$by]['id'], 'created_at' => $ago($daysAgo, '17:00:00')]);
    Db::insert('recovery_followups', ['company_id' => $cid, 'customer_id' => $customerId, 'assigned_to' => $U[$by]['id'], 'outcome' => 'paid', 'promise_amount' => $amount,
        'note' => 'Received ₹' . number_format($amount) . " ($mode)", 'created_by' => $U[$by]['id'], 'created_at' => $ago($daysAgo, '17:00:00')]);
    \App\Services\Erp\Tally::enqueue($cid, 'payment', $id, 'Receipt');
    return $id;
};

// ───────────────────────── purchase ─────────────────────────
$po1 = $po('purchase', $v('Shree'), [['UltraTech OPC 53 Cement 50kg', 300], ['ACC PPC Cement 50kg', 200]], 13, 'receive');
$grn($po1, 1.0, [4, 0], 11, true, 'SCA/2611/118');
$po2 = $po('purchase', $v('Rang'), [['Asian Paints Apex Ultima 20L', 10], ['Asian Paints Royale 4L', 20], ['Birla White Wall Putty 40kg', 40], ['Berger Primer 10L', 10]], 10, 'receive');
$grn($po2, 0.6, [], 8, true, 'RMT/4471');
$po3 = $po('purchase', $v('Bright'), [['Havells Wire 2.5 sqmm (90m)', 20], ['Havells MCB 32A', 50], ['Polycab Wire 1.5 sqmm (90m)', 15]], 6, 'receive');
$grn($po3, 1.0, [], 3, false, 'BE/2026/889');
$po('purchase', $v('Jal'), [['Supreme PVC Pipe 4" (6m)', 40], ['Astral CPVC Pipe 1" (3m)', 60], ['Ashirvad CPVC Elbow 1"', 500]], 2, 'pending');
$po('purchase', $v('Tile'), [['Kajaria Floor Tile 2x2 ft', 150], ['Somany Wall Tile 1x1.5 ft', 120]], 1, 'pending');
$po('purchase', $v('Shree'), [['UltraTech OPC 53 Cement 50kg', 200]], 4, 'ordered');
$po('head', $v('Bright'), [['Crompton Ceiling Fan 1200mm', 10], ['Philips LED Bulb 9W', 100]], 0, 'draft');
$po('purchase', $v('Rang'), [['Asian Paints Apex Ultima 20L', 30]], 9, 'rejected');

// ───────────────────────── sales (last 14 days) ─────────────────────────
// Old credit bills (show up as overdue in aging: 0–30, 31–60, 61–90 days)
$sale('sales', $c('Kapoor'), [['Kajaria Floor Tile 2x2 ft', 60], ['Cera Wash Basin', 4]], 'credit', 110, '12:00:00');
$sale('head', $c('Mehta'), [['UltraTech OPC 53 Cement 50kg', 60], ['Birla White Wall Putty 40kg', 15]], 'credit', 75, '12:30:00');
$sale('sales', $c('Singh'), [['Havells MCB 32A', 20], ['Anchor Roma Switch 6A', 100]], 'credit', 40, '16:00:00');
$sale('sales', $c('Gupta'), [['Philips LED Bulb 9W', 60], ['Hettich Auto Hinge', 40]], 'credit', 28, '15:00:00');

$walkins = [['Rahul (walk-in)', '9899100101'], ['Mrs. Kaur', '9899100102'], ['Electrician Sonu', '9899100103'], ['Plumber Javed', '9899100104'], ['Mr. Bhatia', '9899100105']];
$retailBaskets = [
    [['Anchor Roma Switch 6A', 20], ['Philips LED Bulb 9W', 6], ['Havells MCB 32A', 2]],
    [['Asian Paints Royale 4L', 2], ['Birla White Wall Putty 40kg', 3]],
    [['Ashirvad CPVC Elbow 1"', 30], ['Astral CPVC Pipe 1" (3m)', 4], ['Fevicol SH 1kg', 1]],
    [['Godrej Ultra Lock', 1], ['Hettich Auto Hinge', 8]],
    [['Crompton Ceiling Fan 1200mm', 1], ['Philips LED Bulb 9W', 4]],
];
$modes = ['cash', 'upi', 'upi', 'cash', 'card'];
for ($d = 13; $d >= 0; $d--) {
    if (date('N', strtotime("-$d days")) == 7) continue;
    for ($n = 0; $n < 2; $n++) {
        $k = ($d + $n) % 5;
        [$nm, $mb] = $walkins[$k];
        $sale('sales', null, $retailBaskets[$k], $modes[($d + $n) % 5], $d, sprintf('%02d:%02d:00', 11 + $n * 4, 10 + $d), ['name' => $nm, 'mobile' => $mb, 'wh' => $wh['showroom']]);
    }
}
// Credit / contractor bills
$i1 = $sale('sales', $c('Sharma'), [['UltraTech OPC 53 Cement 50kg', 120], ['Tata Tiscon TMT 12mm', 1500]], 'credit', 12, '12:30:00', ['delivery' => true, 'address' => 'Plot 22, Sector 12 Dwarka (site)']);
$i2 = $sale('head', $c('Mehta'), [['ACC PPC Cement 50kg', 80, 3], ['Kamdhenu TMT 8mm', 400], ['Century Plywood 18mm 8x4', 20]], 'credit', 9, '13:10:00', ['delivery' => true, 'address' => 'Mehta site, Uttam Nagar']);
$i3 = $sale('sales', $c('Gupta'), [['Anchor Roma Switch 6A', 200], ['Havells MCB 32A', 30], ['Philips LED Bulb 9W', 100]], 'credit', 7, '16:20:00');
$i4 = $sale('sales', $c('Agarwal'), [['Asian Paints Apex Ultima 20L', 4, 6], ['Asian Paints Royale 4L', 8, 6], ['Birla White Wall Putty 40kg', 20]], 'credit', 5, '11:40:00', ['delivery' => true, 'address' => 'B-14 Rajouri Garden']);
$i5 = $sale('sales', $c('Singh'), [['Havells Wire 2.5 sqmm (90m)', 6], ['Polycab Wire 1.5 sqmm (90m)', 4]], 'credit', 3, '15:05:00');
$i6 = $sale('sales', $c('Kapoor'), [['Kajaria Floor Tile 2x2 ft', 120], ['Hindware Wall-hung WC', 2], ['Jaquar Basin Mixer', 2]], 'credit', 2, '12:00:00', ['delivery' => true, 'address' => 'Kapoor Residency, Bijwasan']);
$i7 = $sale('sales', $c('Ramesh'), [['Crompton Ceiling Fan 1200mm', 3], ['Philips LED Bulb 9W', 10]], 'upi', 1, '18:15:00', ['delivery' => true, 'address' => 'House 118, Sector 7 Dwarka']);
$sale('sales', $c('Sharma'), [['UltraTech OPC 53 Cement 50kg', 150, 4]], 'credit', 0, '11:20:00', ['leave_pending' => true, 'delivery' => true, 'address' => 'Plot 22, Sector 12 Dwarka (site)', 'notes' => 'Urgent — slab casting tomorrow']);
$sale('head', $c('Singh'), [['Havells MCB 32A', 40, 12]], 'credit', 0, '12:45:00', ['leave_pending' => true]);
$sale('sales', $c('Ramesh'), [['Jaquar Basin Mixer', 1]], 'cash', 0, '13:00:00', ['draft' => true]);
$sale('sales', $c('Agarwal'), [['Somany Wall Tile 1x1.5 ft', 40], ['Cera Wash Basin', 3]], 'credit', 1, '17:30:00', ['doc_type' => 'quotation']);
$sale('head', $c('Mehta'), [['Tata Tiscon TMT 12mm', 3000, 2], ['UltraTech OPC 53 Cement 50kg', 300, 3]], 'credit', 0, '10:15:00', ['doc_type' => 'quotation', 'notes' => 'Valid for 7 days, rates subject to steel market']);

// ───────────────────────── deliveries ─────────────────────────
$dl = fn(int $inv) => Db::one('SELECT * FROM deliveries WHERE invoice_id = ?', [$inv]);
$deliverDone = function (int $inv, int $daysAgo, string $receiver) use ($dl, $cid, $U, $ago): void {
    $d = $dl($inv); if (!$d) return;
    Db::update('deliveries', (int) $d['id'], ['assigned_to' => $U['delivery']['id'], 'vehicle' => 'DL1LZ 4521', 'status' => 'delivered', 'otp_verified' => 1, 'receiver_name' => $receiver,
        'delivered_at' => $ago($daysAgo, '16:40:00'), 'lat' => 28.5921, 'lng' => 77.046]);
    Db::exec('UPDATE sales_doc_items SET delivered_qty = qty WHERE doc_id = ?', [$inv]);
    for ($r = 0; $r < 5; $r++) foreach (Db::all("SELECT * FROM tasks WHERE company_id = ? AND ref_type = 'delivery' AND ref_id = ? AND status IN ('not_started','in_progress')", [$cid, $d['id']]) as $t) {
        \App\Controllers\TaskController::setStatus($t, 'done', (int) $U['delivery']['id']);
        Db::exec('UPDATE tasks SET completed_at = ?, created_at = ? WHERE id = ?', [$ago($daysAgo, '16:40:00'), $ago($daysAgo, '12:00:00'), $t['id']]);
    }
};
$deliverDone($i1, 12, 'Site supervisor Mukesh');
$deliverDone($i2, 9, 'Mr. Mehta');
$deliverDone($i4, 5, 'Agarwal ji');
if ($d = $dl($i6)) Db::update('deliveries', (int) $d['id'], ['assigned_to' => $U['delivery']['id'], 'vehicle' => 'DL1LZ 4521', 'status' => 'dispatched']);
if ($d = $dl($i7)) Db::update('deliveries', (int) $d['id'], ['assigned_to' => $U['delivery']['id'], 'status' => 'failed', 'failure_reason' => 'Customer not at home, phone switched off']);
$extra = Docs::createDelivery($cid, $i3, $uid('store'), $uid('delivery'));
Db::update('deliveries', $extra, ['status' => 'packed', 'vehicle' => 'Tempo HR55 1180']);

// ───────────────────────── money ─────────────────────────
$receipt('recovery', $c('Sharma'), 60000, 'bank', 6, 'NEFT UTIBN26112');
$receipt('accounts', $c('Mehta'), 45000, 'cheque', 4, 'Chq 004521 HDFC');
$receipt('recovery', $c('Gupta'), 15000, 'upi', 2, 'UPI 4471882');
$receipt('recovery', $c('Singh'), 12000, 'cash', 1);
foreach ($cust as $id) Ledger::reallocate('sales_docs', 'customer_id', $cid, (int) $id);

$vpay = function (int $vendorId, float $amt, string $mode, int $daysAgo, bool $approve) use ($cid, $U, $approveAll, $ago, $day): void {
    $id = Db::insert('payments', ['company_id' => $cid, 'pay_no' => DocNo::next($cid, 'PAY'), 'direction' => 'out', 'party_type' => 'vendor', 'party_id' => $vendorId, 'amount' => $amt,
        'mode' => $mode, 'reference' => $mode === 'bank' ? 'NEFT ' . random_int(100000, 999999) : null, 'pay_date' => $day($daysAgo), 'status' => 'pending_approval',
        'created_by' => $U['accounts']['id'], 'created_at' => $ago($daysAgo, '14:00:00')]);
    Docs::submitVendorPayment($cid, $id, $U['accounts']);
    if ($approve) $approveAll('vendor_payment', $id);
};
$vpay($v('Shree'), 100000, 'bank', 7, true);
$vpay($v('Rang'), 18500, 'bank', 5, true);
$vpay($v('Shree'), 60000, 'bank', 0, false);

// Recovery follow-ups + promises (auto tasks)
$follow = function (int $customerId, string $outcome, int $daysAgo, ?string $note, ?int $promiseIn = null, ?float $amt = null) use ($cid, $U, $ago): void {
    $id = Db::insert('recovery_followups', ['company_id' => $cid, 'customer_id' => $customerId, 'assigned_to' => $U['recovery']['id'], 'outcome' => $outcome,
        'promise_date' => $promiseIn !== null ? date('Y-m-d', strtotime("+$promiseIn days")) : null, 'promise_amount' => $amt, 'note' => $note,
        'created_by' => $U['recovery']['id'], 'created_at' => $ago($daysAgo, '12:30:00')]);
    if ($outcome === 'promise') Docs::promiseTask($cid, $id, (int) $U['recovery']['id']);
};
$follow($c('Kapoor'), 'called', 6, 'Owner said payment after bank loan disbursal');
$follow($c('Kapoor'), 'promise', 1, 'Will send cheque', 2, 40000);
$follow($c('Mehta'), 'promise', 2, 'Part payment on Monday', 0, 50000);
$follow($c('Agarwal'), 'no_response', 1, 'Called twice, not picking');
$follow($c('Singh'), 'dispute', 3, 'Says 2 coils were short in delivery — checking');
$follow($c('Gupta'), 'called', 0, 'Reminded, will pay this week');

// Returns
$rs = function (int $inv, int $itemIdx, float $q, string $reason, bool $approve) use ($cid, $U, $approveAll): void {
    $s = Db::one('SELECT * FROM sales_docs WHERE id = ?', [$inv]);
    $it = Db::all('SELECT * FROM sales_doc_items WHERE doc_id = ? ORDER BY id', [$inv])[$itemIdx];
    $rate = round((float) $it['rate'] * (1 - (float) $it['discount_pct'] / 100), 2);
    $amt = round($q * $rate * (1 + (float) $it['gst_rate'] / 100), 2);
    $id = Db::insert('returns_docs', ['company_id' => $cid, 'return_no' => DocNo::next($cid, 'SR'), 'type' => 'sales', 'ref_id' => $inv, 'party_id' => $s['customer_id'],
        'warehouse_id' => $s['warehouse_id'], 'total' => round($amt), 'reason' => $reason, 'created_by' => $U['store']['id']]);
    Db::insert('return_items', ['return_id' => $id, 'product_id' => $it['product_id'], 'ref_item_id' => $it['id'], 'qty' => $q, 'rate' => $rate, 'gst_rate' => $it['gst_rate'], 'amount' => $amt, 'restock' => 1]);
    Docs::submitReturn($cid, $id, $U['store']);
    if ($approve) $approveAll('sales_return', $id);
};
$rs($i2, 2, 2, 'Two sheets had damaged edges', true);
$rs($i4, 1, 1, 'Wrong shade picked by painter', false);
$prId = Db::insert('returns_docs', ['company_id' => $cid, 'return_no' => DocNo::next($cid, 'PR'), 'type' => 'purchase', 'ref_id' => Db::value('SELECT id FROM grns WHERE po_id = ?', [$po1]),
    'party_id' => $v('Shree'), 'warehouse_id' => $wh['godown'], 'total' => round(4 * 330 * 1.28), 'reason' => 'Torn bags received in GRN', 'created_by' => $U['store']['id']]);
Stock::move($cid, (int) $p('UltraTech OPC 53 Cement 50kg')['id'], $wh['godown'], 4, 'adjustment', null, $uid('store'), 0, 'Torn bags kept aside for vendor return');
Db::insert('return_items', ['return_id' => $prId, 'product_id' => $p('UltraTech OPC 53 Cement 50kg')['id'], 'qty' => 4, 'rate' => 330, 'gst_rate' => 28, 'amount' => round(4 * 330 * 1.28, 2), 'restock' => 1]);
Docs::submitReturn($cid, $prId, $U['store']);
$approveAll('purchase_return', $prId);

// Expenses
foreach ([['Transport / freight', 1800, 'cash', 'Tempo — Sharma site', 'store', 12, true], ['Labour', 1200, 'cash', 'Unloading 500 bags', 'store', 11, true],
          ['Tea & refreshment', 340, 'cash', 'Chai wala', 'sales', 6, true], ['Electricity', 14850, 'bank', 'BSES bill Oct', 'accounts', 5, true],
          ['Fuel', 2500, 'upi', 'Delivery tempo diesel', 'delivery', 3, true], ['Shop maintenance', 4200, 'upi', 'AC service — showroom', 'manager', 2, true],
          ['Labour', 900, 'cash', 'Loading — Kapoor site', 'store', 0, false], ['Stationery', 650, 'cash', 'Bill books + printer roll', 'accounts', 0, false]] as [$cat2, $amt, $mode, $to, $by, $da, $ok]) {
    $id = Db::insert('expenses', ['company_id' => $cid, 'exp_no' => DocNo::next($cid, 'EXP'), 'exp_date' => $day($da), 'category' => $cat2, 'amount' => $amt, 'mode' => $mode,
        'paid_to' => $to, 'created_by' => $U[$by]['id'], 'created_at' => $ago($da, '13:00:00')]);
    Docs::submitExpense($cid, $id, $U[$by]);
    if ($ok) $approveAll('expense', $id);
}

// Complaints & maintenance
$tk = function (string $type, ?int $customerId, ?int $inv, string $title, string $desc, string $prio, string $assign, string $status, int $daysAgo, ?string $res = null) use ($cid, $U, $ago): void {
    $id = Db::insert('complaints', ['company_id' => $cid, 'ticket_no' => DocNo::next($cid, $type === 'maintenance' ? 'MNT' : 'CMP'), 'type' => $type, 'customer_id' => $customerId,
        'invoice_id' => $inv, 'title' => $title, 'description' => $desc, 'priority' => $prio, 'assigned_to' => $U[$assign]['id'], 'status' => $status, 'resolution' => $res,
        'created_by' => $U['sales']['id'], 'created_at' => $ago($daysAgo, '11:00:00'), 'resolved_at' => $res ? $ago(max(0, $daysAgo - 1), '15:00:00') : null]);
    $tid = Db::insert('tasks', ['company_id' => $cid, 'title' => ($type === 'maintenance' ? 'Maintenance: ' : 'Complaint: ') . $title, 'description' => $desc, 'assigned_to' => $U[$assign]['id'],
        'assigned_by' => $U['sales']['id'], 'priority' => $prio, 'status' => $res ? 'done' : ($status === 'in_progress' ? 'in_progress' : 'not_started'),
        'due_at' => $ago(max(0, $daysAgo - 1), '18:00:00'), 'completed_at' => $res ? $ago(max(0, $daysAgo - 1), '15:00:00') : null, 'source' => 'erp', 'ref_type' => 'complaint', 'ref_id' => $id,
        'created_at' => $ago($daysAgo, '11:00:00')]);
    Db::update('complaints', $id, ['task_id' => $tid]);
};
$tk('customer', $c('Singh'), $i5, '2 coils short in delivery', 'Customer says 4 coils received instead of 6 Havells wire', 'high', 'store', 'in_progress', 3);
$tk('customer', $c('Ramesh'), $i7, 'Fan making noise', 'Crompton fan wobbling after installation — needs replacement or technician', 'medium', 'sales', 'open', 1);
$tk('customer', $c('Agarwal'), $i4, 'Paint shade mismatch', 'Royale shade not matching earlier lot', 'medium', 'manager', 'resolved', 5, 'Exchanged 1 tin with same batch, customer satisfied');
$tk('maintenance', null, null, 'Showroom AC not cooling', 'Unit 2 above counter, gas leak suspected', 'high', 'store', 'open', 0);
$tk('maintenance', null, null, 'Godown shutter jammed', 'Shutter motor needs servicing', 'medium', 'store', 'resolved', 8, 'Mechanic replaced spring, ₹1,800');

// Stock: transfer + adjustment (shows in movements)
foreach ([['UltraTech OPC 53 Cement 50kg', 40], ['Asian Paints Royale 4L', 6], ['Philips LED Bulb 9W', 50]] as [$n, $q]) {
    Stock::move($cid, (int) $p($n)['id'], $wh['godown'], -$q, 'transfer', null, $uid('store'), 0, 'Transfer Godown → Showroom');
    Stock::move($cid, (int) $p($n)['id'], $wh['showroom'], $q, 'transfer', null, $uid('store'), 0, 'Transfer Godown → Showroom');
}
Stock::move($cid, (int) $p('Philips LED Bulb 9W')['id'], $wh['showroom'], -3, 'adjustment', null, $uid('manager'), 0, 'Breakage — 3 bulbs');
Db::exec("UPDATE stock_ledger SET created_at = ? WHERE company_id = ? AND ref_type IN ('transfer','adjustment') AND created_at > NOW() - INTERVAL 1 HOUR", [$ago(2, '10:00:00'), $cid]);

// ───────────────────────── tasks, attendance, leave, goals, chat ─────────────────────────
$staff = ['manager', 'purchase', 'store', 'sales', 'accounts', 'recovery', 'delivery', 'hr', 'head'];
$geo = Db::value('SELECT id FROM geofences WHERE company_id = ? LIMIT 1', [$cid]) ?: Db::insert('geofences', ['company_id' => $cid, 'name' => 'Keshav showroom', 'lat' => 28.5921, 'lng' => 77.0460, 'radius_m' => 200]);
Db::insert('geofences', ['company_id' => $cid, 'name' => 'Godown', 'lat' => 28.6100, 'lng' => 77.0300, 'radius_m' => 250]);
$taskTitles = ['manager' => ['Check daily cash closing', 'Review stock report'], 'purchase' => ['Get rate list from vendors', 'Follow up PO dispatch'], 'store' => ['Godown stock count', 'Arrange rack S-6'],
               'sales' => ['Call 5 contractor leads', 'Update display shelf'], 'accounts' => ['Bank reconciliation', 'GST data to CA'], 'recovery' => ['Visit Kapoor site for payment', 'Call overdue customers'],
               'delivery' => ['Vehicle cleaning & check', 'Fuel log update'], 'hr' => ['Attendance review', 'Salary sheet'], 'head' => ['Weekly sales review', 'Contractor meet']];
for ($i = 21; $i >= 1; $i--) {
    $t = strtotime("-$i days");
    if (date('N', $t) == 7) continue;
    $date = date('Y-m-d', $t);
    foreach ($staff as $k) {
        if (mt_rand(0, 19) === 0) continue; // occasional absence
        $late = mt_rand(0, 8) === 0;
        $field = in_array($k, ['delivery', 'recovery'], true) && mt_rand(0, 1);
        $in = $late ? '10:' . str_pad((string) mt_rand(5, 40), 2, '0', STR_PAD_LEFT) : '09:' . str_pad((string) mt_rand(10, 35), 2, '0', STR_PAD_LEFT);
        Db::insert('attendance', ['company_id' => $cid, 'user_id' => $uid($k), 'work_date' => $date, 'mode' => $field ? 'field' : 'office', 'status' => $field ? 'field' : ($late ? 'late' : 'present'),
            'punch_in_at' => "$date $in:00", 'punch_out_at' => "$date 19:" . str_pad((string) mt_rand(0, 45), 2, '0', STR_PAD_LEFT) . ':00', 'worked_minutes' => mt_rand(540, 600),
            'late_minutes' => $late ? 40 : 0, 'punch_in_place' => $field ? 'Field' : 'Keshav showroom']);
        foreach ($taskTitles[$k] as $j => $title) {
            if (mt_rand(0, 2) === 0) continue;
            $due = "$date 18:00:00";
            $done = date('Y-m-d H:i:s', strtotime($due) + (mt_rand(0, 9) < 8 ? -mt_rand(600, 20000) : mt_rand(1800, 20000)));
            Db::insert('tasks', ['company_id' => $cid, 'title' => $title, 'assigned_to' => $uid($k), 'assigned_by' => $k === 'manager' ? $owner['id'] : $uid('manager'), 'status' => 'done',
                'due_at' => $due, 'created_at' => "$date 09:30:00", 'completed_at' => $done, 'manager_rating' => mt_rand(3, 5)]);
        }
    }
}
$today = date('Y-m-d');
foreach ([['manager', '09:20'], ['purchase', '09:35'], ['store', '09:05'], ['sales', '09:40'], ['accounts', '09:30'], ['recovery', '10:25'], ['delivery', '09:15'], ['hr', '09:45']] as [$k, $tm]) {
    if (strtotime("$today $tm") > time()) continue;
    Db::insert('attendance', ['company_id' => $cid, 'user_id' => $uid($k), 'work_date' => $today, 'mode' => $k === 'recovery' ? 'field' : 'office',
        'status' => $k === 'recovery' ? 'late' : 'present', 'punch_in_at' => "$today $tm:00", 'punch_in_place' => 'Keshav showroom', 'late_minutes' => $k === 'recovery' ? 55 : 0,
        'punch_in_lat' => 28.5921, 'punch_in_lng' => 77.046, 'punch_in_geofence_id' => $geo]);
}
Db::insert('location_pings', ['company_id' => $cid, 'user_id' => $uid('delivery'), 'lat' => 28.5750, 'lng' => 77.0310, 'activity' => 'moving', 'place_label' => 'On way to Bijwasan', 'recorded_at' => date('Y-m-d H:i:s', time() - 300)]);
Db::insert('location_pings', ['company_id' => $cid, 'user_id' => $uid('recovery'), 'lat' => 28.6210, 'lng' => 77.0550, 'activity' => 'visit', 'place_label' => 'Mehta site', 'recorded_at' => date('Y-m-d H:i:s', time() - 900)]);

$open = [
    ['Call Sharma Builders about next slab order', 'sales', 'high', 'in_progress', '+3 hours'], ['Update Asian Paints price list', 'purchase', 'medium', 'not_started', '+1 day'],
    ['Physical count — cement & TMT', 'store', 'high', 'not_started', '+5 hours'], ['GST return data to CA', 'accounts', 'high', 'in_progress', '-3 hours'],
    ['Visit Kapoor Residency for cheque', 'recovery', 'high', 'not_started', '+1 day'], ['Prepare salary sheet', 'hr', 'medium', 'in_progress', '+2 days'],
    ['Plan Diwali offer display', 'head', 'medium', 'not_started', '+2 days'], ['Approve new rack layout', 'manager', 'low', 'not_started', '+3 days'],
    ['Send rate quote to Agarwal Interiors', 'sales', 'medium', 'not_started', '-1 day'],
];
foreach ($open as [$title, $k, $pr, $st, $due]) {
    $tid = Db::insert('tasks', ['company_id' => $cid, 'title' => $title, 'assigned_to' => $uid($k), 'assigned_by' => $k === 'manager' ? $owner['id'] : $uid('manager'), 'priority' => $pr, 'status' => $st,
        'due_at' => date('Y-m-d H:i:s', strtotime($due)), 'remind_before_min' => 60, 'started_at' => $st === 'in_progress' ? date('Y-m-d H:i:s', strtotime('-2 hours')) : null]);
    if ($title === 'GST return data to CA') foreach (['Sales register', 'Purchase register', 'Bank statement', 'Expense bills'] as $j => $l) Db::insert('task_checklist', ['task_id' => $tid, 'label' => $l, 'is_done' => $j < 2 ? 1 : 0, 'sort_order' => $j]);
}
$rr = fn(array $r) => Db::insert('recurring_rules', $r + ['company_id' => $cid, 'created_by' => $owner['id']]);
$rr(['title' => 'Daily cash closing', 'assignee_id' => $uid('accounts'), 'frequency' => 'daily', 'weekdays' => '1,2,3,4,5,6', 'due_time' => '19:30:00', 'proof_type' => 'photo']);
$rr(['title' => 'Showroom opening checklist', 'assignee_id' => $uid('sales'), 'frequency' => 'daily', 'weekdays' => '1,2,3,4,5,6', 'due_time' => '10:00:00', 'checklist_json' => json_encode(['Lights & AC on', 'Display cleaned', 'Billing printer ready'])]);
$rr(['title' => 'Weekly godown stock count', 'assignee_id' => $uid('store'), 'frequency' => 'weekly', 'weekdays' => '1', 'due_time' => '17:00:00', 'proof_type' => 'photo']);
$rr(['title' => 'Monthly vendor statement match', 'assignee_id' => $uid('accounts'), 'frequency' => 'monthly', 'month_day' => 5, 'due_time' => '17:00:00', 'proof_type' => 'file']);

$g1 = Db::insert('goals', ['company_id' => $cid, 'title' => 'November sales ₹25 lakh', 'scope' => 'company', 'period_label' => 'Nov 2026', 'target_value' => 2500000, 'current_value' => 1640000, 'unit' => '₹', 'status' => 'on_track']);
Db::insert('goals', ['company_id' => $cid, 'parent_id' => $g1, 'title' => 'Contractor sales ₹15 lakh', 'scope' => 'department', 'department_id' => $dept('Sales'), 'target_value' => 1500000, 'current_value' => 980000, 'unit' => '₹', 'status' => 'on_track']);
Db::insert('goals', ['company_id' => $cid, 'title' => 'Recover ₹5 lakh old udhari', 'scope' => 'department', 'department_id' => $dept('Accounts'), 'target_value' => 500000, 'current_value' => 132000, 'unit' => '₹', 'status' => 'at_risk']);
Db::insert('goals', ['company_id' => $cid, 'title' => 'Zero delivery complaints', 'scope' => 'department', 'department_id' => $dept('Delivery'), 'target_value' => 100, 'current_value' => 92, 'unit' => '%', 'status' => 'on_track']);

$casual = (int) Db::value("SELECT id FROM leave_types WHERE company_id = ? AND code = 'casual'", [$cid]);
Db::insert('requests', ['company_id' => $cid, 'user_id' => $uid('sales'), 'approver_id' => $uid('manager'), 'type' => 'leave', 'leave_type_id' => $casual,
    'from_date' => date('Y-m-d', strtotime('+5 days')), 'to_date' => date('Y-m-d', strtotime('+6 days')), 'days' => 2, 'handover_to' => $uid('head'), 'reason' => 'Sister\'s wedding']);
Db::insert('requests', ['company_id' => $cid, 'user_id' => $uid('delivery'), 'approver_id' => $uid('manager'), 'type' => 'regularise', 'from_date' => date('Y-m-d', strtotime('-3 days')), 'reason' => 'Was at Bijwasan site early morning, forgot to punch']);
Db::insert('requests', ['company_id' => $cid, 'user_id' => $uid('store'), 'approver_id' => $uid('manager'), 'type' => 'leave', 'leave_type_id' => $casual, 'status' => 'approved',
    'from_date' => date('Y-m-d', strtotime('-10 days')), 'to_date' => date('Y-m-d', strtotime('-10 days')), 'days' => 1, 'reason' => 'Personal work']);

$room = Db::insert('chat_rooms', ['company_id' => $cid, 'name' => 'Keshav team', 'is_group' => 1, 'created_by' => $owner['id'], 'last_message_at' => date('Y-m-d H:i:s', time() - 1200)]);
foreach (array_merge(['owner'], $staff) as $k) Db::insert('chat_members', ['room_id' => $room, 'user_id' => $U[$k]['id']]);
foreach ([['owner', 'Sab log aaj ka cash aur stock closing time pe karna 🙏', 7200], ['manager', 'Ji sir. Sharma site ka 150 bag order approval pe hai', 5400],
          ['delivery', 'Kapoor Residency material nikal gaya, 30 min me pahunch jayenge', 1800], ['recovery', 'Mehta ji ne Monday ko 50k bola hai', 1200]] as [$k, $msg, $s]) {
    Db::insert('chat_messages', ['room_id' => $room, 'user_id' => $U[$k]['id'], 'body' => $msg, 'created_at' => date('Y-m-d H:i:s', time() - $s)]);
}
foreach ([['Diwali offer — 5% off on paints', 'Instagram', 'live', null, 32000, 140], ['Contractor meet invite', 'WhatsApp', 'scheduled', null, null, null],
          ['New tiles range reel', 'Instagram', 'production', 'Shooting', null, null], ['Google reviews drive', 'Google', 'idea', null, null, null]] as [$t, $ch, $st, $sub, $reach, $leads]) {
    Db::insert('campaigns', ['company_id' => $cid, 'title' => $t, 'channel' => $ch, 'stage' => $st, 'sub_status' => $sub, 'owner_id' => $uid('head'),
        'go_live_on' => date('Y-m-d', strtotime('+' . mt_rand(1, 6) . ' days')), 'reach' => $reach, 'leads' => $leads]);
}

// Approval / notification timestamps of "today" items stay as now; older audit rows get rough dates
Db::exec("UPDATE workflow_runs SET started_at = COALESCE((SELECT created_at FROM sales_docs WHERE sales_docs.id = workflow_runs.ref_id AND workflow_runs.ref_type = 'sales_invoice'), started_at) WHERE company_id = ?", [$cid]);

$settings = json_decode((string) Db::value('SELECT erp_settings FROM companies WHERE id = ?', [$cid]), true) ?: [];
$settings['demo_loaded'] = date('c');
Db::update('companies', $cid, ['erp_settings' => json_encode($settings)]);
echo 'Demo data loaded: ' . count($P) . ' products, ' . Db::value("SELECT COUNT(*) FROM sales_docs WHERE company_id = ?", [$cid]) . " sales docs\n";
