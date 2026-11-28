<?php
namespace App\Controllers\Erp;

use App\Core\{Config, Db, HttpError};
use App\Services\Erp\Tally;

/**
 * Tally settings + sync queue (admin) and the two endpoints the Windows connector on the Tally PC uses.
 * Connector auth: header X-Tally-Token (generated in settings), not a user login.
 */
final class TallyController extends Base
{
    public function settings(): array
    {
        $this->need('tally', true);
        $s = Tally::settings($this->cid);
        $s['token'] = $s['token'] ?? null;
        $s['counts'] = Db::all('SELECT status, COUNT(*) AS n FROM tally_queue WHERE company_id = ? GROUP BY status', [$this->cid]);
        $s['last_sync'] = Db::value("SELECT MAX(synced_at) FROM tally_queue WHERE company_id = ? AND status = 'synced'", [$this->cid]);
        $s['connector_seen'] = $s['connector_seen'] ?? null;
        return $s;
    }

    /** POST /erp/tally/settings {enabled, company, url, ledgers:{...}, regenerate_token} */
    public function saveSettings(): array
    {
        $this->need('tally', true);
        $all = json_decode((string) Db::value('SELECT erp_settings FROM companies WHERE id = ?', [$this->cid]), true) ?: [];
        $t = $all['tally'] ?? [];
        foreach (['company', 'url'] as $k) if ($this->req->input($k) !== null) $t[$k] = mb_substr(trim((string) $this->req->input($k)), 0, 150);
        if ($this->req->input('enabled') !== null) $t['enabled'] = (bool) $this->req->input('enabled');
        if (is_array($this->req->input('ledgers'))) $t['ledgers'] = array_intersect_key(array_map(fn($v) => mb_substr(trim((string) $v), 0, 100), $this->req->input('ledgers')), Tally::DEFAULT_LEDGERS);
        if (empty($t['token']) || $this->req->input('regenerate_token')) $t['token'] = bin2hex(random_bytes(20));
        $all['tally'] = $t;
        Db::update('companies', $this->cid, ['erp_settings' => json_encode($all)]);
        return $this->settings();
    }

    public function queue(): array
    {
        $this->need('tally', true);
        $where = ['company_id = ?']; $p = [$this->cid];
        if ($s = $this->q('status')) { $where[] = 'status = ?'; $p[] = $s; }
        return Db::all('SELECT * FROM tally_queue WHERE ' . implode(' AND ', $where) . ' ORDER BY id DESC LIMIT 500', $p);
    }

    /** POST /erp/tally/retry {id?} — failed → pending (all if no id) */
    public function retry(): array
    {
        $this->need('tally', true);
        if ($id = $this->req->int('id')) Db::exec("UPDATE tally_queue SET status = 'pending', error = NULL WHERE id = ? AND company_id = ?", [$id, $this->cid]);
        else Db::exec("UPDATE tally_queue SET status = 'pending', error = NULL WHERE company_id = ? AND status = 'failed'", [$this->cid]);
        return ['ok' => true];
    }

    /** POST /erp/tally/resync-all — queue every final/approved document (first-time setup) */
    public function resyncAll(): array
    {
        $this->need('tally', true);
        $n = 0;
        foreach (Db::all("SELECT id FROM sales_docs WHERE company_id = ? AND doc_type = 'invoice' AND status = 'final'", [$this->cid]) as $r) { Tally::enqueue($this->cid, 'sales_invoice', (int) $r['id'], 'Sales'); $n++; }
        foreach (Db::all("SELECT id FROM grns WHERE company_id = ? AND status = 'approved'", [$this->cid]) as $r) { Tally::enqueue($this->cid, 'grn', (int) $r['id'], 'Purchase'); $n++; }
        foreach (Db::all("SELECT id, direction FROM payments WHERE company_id = ? AND status = 'approved'", [$this->cid]) as $r) { Tally::enqueue($this->cid, 'payment', (int) $r['id'], $r['direction'] === 'in' ? 'Receipt' : 'Payment'); $n++; }
        foreach (Db::all("SELECT id FROM expenses WHERE company_id = ? AND status = 'approved'", [$this->cid]) as $r) { Tally::enqueue($this->cid, 'expense', (int) $r['id'], 'Payment'); $n++; }
        foreach (Db::all("SELECT id, type FROM returns_docs WHERE company_id = ? AND status = 'approved'", [$this->cid]) as $r) { Tally::enqueue($this->cid, 'return', (int) $r['id'], $r['type'] === 'sales' ? 'Credit Note' : 'Debit Note'); $n++; }
        return ['queued' => $n];
    }

