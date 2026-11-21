<?php
namespace App\Controllers\Erp;

use App\Core\{Db, HttpError};
use App\Services\Erp\{Approvals, Audit, DocNo, Docs};

/** Sales returns (against an invoice) and purchase returns (against a GRN / vendor). */
final class ReturnController extends Base
{
    public function index(): array
    {
        $this->need('returns');
        $where = ['r.company_id = ?']; $p = [$this->cid];
        if ($t = $this->q('type')) { $where[] = 'r.type = ?'; $p[] = $t; }
        if ($s = $this->q('status')) { $where[] = 'r.status = ?'; $p[] = $s; }
        return Db::all("SELECT r.*, CASE WHEN r.type = 'sales' THEN COALESCE(c.name, 'Walk-in') ELSE v.name END AS party_name,
                               CASE WHEN r.type = 'sales' THEN s.doc_no ELSE g.grn_no END AS ref_no, u.name AS created_by_name
                          FROM returns_docs r LEFT JOIN customers c ON r.type = 'sales' AND c.id = r.party_id LEFT JOIN vendors v ON r.type = 'purchase' AND v.id = r.party_id
                          LEFT JOIN sales_docs s ON r.type = 'sales' AND s.id = r.ref_id LEFT JOIN grns g ON r.type = 'purchase' AND g.id = r.ref_id
                          LEFT JOIN users u ON u.id = r.created_by WHERE " . implode(' AND ', $where) . ' ORDER BY r.id DESC LIMIT 500', $p);
    }

    public function show(): array
    {
        $this->need('returns');
        $r = Db::one('SELECT * FROM returns_docs WHERE id = ? AND company_id = ?', [$this->param('id'), $this->cid]);
        if (!$r) throw HttpError::notFound();
        $r['items'] = $this->items('return_items', 'return_id', (int) $r['id']);
        $r['approvals'] = Approvals::history($this->cid, $r['type'] . '_return', (int) $r['id']);
        $r['history'] = Audit::history($this->cid, 'return', (int) $r['id']);
        return $r;
    }

    /**
     * POST /erp/returns {type: sales|purchase, ref_id (invoice id / grn id), party_id? (purchase without GRN), warehouse_id, reason,
     *                    items:[{product_id, ref_item_id?, qty, rate?, restock}]}
     */
    public function store(): array
    {
        $this->need('returns', true);
        $type = $this->req->require(['type'])['type'] === 'purchase' ? 'purchase' : 'sales';
        $refId = $this->req->int('ref_id');
        $party = $this->req->int('party_id'); $wh = $this->req->int('warehouse_id');
        $raw = (array) $this->req->input('items', []);
        if ($type === 'sales') {
            $inv = Db::one("SELECT * FROM sales_docs WHERE id = ? AND company_id = ? AND doc_type = 'invoice' AND status = 'final'", [$refId, $this->cid]);
            if (!$inv) throw HttpError::badRequest('Pick a final invoice to return against');
            $party = $inv['customer_id'] ? (int) $inv['customer_id'] : null;
            $wh = $wh ?: (int) $inv['warehouse_id'];
            foreach ($raw as &$l) {
                $it = Db::one('SELECT * FROM sales_doc_items WHERE id = ? AND doc_id = ?', [(int) ($l['ref_item_id'] ?? 0), $inv['id']]);
                if (!$it) throw HttpError::badRequest('Item is not on this invoice');
                $pending = (float) Db::value("SELECT COALESCE(SUM(ri.qty),0) FROM return_items ri JOIN returns_docs r ON r.id = ri.return_id WHERE ri.ref_item_id = ? AND r.type = 'sales' AND r.status = 'pending_approval'", [$it['id']]);
                if ((float) ($l['qty'] ?? 0) > (float) $it['qty'] - (float) $it['returned_qty'] - $pending + 0.0005) throw HttpError::badRequest('Returning more than was sold');
                // credit at the price the customer actually paid (after discount)
                $l += ['product_id' => $it['product_id']];
                $l['product_id'] = $it['product_id'];
                $l['rate'] = round((float) $it['rate'] * (1 - (float) $it['discount_pct'] / 100), 2);
                $l['gst_rate'] = $it['gst_rate'];
            }
            unset($l);
        } else {
            if ($refId) {
                $g = Db::one("SELECT * FROM grns WHERE id = ? AND company_id = ? AND status = 'approved'", [$refId, $this->cid]);
                if (!$g) throw HttpError::badRequest('Pick an approved GRN');
                $party = (int) $g['vendor_id']; $wh = $wh ?: (int) $g['warehouse_id'];
            }
            if (!$party || !Db::value('SELECT 1 FROM vendors WHERE id = ? AND company_id = ?', [$party, $this->cid])) throw HttpError::badRequest('Pick the vendor');
        }
        [$lines, , , , $total] = $this->lines($raw, false, 'purchase_price');
        $id = Db::tx(function () use ($type, $refId, $party, $wh, $lines, $total) {
            $id = Db::insert('returns_docs', ['company_id' => $this->cid, 'return_no' => DocNo::next($this->cid, $type === 'sales' ? 'SR' : 'PR'), 'type' => $type,
                'ref_id' => $refId, 'party_id' => $party, 'warehouse_id' => $this->warehouse($wh), 'total' => $total, 'reason' => $this->req->input('reason'), 'created_by' => $this->uid()]);
            foreach ($lines as $l) Db::insert('return_items', ['return_id' => $id, 'product_id' => $l['product_id'], 'ref_item_id' => $l['ref_item_id'], 'qty' => $l['qty'],
                'rate' => $l['rate'], 'gst_rate' => $l['gst_rate'], 'amount' => $l['amount'], 'restock' => $l['restock']]);
            Audit::log($this->cid, $this->uid(), 'return', $id, 'created', ['total' => $total]);
            return $id;
        });
        Docs::submitReturn($this->cid, $id, $this->user);
        $this->req->params['id'] = $id;
        return $this->show();
    }
}
