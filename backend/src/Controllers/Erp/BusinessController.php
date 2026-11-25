<?php
namespace App\Controllers\Erp;

use App\Core\{Db, HttpError};
use App\Services\Erp\{Audit, Ledger};
use App\Services\Notifier;

/**
 * Business profile (printed on bills, sent on WhatsApp, digital visiting card)
 * + public pages a customer opens from a WhatsApp link: proforma / bill with Approve & UPI pay, and the company card.
 */
final class BusinessController extends Base
{
    public const PROFILE_KEYS = ['display_name', 'tagline', 'address', 'map_url', 'phone', 'whatsapp', 'email', 'website', 'gstin', 'pan',
        'bank_name', 'account_holder', 'account_no', 'ifsc', 'upi_id', 'products_line', 'brands_line', 'hours', 'terms', 'proforma_note'];

    public static function profileOf(int $cid): array
    {
        $c = Db::one('SELECT name, erp_settings FROM companies WHERE id = ?', [$cid]);
        $s = json_decode((string) ($c['erp_settings'] ?? ''), true) ?: [];
        $p = $s['profile'] ?? [];
        $out = [];
        foreach (self::PROFILE_KEYS as $k) $out[$k] = $p[$k] ?? '';
        if (!$out['display_name']) $out['display_name'] = $c['name'] ?? '';
        if (!$out['terms']) $out['terms'] = "1. Goods once sold will not be taken back or exchanged.\n2. Breakage / shortage must be reported at the time of delivery.\n3. Interest @18% p.a. on bills not paid by the due date.\n4. Subject to local jurisdiction.";
        if (!$out['proforma_note']) $out['proforma_note'] = 'This is a proforma (estimate). Please check items and rates and tap Approve to confirm the order.';
        $out['card_token'] = $s['card_token'] ?? null;
        return $out;
    }

    /** GET /erp/business-profile */
    public function profile(): array
    {
        $p = self::profileOf($this->cid);
        if (!$p['card_token']) {
            $p['card_token'] = bin2hex(random_bytes(6));
            $this->saveSettings(fn(array $s) => $s + ['card_token' => $p['card_token']]);
        }
        return $p;
    }

    /** PATCH /erp/business-profile (owner / manager) */
    public function saveProfile(): array
    {
        if (!$this->isManager()) throw HttpError::forbidden('Only the boss or a manager can change the business profile');
        $in = $this->req->only(self::PROFILE_KEYS);
        if (!empty($in['upi_id']) && !preg_match('/^[\w.\-]{2,}@[\w]{2,}$/', trim($in['upi_id']))) throw HttpError::badRequest('UPI ID should look like name@bank');
        $this->saveSettings(function (array $s) use ($in) {
            $s['profile'] = array_merge($s['profile'] ?? [], array_map(fn($v) => is_string($v) ? trim($v) : $v, $in));
            return $s;
        });
        return $this->profile();
    }

    private function saveSettings(callable $fn): void
    {
        $s = json_decode((string) Db::value('SELECT erp_settings FROM companies WHERE id = ?', [$this->cid]), true) ?: [];
        Db::exec('UPDATE companies SET erp_settings = ? WHERE id = ?', [json_encode($fn($s), JSON_UNESCAPED_UNICODE), $this->cid]);
    }

    /* ───────────── public (no login) ───────────── */