    // ───────── Connector (no user session) ─────────
    private function connectorCompany(): int
    {
        $token = $_SERVER['HTTP_X_TALLY_TOKEN'] ?? ($this->req->query['tally_token'] ?? '');
        if (strlen($token) < 20) throw HttpError::unauthorized('Missing connector token');
        foreach (Db::all('SELECT id, erp_settings FROM companies') as $c) {
            $s = json_decode((string) $c['erp_settings'], true) ?: [];
            if (!empty($s['tally']['token']) && hash_equals($s['tally']['token'], $token)) {
                $s['tally']['connector_seen'] = date('Y-m-d H:i:s');
                Db::update('companies', (int) $c['id'], ['erp_settings' => json_encode($s)]);
                return (int) $c['id'];
            }
        }
        throw HttpError::unauthorized('Invalid connector token');
    }

    /** GET /tally/pending — up to 25 items with ready-to-post XML */
    public function pending(): array
    {
        $cid = $this->connectorCompany();
        $s = Tally::settings($cid);
        $rows = Db::all("SELECT * FROM tally_queue WHERE company_id = ? AND status = 'pending' AND attempts < 10 ORDER BY id LIMIT 25", [$cid]);
        $out = [];
        foreach ($rows as $q) {
            [$ledger, $voucher] = Tally::build($q);
            $out[] = ['id' => (int) $q['id'], 'ref' => $q['ref_type'] . '#' . $q['ref_id'], 'voucher_type' => $q['voucher_type'], 'ledger_xml' => $ledger, 'voucher_xml' => $voucher];
        }
        return ['tally_url' => $s['url'] ?? 'http://localhost:9000', 'items' => $out];
    }

    /** POST /tally/result {id, ok, error?} */
    public function result(): array
    {
        $cid = $this->connectorCompany();
        $id = (int) $this->req->require(['id'])['id'];
        $ok = (bool) $this->req->input('ok');
        Db::exec('UPDATE tally_queue SET status = ?, attempts = attempts + 1, error = ?, synced_at = IF(?, NOW(), synced_at) WHERE id = ? AND company_id = ?',
            [$ok ? 'synced' : 'failed', $ok ? null : mb_substr((string) $this->req->input('error'), 0, 500), $ok ? 1 : 0, $id, $cid]);
        return ['ok' => true];
    }

    /** GET /erp/tally/connector — the PowerShell connector, pre-filled with this server + token */
    public function connector(): void
    {
        $this->need('tally', true);
        $s = Tally::settings($this->cid);
        if (empty($s['token'])) throw HttpError::badRequest('Save Tally settings first');
        $api = rtrim((string) (getenv('PUBLIC_API_URL') ?: ((isset($_SERVER['HTTP_HOST']) ? 'https://' . $_SERVER['HTTP_HOST'] : '') . '/api')), '/');
        $script = file_get_contents(dirname(__DIR__, 3) . '/tally/KeshavTallyConnector.ps1');
        $script = str_replace(['__API_URL__', '__TOKEN__', '__TALLY_URL__'], [$api, $s['token'], $s['url'] ?? 'http://localhost:9000'], $script);
        header('Content-Type: text/plain; charset=utf-8');
        header('Content-Disposition: attachment; filename="KeshavTallyConnector.ps1"');
        echo $script;
    }
}
