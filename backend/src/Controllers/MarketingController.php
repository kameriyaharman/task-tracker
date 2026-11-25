<?php
namespace App\Controllers;

use App\Core\{Controller, Db, HttpError};
use App\Services\Upload;

/**
 * Marketing / field sales: 30-day plan (calendar), visits with geo-tagged photo, evening report
 * (km, orders, billed, self rating) and monthly targets (amount, km, visits, category-wise) with daily achievement & stars.
 */
final class MarketingController extends Controller
{
    private function who(): int
    {
        $u = (int) ($this->req->query['user_id'] ?? $this->req->input('user_id') ?? 0);
        if ($u && $u !== $this->uid()) {
            if (!$this->isManager()) throw HttpError::forbidden();
            $this->assertSameCompanyUser($u);
            return $u;
        }
        return $this->uid();
    }

    /* ───────── plan (calendar) ───────── */

    /** GET /marketing/plan?user_id=&month=YYYY-MM */
    public function plan(): array
    {
        $uid = $this->who();
        $m = preg_match('/^\d{4}-\d{2}$/', (string) ($this->req->query['month'] ?? '')) ? $this->req->query['month'] : date('Y-m');
        $plans = Db::all('SELECT * FROM field_plans WHERE company_id = ? AND user_id = ? AND plan_date LIKE ? ORDER BY plan_date, id', [$this->cid, $uid, "$m%"]);
        $visits = Db::all("SELECT visit_date, COUNT(*) AS n, COALESCE(SUM(expected_amount),0) AS expected FROM field_visits WHERE company_id = ? AND user_id = ? AND visit_date LIKE ? GROUP BY visit_date", [$this->cid, $uid, "$m%"]);
        $daily = Db::all('SELECT report_date, km_run, gps_km, orders_count, orders_amount, billed_amount, self_rating FROM field_daily WHERE company_id = ? AND user_id = ? AND report_date LIKE ?', [$this->cid, $uid, "$m%"]);
        return ['month' => $m, 'user_id' => $uid, 'plans' => $plans, 'visits' => $visits, 'daily' => $daily];
    }

