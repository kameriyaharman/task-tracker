<?php
namespace App\Controllers\Erp;

use App\Core\{Db, HttpError};
use App\Services\Erp\{Audit, Docs};
use App\Services\{Notifier, Upload};

/** Delivery: pending → packed → dispatched → delivered (OTP / photo / receiver) | partial | failed */
final class DeliveryController extends Base
{
    public function index(): array
    {
        $this->need('delivery');
        $where = ['d.company_id = ?']; $p = [$this->cid];
        if ($this->q('mine') || ($this->user['role'] === 'employee' && !\App\Services\Erp\Perm::can($this->user, 'sales'))) { $where[] = 'd.assigned_to = ?'; $p[] = $this->uid(); }
        if ($s = $this->q('status')) {
            if ($s === 'open') $where[] = "d.status IN ('pending','packed','dispatched')"; else { $where[] = 'd.status = ?'; $p[] = $s; }
        }
        if ($q = $this->q('q')) { $where[] = '(d.delivery_no LIKE ? OR d.customer_name LIKE ? OR s.doc_no LIKE ?)'; array_push($p, "%$q%", "%$q%", "%$q%"); }
        return Db::all('SELECT d.*, s.doc_no AS invoice_no, s.total AS invoice_total, s.payment_mode, s.paid_amount, u.name AS assigned_name
                          FROM deliveries d JOIN sales_docs s ON s.id = d.invoice_id LEFT JOIN users u ON u.id = d.assigned_to
                         WHERE ' . implode(' AND ', $where) . " ORDER BY FIELD(d.status,'pending','packed','dispatched','partial','failed','delivered','cancelled'), d.id DESC LIMIT 500", $p);
    }

    public function show(): array
    {
        $this->need('delivery');
        $d = Db::one('SELECT d.*, s.doc_no AS invoice_no, s.total AS invoice_total, s.payment_mode, s.paid_amount, u.name AS assigned_name
                        FROM deliveries d JOIN sales_docs s ON s.id = d.invoice_id LEFT JOIN users u ON u.id = d.assigned_to WHERE d.id = ? AND d.company_id = ?', [$this->param('id'), $this->cid]);
        if (!$d) throw HttpError::notFound();
        $d['items'] = Db::all('SELECT i.id, i.product_id, i.qty, i.delivered_qty, p.name AS product_name, p.unit FROM sales_doc_items i JOIN products p ON p.id = i.product_id WHERE i.doc_id = ?', [$d['invoice_id']]);
        $d['files'] = $this->files('delivery', (int) $d['id']);
        $d['history'] = Audit::history($this->cid, 'delivery', (int) $d['id']);
        // OTP is only shown to office staff (they share it with the customer), never to the delivery person
        if ($this->user['role'] === 'employee' && (int) $d['assigned_to'] === $this->uid()) unset($d['otp_code']);
        return $d;
    }

    /** POST /erp/deliveries {invoice_id, assigned_to?} */
    public function store(): array
    {
        $this->need('delivery', true);
        $inv = Db::one("SELECT * FROM sales_docs WHERE id = ? AND company_id = ? AND doc_type = 'invoice' AND status = 'final'", [$this->req->require(['invoice_id'])['invoice_id'], $this->cid]);
        if (!$inv) throw HttpError::badRequest('Delivery needs a final invoice');
        $assign = $this->req->int('assigned_to');
        if ($assign) $this->assertSameCompanyUser($assign);
        $id = Docs::createDelivery($this->cid, (int) $inv['id'], $this->uid(), $assign);
        Db::update('sales_docs', (int) $inv['id'], ['needs_delivery' => 1]);
        $this->req->params['id'] = $id;
        return $this->show();
    }

    /** PATCH /erp/deliveries/{id} {assigned_to, vehicle, scheduled_at, address, notes} */
    public function update(): array
    {
        $this->need('delivery', true);
        $d = $this->show();
        $data = $this->req->only(['assigned_to', 'vehicle', 'scheduled_at', 'address', 'notes']);
        if (!empty($data['assigned_to'])) {
            $this->assertSameCompanyUser((int) $data['assigned_to']);
            if ((int) $data['assigned_to'] !== (int) $d['assigned_to']) Notifier::notify($this->cid, (int) $data['assigned_to'], 'delivery_assigned', 'Delivery ' . $d['delivery_no'] . ' assigned to you', $d['customer_name'] . ' · ' . $d['address'], 'delivery', (int) $d['id']);
        }
        foreach ($data as $k => $v) if ($v === '') $data[$k] = null;
        Db::update('deliveries', (int) $d['id'], $data, $this->cid);
        Audit::log($this->cid, $this->uid(), 'delivery', (int) $d['id'], 'updated', $data);
        return $this->show();
    }

    /**
     * POST /erp/deliveries/{id}/status {status, otp?, receiver_name?, failure_reason?, lat?, lng?, items?:[{id, qty}]} + photos
     * delivered: needs the customer OTP (or a photo) as proof.
     */
    public function status(): array
    {
        $this->need('delivery', true);
        $d = Db::one('SELECT * FROM deliveries WHERE id = ? AND company_id = ?', [$this->param('id'), $this->cid]);
        if (!$d) throw HttpError::notFound();
        $s = $this->req->require(['status'])['status'];
        if (!in_array($s, ['packed', 'dispatched', 'delivered', 'partial', 'failed', 'cancelled', 'pending'], true)) throw HttpError::badRequest('Unknown status');
        if (in_array($d['status'], ['delivered', 'cancelled'], true)) throw HttpError::badRequest('Delivery already closed');
        $photos = Upload::list($this->req->files, 'photos');
        $data = ['status' => $s];
        if (in_array($s, ['delivered', 'partial'], true)) {
            $otpOk = $this->req->input('otp') !== null && (string) $this->req->input('otp') === (string) $d['otp_code'];
            if ($this->req->input('otp') !== null && $this->req->input('otp') !== '' && !$otpOk) throw HttpError::badRequest('Wrong OTP');
            if (!$otpOk && !$photos && !$this->files('delivery', (int) $d['id'])) throw HttpError::badRequest('Enter the customer OTP or add a delivery photo');
            $data += ['otp_verified' => $otpOk ? 1 : 0, 'receiver_name' => $this->req->input('receiver_name'), 'delivered_at' => date('Y-m-d H:i:s'),
                      'lat' => $this->req->input('lat'), 'lng' => $this->req->input('lng')];
            $items = (array) $this->req->input('items', []);
            $byId = []; foreach ($items as $it) $byId[(int) ($it['id'] ?? 0)] = (float) ($it['qty'] ?? 0);
            foreach (Db::all('SELECT * FROM sales_doc_items WHERE doc_id = ?', [$d['invoice_id']]) as $it) {
                $q = $s === 'delivered' && !$items ? (float) $it['qty'] : min((float) $it['qty'], (float) $it['delivered_qty'] + ($byId[(int) $it['id']] ?? 0));
                Db::update('sales_doc_items', (int) $it['id'], ['delivered_qty' => $q]);
            }
        }
        if ($s === 'failed') {
            $data['failure_reason'] = $this->req->require(['failure_reason'])['failure_reason'];
        }
        Db::update('deliveries', (int) $d['id'], $data);
        foreach ($photos as $f) Upload::save($f, $this->cid, $this->uid(), 'delivery', (int) $d['id']);
        Audit::log($this->cid, $this->uid(), 'delivery', (int) $d['id'], 'status:' . $s, array_intersect_key($data, array_flip(['receiver_name', 'failure_reason', 'otp_verified'])));
        // Close the workflow tasks linked to this delivery when it is done
        if (in_array($s, ['delivered', 'cancelled'], true)) {
            // closing a step can start the next one, so repeat until nothing is open
            for ($round = 0; $round < 10; $round++) {
                $open = Db::all("SELECT * FROM tasks WHERE company_id = ? AND ref_type = 'delivery' AND ref_id = ? AND status IN ('not_started','in_progress','on_hold')", [$this->cid, $d['id']]);
                if (!$open) break;
                foreach ($open as $t) \App\Controllers\TaskController::setStatus($t, $s === 'delivered' ? 'done' : 'cancelled', $this->uid());
            }
        }
        if (in_array($s, ['failed', 'partial'], true)) {
            foreach (Db::all("SELECT id FROM users WHERE company_id = ? AND role IN ('owner','manager') AND is_active = 1", [$this->cid]) as $u) {
                Notifier::notify($this->cid, (int) $u['id'], 'delivery_' . $s, 'Delivery ' . $s . ': ' . $d['delivery_no'], $data['failure_reason'] ?? $d['customer_name'], 'delivery', (int) $d['id']);
            }
        }
        return $this->show();
    }
}