    private static function docByToken(string $token): array
    {
        if (!preg_match('/^[a-f0-9]{16,40}$/', $token)) throw HttpError::notFound('Link not valid');
        $s = Db::one('SELECT s.*, COALESCE(c.business_name, c.name, s.customer_name) AS party_name, COALESCE(c.mobile, s.customer_mobile) AS party_mobile,
                             c.gstin AS party_gstin, COALESCE(s.billing_address, c.billing_address, c.address, s.customer_address) AS party_address
                        FROM sales_docs s LEFT JOIN customers c ON c.id = s.customer_id WHERE s.share_token = ?', [$token]);
        if (!$s || $s['status'] === 'cancelled') throw HttpError::notFound('This bill is not available any more');
        return $s;
    }

    /** GET /public/doc/{token} — what the customer sees from the WhatsApp link */
    public function publicDoc(): array
    {
        $s = self::docByToken((string) ($this->req->params['token'] ?? ''));
        $items = Db::all('SELECT p.name, p.unit, i.qty, i.rate, i.discount_pct, i.gst_rate, i.amount FROM sales_doc_items i JOIN products p ON p.id = i.product_id WHERE i.doc_id = ? ORDER BY i.id', [$s['id']]);
        $p = self::profileOf((int) $s['company_id']);
        $isBill = $s['doc_type'] === 'invoice' && $s['status'] === 'final';
        $due = $isBill ? max(0, round((float) $s['total'] - (float) $s['paid_amount'], 2)) : (float) $s['total'];
        $delivery = Db::one('SELECT status, delivered_at FROM deliveries WHERE invoice_id = ? ORDER BY id DESC LIMIT 1', [$s['id']]);
        return [
            'kind' => $isBill ? 'Tax invoice' : ($s['doc_type'] === 'quotation' ? 'Quotation' : 'Proforma invoice'),
            'doc_no' => $s['doc_no'], 'date' => $s['doc_date'], 'party_name' => $s['party_name'] ?: 'Customer', 'party_address' => $s['party_address'], 'party_gstin' => $s['party_gstin'],
            'items' => $items, 'charges' => json_decode((string) $s['charges'], true) ?: [],
            'subtotal' => (float) $s['subtotal'], 'discount' => (float) $s['discount'], 'tax' => (float) $s['tax'], 'charges_total' => (float) $s['charges_total'], 'total' => (float) $s['total'],
            'paid' => (float) $s['paid_amount'], 'due' => $due, 'terms' => $s['terms'] ?: $p['terms'],
            'can_approve' => !$isBill && in_array($s['customer_approval'], ['sent', 'changes'], true), 'approval' => $s['customer_approval'], 'customer_note' => $s['customer_note'],
            'approved_at' => $s['customer_approved_at'], 'delivery' => $delivery,
            'upi' => $p['upi_id'] && $due > 0 && $isBill ? sprintf('upi://pay?pa=%s&pn=%s&am=%.2f&cu=INR&tn=%s', rawurlencode($p['upi_id']), rawurlencode($p['display_name']), $due, rawurlencode($s['doc_no'])) : null,
            'business' => array_intersect_key($p, array_flip(['display_name', 'tagline', 'address', 'phone', 'whatsapp', 'email', 'gstin', 'upi_id', 'bank_name', 'account_no', 'ifsc', 'account_holder', 'proforma_note'])),
        ];
    }

    /** POST /public/doc/{token} {action: approve|changes, note} */
    public function publicDecide(): array
    {
        $s = self::docByToken((string) ($this->req->params['token'] ?? ''));
        if (!in_array($s['customer_approval'], ['sent', 'changes'], true)) throw HttpError::badRequest('This is already confirmed');
        $ok = $this->req->input('action') === 'approve';
        $note = mb_substr(trim((string) $this->req->input('note')), 0, 250) ?: null;
        if (!$ok && !$note) throw HttpError::badRequest('Please write what should change');
        Db::update('sales_docs', (int) $s['id'], ['customer_approval' => $ok ? 'approved' : 'changes', 'customer_approved_at' => $ok ? date('Y-m-d H:i:s') : null, 'customer_note' => $note]);
        Audit::log((int) $s['company_id'], null, 'sales_invoice', (int) $s['id'], $ok ? 'customer approved' : 'customer asked for changes', ['note' => $note]);
        Notifier::notify((int) $s['company_id'], (int) $s['created_by'], 'approval_done', ($ok ? '✅ Customer approved ' : '✏️ Customer wants changes · ') . $s['doc_no'], $note ?? ($s['party_name'] ?? ''), null, null);
        return $this->publicDoc();
    }

    /** GET /public/card/{token} — digital visiting card */
    public function publicCard(): array
    {
        $token = (string) ($this->req->params['token'] ?? '');
        if (!preg_match('/^[a-f0-9]{8,20}$/', $token)) throw HttpError::notFound();
        $cid = (int) Db::value("SELECT id FROM companies WHERE JSON_UNQUOTE(JSON_EXTRACT(erp_settings, '$.card_token')) = ?", [$token]);
        if (!$cid) throw HttpError::notFound('Card not found');
        $p = self::profileOf($cid);
        unset($p['terms'], $p['proforma_note'], $p['card_token']);
        $p['categories'] = array_column(Db::all('SELECT name FROM product_categories WHERE company_id = ? AND is_active = 1 ORDER BY name', [$cid]), 'name');
        $p['brands'] = array_column(Db::all('SELECT name FROM brands WHERE company_id = ? AND is_active = 1 ORDER BY name LIMIT 30', [$cid]), 'name');
        return $p;
    }
}
