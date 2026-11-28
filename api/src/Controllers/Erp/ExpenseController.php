<?php
namespace App\Controllers\Erp;

use App\Core\{Db, HttpError};
use App\Services\Erp\{Approvals, Audit, DocNo, Docs, Perm};
use App\Services\{Notifier, Upload};

/**
 * Expenses, Zoho-Expense style:
 *  • anyone records an expense (bill photo) or a mileage claim (km × vehicle rate; km from odometer or GPS)
 *  • Accounts VERIFIES (bill is genuine) → the boss APPROVES (approval matrix)
 *  • advances given to staff, expenses settle against them; trips are pre-approved with a budget, then expenses are added against the trip
 */
final class ExpenseController extends Base
{
    private function canVerify(): bool { return Perm::can($this->user, 'accounts', true) || Perm::can($this->user, 'expenses', true); }
    private function seesAll(): bool { return Perm::can($this->user, 'expenses') || Perm::can($this->user, 'accounts'); }

    /** GET /erp/expenses?status=&user_id=&trip_id=&kind= */
    public function index(): array
    {
        $where = ['e.company_id = ?']; $p = [$this->cid];
        if (!$this->seesAll()) { $where[] = 'e.created_by = ?'; $p[] = $this->uid(); }
        foreach (['status' => 'e.status', 'category' => 'e.category', 'kind' => 'e.kind'] as $k => $c) if ($v = $this->q($k)) { $where[] = "$c = ?"; $p[] = $v; }
        if ($u = $this->q('user_id')) { $where[] = 'e.created_by = ?'; $p[] = (int) $u; }
        if ($t = $this->q('trip_id')) { $where[] = 'e.trip_id = ?'; $p[] = (int) $t; }
        if ($f = $this->q('from')) { $where[] = 'e.exp_date >= ?'; $p[] = $f; }
        if ($t = $this->q('to')) { $where[] = 'e.exp_date <= ?'; $p[] = $t; }
        $rows = Db::all("SELECT e.*, u.name AS created_by_name, vu.name AS verified_by_name, t.trip_no, t.destination, v.name AS vehicle_name,
                                (SELECT COUNT(*) FROM attachments a WHERE a.entity_type = 'expense_bill' AND a.entity_id = e.id) AS bills
                           FROM expenses e LEFT JOIN users u ON u.id = e.created_by LEFT JOIN users vu ON vu.id = e.verified_by
                           LEFT JOIN trips t ON t.id = e.trip_id LEFT JOIN vehicles v ON v.id = e.vehicle_id
                          WHERE " . implode(' AND ', $where) . ' ORDER BY e.id DESC LIMIT 1000', $p);
        return ['categories' => $this->categoryNames(), 'items' => $rows, 'can_verify' => $this->canVerify(),
                'to_verify' => $this->canVerify() ? (int) Db::value("SELECT COUNT(*) FROM expenses WHERE company_id = ? AND status = 'pending_verification'", [$this->cid]) : 0];
    }

    public function show(): array
    {
        $e = Db::one('SELECT e.*, u.name AS created_by_name, vu.name AS verified_by_name, v.name AS vehicle_name, t.trip_no, t.destination
                         FROM expenses e LEFT JOIN users u ON u.id = e.created_by LEFT JOIN users vu ON vu.id = e.verified_by
                         LEFT JOIN vehicles v ON v.id = e.vehicle_id LEFT JOIN trips t ON t.id = e.trip_id WHERE e.id = ? AND e.company_id = ?', [$this->param('id'), $this->cid]);
        if (!$e || (!$this->seesAll() && (int) $e['created_by'] !== $this->uid())) throw HttpError::notFound();
        $e['files'] = $this->files('expense_bill', (int) $e['id']);
        $e['approvals'] = Approvals::history($this->cid, 'expense', (int) $e['id']);
        $e['history'] = Audit::history($this->cid, 'expense', (int) $e['id']);
        return $e;
    }

    private function categoryNames(): array
    {
        return array_column(Db::all('SELECT name FROM expense_categories WHERE company_id = ? ORDER BY sort, name', [$this->cid]), 'name');
    }

    /** POST /erp/expense-categories {name} — the "add category" button */
    public function addCategory(): array
    {
        $name = mb_substr(trim((string) $this->req->input('name')), 0, 60);
        if ($name === '') throw HttpError::badRequest('Write the category name');
        if (!$this->canVerify() && !$this->isManager()) throw HttpError::forbidden('Ask accounts to add a category');
        Db::exec('INSERT IGNORE INTO expense_categories (company_id, name, sort) VALUES (?, ?, 50)', [$this->cid, $name]);
        return $this->categoryNames();
    }

    /**
     * POST /erp/expenses (multipart) — expense: {exp_date, category, amount, merchant, invoice_no, mode, paid_to_type, paid_to, paid_to_id, reimburse, trip_id, notes} + bills[]
     * mileage: {kind: mileage, exp_date, vehicle_id, odo_start, odo_end | km, gps_km, notes} + bills[] (odometer photos)
     */
    public function store(): array
    {
        $kind = $this->req->input('kind') === 'mileage' ? 'mileage' : 'expense';
        $date = $this->req->input('exp_date') ?: date('Y-m-d');
        if ($date > date('Y-m-d')) throw HttpError::badRequest('Expense date cannot be in the future');
        $tripId = $this->req->int('trip_id') ?: null;
        if ($tripId) {
            $trip = Db::one('SELECT * FROM trips WHERE id = ? AND company_id = ?', [$tripId, $this->cid]);
            if (!$trip || (int) $trip['user_id'] !== $this->uid() && !$this->canVerify()) throw HttpError::badRequest('Unknown trip');
            if ($trip['status'] !== 'approved') throw HttpError::badRequest('This trip is not approved yet');
        }
        $extra = [];
        if ($kind === 'mileage') {
            $veh = Db::one('SELECT * FROM vehicles WHERE id = ? AND company_id = ? AND is_active = 1', [$this->req->int('vehicle_id'), $this->cid]);
            if (!$veh) throw HttpError::badRequest('Choose the vehicle');
            $s = $this->req->int('odo_start'); $e = $this->req->int('odo_end');
            $km = $s && $e ? $e - $s : (float) $this->req->input('km');
            if ($s && $e && $e <= $s) throw HttpError::badRequest('End meter reading must be more than the start reading');
            if ($km <= 0) throw HttpError::badRequest('Enter the km (meter readings or km travelled)');
            if ($km > 600) throw HttpError::badRequest('More than 600 km in a day — please check the readings');
            $amount = round($km * (float) $veh['rate_per_km'], 2);
            $category = 'Fuel / mileage';
            $extra = ['vehicle_id' => (int) $veh['id'], 'km' => $km, 'rate_per_km' => $veh['rate_per_km'], 'odo_start' => $s ?: null, 'odo_end' => $e ?: null,
                      'gps_km' => $this->req->input('gps_km') !== null && $this->req->input('gps_km') !== '' ? (float) $this->req->input('gps_km') : null, 'reimburse' => 1];
        } else {
            $in = $this->req->require(['category', 'amount']);
            $amount = round((float) $in['amount'], 2);
            $category = mb_substr($in['category'], 0, 60);
            $ptype = in_array($this->req->input('paid_to_type'), ['employee', 'vendor', 'other'], true) ? $this->req->input('paid_to_type') : 'other';
            $paidTo = $this->req->input('paid_to');
            $pid = $this->req->int('paid_to_id') ?: null;
            if ($pid && $ptype === 'employee') $paidTo = Db::value('SELECT name FROM users WHERE id = ? AND company_id = ?', [$pid, $this->cid]) ?: $paidTo;
            if ($pid && $ptype === 'vendor') $paidTo = Db::value('SELECT COALESCE(business_name, name) FROM vendors WHERE id = ? AND company_id = ?', [$pid, $this->cid]) ?: $paidTo;
            $extra = ['merchant' => $this->req->input('merchant') ?: null, 'invoice_no' => $this->req->input('invoice_no') ?: null, 'paid_to_type' => $ptype,
                      'paid_to_id' => $pid, 'paid_to' => $paidTo ?: null, 'reimburse' => $this->req->input('reimburse') === null ? 1 : (filter_var($this->req->input('reimburse'), FILTER_VALIDATE_BOOLEAN) ? 1 : 0)];
        }
        if ($amount <= 0) throw HttpError::badRequest('Amount must be more than zero');
        $bills = Upload::list($this->req->files, 'bills');
        if ($kind === 'expense' && !$bills && $amount > 200) throw HttpError::badRequest('Attach the bill / receipt photo (needed above ₹200)');
        $id = Db::insert('expenses', $extra + ['company_id' => $this->cid, 'exp_no' => DocNo::next($this->cid, 'EXP'), 'exp_date' => $date, 'kind' => $kind,
            'category' => $category, 'amount' => $amount, 'trip_id' => $tripId,
            'mode' => in_array($this->req->input('mode'), ['cash', 'upi', 'bank', 'card', 'cheque'], true) ? $this->req->input('mode') : 'cash',
            'notes' => $this->req->input('notes'), 'created_by' => $this->uid(), 'status' => 'pending_verification']);
        foreach ($bills as $f) Upload::save($f, $this->cid, $this->uid(), 'expense_bill', $id);
        Audit::log($this->cid, $this->uid(), 'expense', $id, 'created', ['amount' => $amount, 'kind' => $kind]);
        if ($this->canVerify()) {
            // entered by accounts → counts as verified
            $this->markVerified($id, 'Entered by accounts');
        } else {
            foreach ($this->verifiers() as $u) Notifier::notify($this->cid, $u, 'approval_needed', 'Expense to verify', "{$this->user['name']} · $category · ₹" . number_format($amount), null, null);
        }
        $this->req->params['id'] = $id;
        return $this->show();
    }

    private function verifiers(): array
    {
        $ids = [];
        foreach (Db::all('SELECT u.id, u.role, r.perms FROM users u LEFT JOIN erp_roles r ON r.id = u.erp_role_id WHERE u.company_id = ? AND u.is_active = 1', [$this->cid]) as $u) {
            $p = json_decode((string) $u['perms'], true) ?: [];
            if (($p['accounts'] ?? '') === 'edit' || ($p['expenses'] ?? '') === 'edit') $ids[] = (int) $u['id'];
        }
        return $ids ?: array_map('intval', array_column(Db::all("SELECT id FROM users WHERE company_id = ? AND role = 'manager' AND is_active = 1", [$this->cid]), 'id'));
    }

    private function markVerified(int $id, ?string $note): void
    {
        Db::update('expenses', $id, ['status' => 'pending_approval', 'verified_by' => $this->uid(), 'verified_at' => date('Y-m-d H:i:s'), 'verify_note' => $note]);
        Audit::log($this->cid, $this->uid(), 'expense', $id, 'verified', ['note' => $note]);
        Docs::submitExpense($this->cid, $id, $this->user);
    }

    /** POST /erp/expenses/{id}/verify {ok: bool, note} (+ voice_note) — accounts checks the bill is genuine */
    public function verify(): array
    {
        if (!$this->canVerify()) throw HttpError::forbidden('Only accounts can verify expenses');
        $e = Db::one('SELECT * FROM expenses WHERE id = ? AND company_id = ?', [$this->param('id'), $this->cid]);
        if (!$e) throw HttpError::notFound();
        if ($e['status'] !== 'pending_verification') throw HttpError::badRequest('Already verified');
        if ((int) $e['created_by'] === $this->uid() && !$this->isManager()) throw HttpError::badRequest('Someone else has to verify your own expense');
        $ok = filter_var($this->req->input('ok'), FILTER_VALIDATE_BOOLEAN);
        $note = trim((string) $this->req->input('note'));
        $voice = $this->req->files['voice_note'] ?? null;
        if ($voice) { Upload::save($voice, $this->cid, $this->uid(), 'expense_bill', (int) $e['id'], 'voice', $this->req->int('voice_duration')); if ($note === '') $note = '🎤 Voice note'; }
        if (!$ok && $note === '') throw HttpError::badRequest('Write or record why the bill is not accepted');
        if ($ok) $this->markVerified((int) $e['id'], $note ?: null);
        else {
            Db::update('expenses', (int) $e['id'], ['status' => 'rejected', 'verified_by' => $this->uid(), 'verified_at' => date('Y-m-d H:i:s'), 'verify_note' => mb_substr($note, 0, 250)]);
            Audit::log($this->cid, $this->uid(), 'expense', (int) $e['id'], 'not verified', ['note' => $note]);
        }
        Notifier::notify($this->cid, (int) $e['created_by'], $ok ? 'approval_done' : 'approval_rejected', $ok ? "Expense verified — sent to boss" : 'Expense not accepted', "{$e['exp_no']} · ₹" . number_format((float) $e['amount']) . ($note ? " · $note" : ''), null, null);
        return $this->show();
    }

    /* ───────── vehicles & mileage ───────── */

    public function vehicles(): array
    {
        return Db::all('SELECT v.*, u.name AS user_name FROM vehicles v LEFT JOIN users u ON u.id = v.user_id WHERE v.company_id = ? ORDER BY v.is_active DESC, v.name', [$this->cid]);
    }

    /** POST /erp/vehicles {name, type, reg_no, rate_per_km, user_id} · PATCH /erp/vehicles/{id} */
    public function saveVehicle(): array
    {
        if (!$this->canVerify() && !$this->isManager()) throw HttpError::forbidden();
        $d = $this->req->only(['name', 'type', 'reg_no', 'rate_per_km', 'user_id', 'is_active']);
        if (isset($d['type']) && !in_array($d['type'], ['bike', 'scooter', 'car', 'tempo', 'other'], true)) $d['type'] = 'other';
        if (array_key_exists('user_id', $d)) $d['user_id'] = $d['user_id'] ? (int) $d['user_id'] : null;
        if (isset($d['rate_per_km'])) $d['rate_per_km'] = max(0, (float) $d['rate_per_km']);
        if (isset($d['reg_no'])) $d['reg_no'] = strtoupper(trim($d['reg_no']));
        if ($id = $this->param('id')) Db::update('vehicles', $id, $d, $this->cid);
        else { if (empty($d['name'])) throw HttpError::badRequest('Vehicle name is required'); Db::insert('vehicles', $d + ['company_id' => $this->cid]); }
        return $this->vehicles();
    }

    /** GET /erp/mileage/gps?date= — km travelled that day from the app's location tracking */
    public function gpsKm(): array
    {
        $date = $this->q('date', date('Y-m-d'));
        $uid = $this->q('user_id') && $this->seesAll() ? (int) $this->q('user_id') : $this->uid();
        return ['date' => $date, 'km' => self::kmFromPings($uid, $date)];
    }

    public static function kmFromPings(int $uid, string $date): float
    {
        $pts = Db::all('SELECT lat, lng, accuracy_m FROM location_pings WHERE user_id = ? AND recorded_at >= ? AND recorded_at < DATE_ADD(?, INTERVAL 1 DAY) ORDER BY recorded_at', [$uid, $date, $date]);
        $km = 0.0; $prev = null;
        foreach ($pts as $p) {
            if ($p['accuracy_m'] !== null && (int) $p['accuracy_m'] > 100) continue;   // skip poor GPS fixes
            if ($prev) {
                $d = self::haversine((float) $prev['lat'], (float) $prev['lng'], (float) $p['lat'], (float) $p['lng']);
                if ($d >= 0.05 && $d < 50) $km += $d;   // ignore jitter < 50 m and jumps > 50 km
            }
            $prev = $p;
        }
        return round($km * 1.15, 1); // roads are ~15% longer than straight lines between pings
    }

    private static function haversine(float $a1, float $o1, float $a2, float $o2): float
    {
        $r = 6371; $dl = deg2rad($a2 - $a1); $dn = deg2rad($o2 - $o1);
        $x = sin($dl / 2) ** 2 + cos(deg2rad($a1)) * cos(deg2rad($a2)) * sin($dn / 2) ** 2;
        return 2 * $r * asin(min(1, sqrt($x)));
    }

    /* ───────── advances & employee wallet ───────── */

    /** GET /erp/advances?user_id= — advances / settlements + each person's balance */
    public function advances(): array
    {
        $all = $this->seesAll();
        $where = ['a.company_id = ?']; $p = [$this->cid];
        if (!$all) { $where[] = 'a.user_id = ?'; $p[] = $this->uid(); }
        elseif ($u = $this->q('user_id')) { $where[] = 'a.user_id = ?'; $p[] = (int) $u; }
        $rows = Db::all('SELECT a.*, u.name AS user_name, c.name AS created_by_name, t.trip_no FROM advances a JOIN users u ON u.id = a.user_id
                           LEFT JOIN users c ON c.id = a.created_by LEFT JOIN trips t ON t.id = a.trip_id WHERE ' . implode(' AND ', $where) . ' ORDER BY a.id DESC LIMIT 500', $p);
        $people = $all ? array_map('intval', array_column(Db::all('SELECT DISTINCT user_id FROM advances WHERE company_id = ? UNION SELECT DISTINCT created_by FROM expenses WHERE company_id = ? AND reimburse = 1', [$this->cid, $this->cid]), 'user_id')) : [$this->uid()];
        $wallets = [];
        foreach ($people as $u) $wallets[] = self::wallet($this->cid, $u);
        usort($wallets, fn($a, $b) => abs($b['balance']) <=> abs($a['balance']));
        return ['items' => $rows, 'wallets' => array_values(array_filter($wallets, fn($w) => $w['advances'] > 0 || $w['claims'] > 0))];
    }

    /** Money between shop and employee: + they hold shop money (advance not yet spent), − shop owes them (claims more than advances). */
    public static function wallet(int $cid, int $uid): array
    {
        $adv = (float) Db::value("SELECT COALESCE(SUM(amount),0) FROM advances WHERE company_id = ? AND user_id = ? AND type = 'advance'", [$cid, $uid]);
        $paid = (float) Db::value("SELECT COALESCE(SUM(amount),0) FROM advances WHERE company_id = ? AND user_id = ? AND type = 'settlement'", [$cid, $uid]);
        $back = (float) Db::value("SELECT COALESCE(SUM(amount),0) FROM advances WHERE company_id = ? AND user_id = ? AND type = 'returned'", [$cid, $uid]);
        $claims = (float) Db::value("SELECT COALESCE(SUM(amount),0) FROM expenses WHERE company_id = ? AND created_by = ? AND reimburse = 1 AND status = 'approved'", [$cid, $uid]);
        $pending = (float) Db::value("SELECT COALESCE(SUM(amount),0) FROM expenses WHERE company_id = ? AND created_by = ? AND reimburse = 1 AND status IN ('pending_verification','pending_approval')", [$cid, $uid]);
        $bal = round($adv + $paid - $back - $claims, 2);
        return ['user_id' => $uid, 'name' => Db::value('SELECT name FROM users WHERE id = ?', [$uid]), 'advances' => $adv, 'claims' => $claims, 'pending_claims' => $pending,
                'settled' => $paid, 'returned' => $back, 'balance' => $bal,
                'label' => $bal > 0.5 ? 'Has ₹' . number_format($bal) . ' of shop money' : ($bal < -0.5 ? 'Shop owes ₹' . number_format(-$bal) : 'All settled')];
    }

    /** POST /erp/advances {user_id, type: advance|settlement|returned, amount, adv_date, mode, reference, trip_id, notes} — accounts only */
    public function storeAdvance(): array
    {
        if (!$this->canVerify()) throw HttpError::forbidden('Only accounts can record advances');
        $in = $this->req->require(['user_id', 'amount']);
        $this->assertSameCompanyUser((int) $in['user_id']);
        $amt = round((float) $in['amount'], 2);
        if ($amt <= 0) throw HttpError::badRequest('Amount must be more than zero');
        $type = in_array($this->req->input('type'), ['advance', 'settlement', 'returned'], true) ? $this->req->input('type') : 'advance';
        $id = Db::insert('advances', ['company_id' => $this->cid, 'adv_no' => DocNo::next($this->cid, 'ADV'), 'user_id' => (int) $in['user_id'], 'type' => $type, 'amount' => $amt,
            'adv_date' => $this->req->input('adv_date') ?: date('Y-m-d'), 'mode' => in_array($this->req->input('mode'), ['cash', 'upi', 'bank', 'card', 'cheque'], true) ? $this->req->input('mode') : 'cash',
            'reference' => $this->req->input('reference') ?: null, 'trip_id' => $this->req->int('trip_id') ?: null, 'notes' => $this->req->input('notes') ?: null, 'created_by' => $this->uid()]);
        Audit::log($this->cid, $this->uid(), 'advance', $id, $type, ['amount' => $amt, 'user' => (int) $in['user_id']]);
        if ($type === 'advance') Notifier::notify($this->cid, (int) $in['user_id'], 'task_assigned', 'Advance ₹' . number_format($amt) . ' given to you', 'Add your expenses with bills against it in the app', null, null);
        return self::wallet($this->cid, (int) $in['user_id']);
    }

    /* ───────── trips (pre-approved) ───────── */

    public function trips(): array
    {
        $where = ['t.company_id = ?']; $p = [$this->cid];
        if (!$this->seesAll()) { $where[] = 't.user_id = ?'; $p[] = $this->uid(); }
        $rows = Db::all("SELECT t.*, u.name AS user_name,
                                (SELECT COALESCE(SUM(amount),0) FROM expenses e WHERE e.trip_id = t.id AND e.status <> 'rejected') AS spent,
                                (SELECT COALESCE(SUM(amount),0) FROM advances a WHERE a.trip_id = t.id AND a.type = 'advance') AS advance
                           FROM trips t JOIN users u ON u.id = t.user_id WHERE " . implode(' AND ', $where) . ' ORDER BY t.id DESC LIMIT 300', $p);
        foreach ($rows as &$r) { $r['budget'] = json_decode((string) $r['budget'], true) ?: []; $r['approvals'] = Approvals::history($this->cid, 'trip', (int) $r['id']); }
        return $rows;
    }

    /** POST /erp/trips {user_id?, purpose, destination, from_date, to_date, budget:{travel, hotel, food, local, other}, notes} */
    public function storeTrip(): array
    {
        $in = $this->req->require(['purpose', 'destination', 'from_date', 'to_date']);
        $uid = $this->req->int('user_id') ?: $this->uid();
        if ($uid !== $this->uid() && !$this->isManager() && !$this->canVerify()) throw HttpError::forbidden();
        $this->assertSameCompanyUser($uid);
        if ($in['to_date'] < $in['from_date']) throw HttpError::badRequest('Return date is before start date');
        $budget = [];
        foreach ((array) $this->req->input('budget', []) as $k => $v) if (in_array($k, ['travel', 'hotel', 'food', 'local', 'other'], true) && (float) $v > 0) $budget[$k] = round((float) $v, 2);
        $total = round(array_sum($budget), 2);
        if ($total <= 0) throw HttpError::badRequest('Enter the expected budget (travel / hotel / food…)');
        $id = Db::insert('trips', ['company_id' => $this->cid, 'trip_no' => DocNo::next($this->cid, 'TRP'), 'user_id' => $uid, 'purpose' => mb_substr($in['purpose'], 0, 200),
            'destination' => mb_substr($in['destination'], 0, 120), 'from_date' => $in['from_date'], 'to_date' => $in['to_date'], 'budget' => json_encode($budget), 'budget_total' => $total,
            'notes' => $this->req->input('notes') ?: null, 'created_by' => $this->uid()]);
        Audit::log($this->cid, $this->uid(), 'trip', $id, 'created', ['budget' => $total]);
        $name = Db::value('SELECT name FROM users WHERE id = ?', [$uid]);
        if (Approvals::start($this->cid, 'trip', $id, ['trip' => $total], "Trip {$in['destination']} · $name · ₹" . number_format($total), $total, $this->user)) {
            Db::update('trips', $id, ['status' => 'pending_approval']);
        } else Docs::tripApproved($this->cid, $id, $this->uid());
        return Db::one('SELECT * FROM trips WHERE id = ?', [$id]);
    }

    /** POST /erp/trips/{id}/complete — trip over, no more expenses */
    public function completeTrip(): array
    {
        $t = Db::one('SELECT * FROM trips WHERE id = ? AND company_id = ?', [$this->param('id'), $this->cid]);
        if (!$t || ((int) $t['user_id'] !== $this->uid() && !$this->seesAll())) throw HttpError::notFound();
        if ($t['status'] !== 'approved') throw HttpError::badRequest('Only an approved trip can be closed');
        Db::update('trips', (int) $t['id'], ['status' => 'completed']);
        return ['ok' => true];
    }
}