    /** POST /marketing/plan {user_id?, plan_date, area, who_to_meet, target_amount, notes} or {items:[…]} for many days at once */
    public function savePlan(): array
    {
        $uid = $this->who();
        $items = $this->req->input('items');
        $items = is_array($items) ? $items : [$this->req->only(['plan_date', 'area', 'who_to_meet', 'target_amount', 'notes'])];
        $n = 0;
        foreach ($items as $it) {
            $d = (string) ($it['plan_date'] ?? '');
            $area = trim((string) ($it['area'] ?? ''));
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) || $area === '') continue;
            Db::insert('field_plans', ['company_id' => $this->cid, 'user_id' => $uid, 'plan_date' => $d, 'area' => mb_substr($area, 0, 160),
                'who_to_meet' => mb_substr(trim((string) ($it['who_to_meet'] ?? '')), 0, 255) ?: null, 'target_amount' => (float) ($it['target_amount'] ?? 0) ?: null,
                'notes' => mb_substr(trim((string) ($it['notes'] ?? '')), 0, 255) ?: null, 'created_by' => $this->uid()]);
            $n++;
        }
        if (!$n) throw HttpError::badRequest('Write the date and the area / place');
        return ['added' => $n];
    }

    public function deletePlan(): array
    {
        $p = Db::one('SELECT * FROM field_plans WHERE id = ? AND company_id = ?', [$this->param('id'), $this->cid]);
        if (!$p || ((int) $p['user_id'] !== $this->uid() && !$this->isManager())) throw HttpError::notFound();
        Db::exec('DELETE FROM field_plans WHERE id = ?', [$p['id']]);
        return ['deleted' => true];
    }

    /* ───────── visits ───────── */

    /** GET /marketing/visits?user_id=&date= */
    public function visits(): array
    {
        $uid = $this->who();
        $date = $this->req->query['date'] ?? date('Y-m-d');
        $rows = Db::all('SELECT v.*, (SELECT a.id FROM attachments a WHERE a.entity_type = \'field_visit\' AND a.entity_id = v.id ORDER BY a.id LIMIT 1) AS photo_id
                           FROM field_visits v WHERE v.company_id = ? AND v.user_id = ? AND v.visit_date = ? ORDER BY v.visited_at', [$this->cid, $uid, $date]);
        return $rows;
    }

    /** POST /marketing/visits (multipart) {party_name, person, phone, address, kind, expected_amount, outcome, lat, lng, notes} + photo (taken at the site) */
    public function addVisit(): array
    {
        $in = $this->req->require(['party_name']);
        $photo = Upload::list($this->req->files, 'photo');
        if (!$photo) throw HttpError::badRequest('Take a photo at the site');
        $lat = $this->req->input('lat'); $lng = $this->req->input('lng');
        if ($lat === null || $lat === '' || $lng === null || $lng === '') throw HttpError::badRequest('Location is needed — turn on GPS and try again');
        $kinds = ['contractor', 'house_owner', 'builder', 'company', 'dealer', 'architect', 'plumber_electrician', 'other'];
        $outs = ['interested', 'quotation', 'order', 'not_interested', 'follow_up'];
        $phone = substr(preg_replace('/\D/', '', (string) $this->req->input('phone')), -10) ?: null;
        $id = Db::insert('field_visits', ['company_id' => $this->cid, 'user_id' => $this->uid(), 'visit_date' => date('Y-m-d'), 'visited_at' => date('Y-m-d H:i:s'),
            'party_name' => mb_substr(trim($in['party_name']), 0, 160), 'person' => $this->req->input('person') ?: null, 'phone' => $phone,
            'address' => $this->req->input('address') ?: null, 'kind' => in_array($this->req->input('kind'), $kinds, true) ? $this->req->input('kind') : 'other',
            'expected_amount' => (float) $this->req->input('expected_amount') ?: null, 'outcome' => in_array($this->req->input('outcome'), $outs, true) ? $this->req->input('outcome') : 'interested',
            'lat' => (float) $lat, 'lng' => (float) $lng, 'notes' => $this->req->input('notes') ?: null,
            'customer_id' => $phone ? (Db::value('SELECT id FROM customers WHERE company_id = ? AND mobile = ?', [$this->cid, $phone]) ?: null) : null]);
        foreach ($photo as $f) Upload::save($f, $this->cid, $this->uid(), 'field_visit', $id);
        Db::insert('location_pings', ['company_id' => $this->cid, 'user_id' => $this->uid(), 'lat' => (float) $lat, 'lng' => (float) $lng, 'activity' => 'visit',
            'place_label' => mb_substr(trim($in['party_name']), 0, 150), 'recorded_at' => date('Y-m-d H:i:s')]);
        return Db::one('SELECT * FROM field_visits WHERE id = ?', [$id]);
    }

    /* ───────── evening report ───────── */

    /** GET /marketing/today?user_id=&date= — what the evening report form needs, pre-filled */
    public function today(): array
    {
        $uid = $this->who();
        $date = $this->req->query['date'] ?? date('Y-m-d');
        $orders = Db::one("SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS amt, COALESCE(SUM(CASE WHEN status = 'final' THEN total END),0) AS billed
                             FROM sales_docs WHERE company_id = ? AND doc_type = 'invoice' AND status <> 'cancelled' AND DATE(created_at) = ?
                              AND (created_by = ? OR customer_id IN (SELECT id FROM customers WHERE sales_user_id = ?))", [$this->cid, $date, $uid, $uid]);
        return [
            'date' => $date,
            'report' => Db::one('SELECT * FROM field_daily WHERE company_id = ? AND user_id = ? AND report_date = ?', [$this->cid, $uid, $date]),
            'visits' => (int) Db::value('SELECT COUNT(*) FROM field_visits WHERE company_id = ? AND user_id = ? AND visit_date = ?', [$this->cid, $uid, $date]),
            'expected' => (float) Db::value('SELECT COALESCE(SUM(expected_amount),0) FROM field_visits WHERE company_id = ? AND user_id = ? AND visit_date = ?', [$this->cid, $uid, $date]),
            'gps_km' => \App\Controllers\Erp\ExpenseController::kmFromPings($uid, $date),
            'orders' => ['count' => (int) $orders['n'], 'amount' => (float) $orders['amt'], 'billed' => (float) $orders['billed']],
            'plan' => Db::all('SELECT area, who_to_meet, target_amount FROM field_plans WHERE company_id = ? AND user_id = ? AND plan_date = ?', [$this->cid, $uid, $date]),
        ];
    }

    /** POST /marketing/daily {report_date, km_run, orders_count, orders_amount, billed_amount, self_rating, notes} — filled every evening before going home */
    public function saveDaily(): array
    {
        $date = $this->req->input('report_date') ?: date('Y-m-d');
        if ($date > date('Y-m-d')) throw HttpError::badRequest('Cannot fill a report for a future day');
        if ($date < date('Y-m-d', strtotime('-2 days')) && !$this->isManager()) throw HttpError::badRequest('Reports older than 2 days can only be added by a manager');
        $rating = $this->req->int('self_rating');
        if ($rating < 1 || $rating > 5) throw HttpError::badRequest('Give yourself a rating for today (1–5 stars)');
        $d = ['km_run' => $this->req->input('km_run') !== '' ? (float) $this->req->input('km_run') : null, 'gps_km' => \App\Controllers\Erp\ExpenseController::kmFromPings($this->uid(), $date),
              'orders_count' => max(0, $this->req->int('orders_count')), 'orders_amount' => max(0, (float) $this->req->input('orders_amount')),
              'billed_amount' => max(0, (float) $this->req->input('billed_amount')), 'self_rating' => $rating, 'notes' => mb_substr(trim((string) $this->req->input('notes')), 0, 500) ?: null,
              'submitted_at' => date('Y-m-d H:i:s')];
        $ex = Db::value('SELECT id FROM field_daily WHERE company_id = ? AND user_id = ? AND report_date = ?', [$this->cid, $this->uid(), $date]);
        if ($ex) Db::update('field_daily', (int) $ex, $d); else Db::insert('field_daily', $d + ['company_id' => $this->cid, 'user_id' => $this->uid(), 'report_date' => $date]);
        return $this->summary();
    }

    /* ───────── targets & achievement ───────── */

    /** PUT-style POST /marketing/targets {user_id, month, amount_target, km_target, visits_target, category_targets:[{category_id, amount}]} — managers */
    public function saveTarget(): array
    {
        if (!$this->isManager()) throw HttpError::forbidden('Only managers set targets');
        $uid = $this->req->int('user_id');
        $this->assertSameCompanyUser($uid);
        $m = (string) $this->req->input('month');
        if (!preg_match('/^\d{4}-\d{2}$/', $m)) throw HttpError::badRequest('Choose the month');
        $cats = [];
        foreach ((array) $this->req->input('category_targets', []) as $c) if (!empty($c['category_id']) && (float) ($c['amount'] ?? 0) > 0) $cats[] = ['category_id' => (int) $c['category_id'], 'amount' => (float) $c['amount']];
        $d = ['amount_target' => max(0, (float) $this->req->input('amount_target')), 'km_target' => max(0, $this->req->int('km_target')), 'visits_target' => max(0, $this->req->int('visits_target')),
              'category_targets' => $cats ? json_encode($cats) : null];
        $ex = Db::value('SELECT id FROM sales_targets WHERE company_id = ? AND user_id = ? AND month = ?', [$this->cid, $uid, $m]);
        if ($ex) Db::update('sales_targets', (int) $ex, $d); else Db::insert('sales_targets', $d + ['company_id' => $this->cid, 'user_id' => $uid, 'month' => $m]);
        $this->req->query['user_id'] = $uid; $this->req->query['month'] = $m;
        return $this->summary();
    }

    /** GET /marketing/summary?user_id=&month= — target vs achieved (month + today), stars */
    public function summary(): array
    {
        $uid = $this->who();
        $m = preg_match('/^\d{4}-\d{2}$/', (string) ($this->req->query['month'] ?? '')) ? $this->req->query['month'] : date('Y-m');
        $t = Db::one('SELECT * FROM sales_targets WHERE company_id = ? AND user_id = ? AND month = ?', [$this->cid, $uid, $m]) ?: ['amount_target' => 0, 'km_target' => 0, 'visits_target' => 0, 'category_targets' => null];
        $cats = json_decode((string) $t['category_targets'], true) ?: [];
        // achieved sales = final bills this month made by them or for customers they handle
        $sales = (float) Db::value("SELECT COALESCE(SUM(total),0) FROM sales_docs WHERE company_id = ? AND doc_type = 'invoice' AND status = 'final' AND doc_date LIKE ?
                                      AND (created_by = ? OR customer_id IN (SELECT id FROM customers WHERE sales_user_id = ?))", [$this->cid, "$m%", $uid, $uid]);
        $km = (float) Db::value('SELECT COALESCE(SUM(COALESCE(km_run, gps_km)),0) FROM field_daily WHERE company_id = ? AND user_id = ? AND report_date LIKE ?', [$this->cid, $uid, "$m%"]);
        $visits = (int) Db::value('SELECT COUNT(*) FROM field_visits WHERE company_id = ? AND user_id = ? AND visit_date LIKE ?', [$this->cid, $uid, "$m%"]);
        foreach ($cats as &$c) {
            $c['name'] = Db::value('SELECT name FROM product_categories WHERE id = ?', [$c['category_id']]);
            $c['achieved'] = (float) Db::value("SELECT COALESCE(SUM(i.amount),0) FROM sales_doc_items i JOIN sales_docs s ON s.id = i.doc_id JOIN products p ON p.id = i.product_id
                                                 WHERE s.company_id = ? AND s.doc_type = 'invoice' AND s.status = 'final' AND s.doc_date LIKE ? AND p.category_id = ?
                                                   AND (s.created_by = ? OR s.customer_id IN (SELECT id FROM customers WHERE sales_user_id = ?))", [$this->cid, "$m%", $c['category_id'], $uid, $uid]);
            $c['pct'] = $c['amount'] > 0 ? (int) round($c['achieved'] * 100 / $c['amount']) : null;
        }
        unset($c);
        $days = (int) date('t', strtotime("$m-01"));
        $dayNo = $m === date('Y-m') ? (int) date('j') : $days;
        $pct = fn($a, $b) => $b > 0 ? (int) round($a * 100 / $b) : null;
        $stars = fn(?int $p) => $p === null ? null : ($p >= 100 ? 3 : ($p >= 75 ? 2 : ($p >= 50 ? 1 : 0)));
        // today: target is the monthly target spread over the days of the month
        $today = date('Y-m-d');
        $todaySales = (float) Db::value("SELECT COALESCE(SUM(total),0) FROM sales_docs WHERE company_id = ? AND doc_type = 'invoice' AND status = 'final' AND doc_date = ?
                                           AND (created_by = ? OR customer_id IN (SELECT id FROM customers WHERE sales_user_id = ?))", [$this->cid, $today, $uid, $uid]);
        $todayRep = Db::one('SELECT * FROM field_daily WHERE company_id = ? AND user_id = ? AND report_date = ?', [$this->cid, $uid, $today]);
        $todayKm = $todayRep ? (float) ($todayRep['km_run'] ?? $todayRep['gps_km']) : \App\Controllers\Erp\ExpenseController::kmFromPings($uid, $today);
        $todayVisits = (int) Db::value('SELECT COUNT(*) FROM field_visits WHERE company_id = ? AND user_id = ? AND visit_date = ?', [$this->cid, $uid, $today]);
        $amtPct = $pct($sales, (float) $t['amount_target']);
        $onPace = (float) $t['amount_target'] > 0 ? (int) round($sales * 100 / ((float) $t['amount_target'] * $dayNo / $days)) : null;
        $ratings = Db::all('SELECT report_date, self_rating FROM field_daily WHERE company_id = ? AND user_id = ? AND report_date LIKE ? ORDER BY report_date', [$this->cid, $uid, "$m%"]);
        return [
            'user_id' => $uid, 'name' => Db::value('SELECT name FROM users WHERE id = ?', [$uid]), 'month' => $m, 'day' => $dayNo, 'days' => $days,
            'target' => ['amount' => (float) $t['amount_target'], 'km' => (int) $t['km_target'], 'visits' => (int) $t['visits_target'], 'categories' => $cats],
            'achieved' => ['amount' => $sales, 'km' => round($km, 1), 'visits' => $visits],
            'pct' => ['amount' => $amtPct, 'km' => $pct($km, (int) $t['km_target']), 'visits' => $pct($visits, (int) $t['visits_target']), 'on_pace' => $onPace],
            'stars' => $stars($onPace),
            'today' => [
                'sales' => $todaySales, 'sales_target' => $days ? round((float) $t['amount_target'] / $days) : 0,
                'sales_pct' => $pct($todaySales, $days ? (float) $t['amount_target'] / $days : 0),
                'km' => $todayKm, 'km_target' => $days ? round((int) $t['km_target'] / $days, 1) : 0, 'km_pct' => $pct($todayKm, $days ? (int) $t['km_target'] / $days : 0),
                'visits' => $todayVisits, 'report_done' => (bool) $todayRep, 'self_rating' => $todayRep['self_rating'] ?? null,
            ],
            'avg_self_rating' => $ratings ? round(array_sum(array_column($ratings, 'self_rating')) / count($ratings), 1) : null,
            'reports_filled' => count($ratings),
        ];
    }

    /** GET /marketing/team?month= — managers: every field person's target vs achieved */
    public function team(): array
    {
        if (!$this->isManager()) throw HttpError::forbidden();
        $m = preg_match('/^\d{4}-\d{2}$/', (string) ($this->req->query['month'] ?? '')) ? $this->req->query['month'] : date('Y-m');
        $ids = array_map('intval', array_column(Db::all('SELECT DISTINCT user_id FROM sales_targets WHERE company_id = ? AND month = ? UNION SELECT DISTINCT user_id FROM field_visits WHERE company_id = ? AND visit_date LIKE ?
                                                          UNION SELECT DISTINCT user_id FROM field_daily WHERE company_id = ? AND report_date LIKE ?', [$this->cid, $m, $this->cid, "$m%", $this->cid, "$m%"]), 'user_id'));
        $out = [];
        foreach ($ids as $u) { $this->req->query['user_id'] = $u; $this->req->query['month'] = $m; $out[] = $this->summary(); }
        usort($out, fn($a, $b) => ($b['pct']['amount'] ?? -1) <=> ($a['pct']['amount'] ?? -1));
        return ['month' => $m, 'people' => $out];
    }
}
