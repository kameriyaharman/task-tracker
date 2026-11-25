<?php
namespace App\Controllers\Erp;

use App\Core\{Db, HttpError};
use App\Services\Erp\Approvals;

final class ApprovalController extends Base
{
    /** GET /erp/approvals — my pending approvals (manager: manager level; boss: everything) */
    public function index(): array
    {
        $rows = Approvals::pendingFor($this->user);
        foreach ($rows as &$r) $r['doc_label'] = Approvals::DOC_LABELS[$r['doc_type']] ?? $r['doc_type'];
        $history = $this->user['role'] === 'employee'
            ? Db::all('SELECT a.*, u.name AS acted_by_name FROM approvals a LEFT JOIN users u ON u.id = a.acted_by WHERE a.company_id = ? AND a.requested_by = ? ORDER BY a.id DESC LIMIT 100', [$this->cid, $this->uid()])
            : Db::all("SELECT a.*, u.name AS acted_by_name, r.name AS requested_by_name FROM approvals a LEFT JOIN users u ON u.id = a.acted_by LEFT JOIN users r ON r.id = a.requested_by
                        WHERE a.company_id = ? AND a.status IN ('approved','rejected') ORDER BY a.acted_at DESC LIMIT 100", [$this->cid]);
        foreach ($history as &$h) $h['doc_label'] = Approvals::DOC_LABELS[$h['doc_type']] ?? $h['doc_type'];
        return ['pending' => $rows, 'history' => $history];
    }

    /** POST /erp/approvals/{id} {approve: bool, remarks} */
    public function act(): array
    {
        // reason can be typed and/or spoken (voice note) — a voice note alone is enough to reject
        $voice = $this->req->files['voice_note'] ?? null;
        $remarks = trim((string) $this->req->input('remarks'));
        if ($voice && $remarks === '') $remarks = '🎤 Voice note';
        $approve = filter_var($this->req->input('approve'), FILTER_VALIDATE_BOOLEAN);
        $result = Approvals::act($this->user, $this->param('id'), $approve, $remarks ?: null);
        if ($voice) \App\Services\Upload::save($voice, $this->cid, $this->uid(), 'approval', $this->param('id'), 'voice', $this->req->int('voice_duration'));
        return ['result' => $result];
    }

    public function rules(): array
    {
        if ($this->user['role'] === 'employee') throw HttpError::forbidden();
        return ['types' => Approvals::RULE_TYPES, 'rules' => Db::all('SELECT * FROM approval_rules WHERE company_id = ? ORDER BY doc_type, min_amount', [$this->cid])];
    }

    /** PUT-style replace: POST /erp/approval-rules {rules:[{doc_type, min_amount, levels, is_active}]} — boss only */
    public function saveRules(): array
    {
        $this->need('approval_rules', true);
        $rules = (array) $this->req->input('rules', []);
        Db::tx(function () use ($rules) {
            Db::exec('DELETE FROM approval_rules WHERE company_id = ?', [$this->cid]);
            foreach ($rules as $r) {
                if (!isset(Approvals::RULE_TYPES[$r['doc_type'] ?? ''])) continue;
                Db::insert('approval_rules', ['company_id' => $this->cid, 'doc_type' => $r['doc_type'], 'min_amount' => max(0, (float) ($r['min_amount'] ?? 0)),
                    'levels' => in_array($r['levels'] ?? '', ['manager', 'owner', 'manager_owner'], true) ? $r['levels'] : 'manager', 'is_active' => !isset($r['is_active']) || $r['is_active'] ? 1 : 0]);
            }
        });
        \App\Services\Erp\Audit::log($this->cid, $this->uid(), 'approval_rules', null, 'updated', $rules);
        return $this->rules();
    }
}
