<?php
namespace App\Services\Erp;

use App\Core\{Db, HttpError};
use App\Services\Notifier;

/**
 * Dynamic approval matrix.
 * approval_rules: (doc_type, min_amount, levels). For a value, the matching rule with the highest
 * min_amount wins. levels: manager → 1 level, owner → owner only, manager_owner → manager then owner.
 * Manager approval and Boss approval are separate rows; the owner can override (approve any pending level).
 * Reject needs a reason.
 */
final class Approvals
{
    public const DOC_LABELS = [
        'purchase_order' => 'Purchase order', 'grn' => 'Goods receipt (GRN)', 'sales_invoice' => 'Sales invoice',
        'vendor_payment' => 'Vendor payment', 'expense' => 'Expense', 'sales_return' => 'Sales return',
        'purchase_return' => 'Purchase return', 'stock_adjustment' => 'Stock adjustment',
    ];
    /** Rule types an admin can configure (value = amount, except sales_discount = discount %). */
    public const RULE_TYPES = [
        'purchase_order' => 'Purchase order amount', 'grn' => 'GRN / purchase bill amount', 'vendor_payment' => 'Vendor payment amount',
        'expense' => 'Expense amount', 'sales_return' => 'Sales return amount', 'purchase_return' => 'Purchase return amount',
        'sales_discount' => 'Sales discount % (any line)', 'credit_limit' => 'Credit limit exceeded (amount over limit)',
        'stock_adjustment' => 'Stock adjustment value',
    ];

    /** Which levels a value needs for one rule type: ['manager'=>bool,'owner'=>bool] */
    public static function levelsFor(int $cid, string $ruleType, float $value): array
    {
        $rule = Db::one('SELECT levels FROM approval_rules WHERE company_id = ? AND doc_type = ? AND is_active = 1 AND min_amount <= ?
                         ORDER BY min_amount DESC LIMIT 1', [$cid, $ruleType, $value]);
        if (!$rule) return ['manager' => false, 'owner' => false];
        return ['manager' => in_array($rule['levels'], ['manager', 'manager_owner'], true), 'owner' => in_array($rule['levels'], ['owner', 'manager_owner'], true)];
    }

    /**
     * Start approval for a document. $checks = [ruleType => value, ...]; levels are combined.
     * Returns true if approval is needed (rows created), false if it can go straight through.
     */
    public static function start(int $cid, string $docType, int $docId, array $checks, string $summary, ?float $amount, array $requester): bool
    {
        $need = ['manager' => false, 'owner' => false];
        foreach ($checks as $type => $value) {
            if ($value === null) continue;
            $l = self::levelsFor($cid, $type, (float) $value);
            $need['manager'] = $need['manager'] || $l['manager'];
            $need['owner'] = $need['owner'] || $l['owner'];
        }
        // The boss's own documents need no approval
        if ($requester['role'] === 'owner') return false;
        // A manager can't approve their own document: it goes to the boss instead
        if ($requester['role'] === 'manager' && $need['manager']) { $need['manager'] = false; $need['owner'] = true; }
        if (!$need['manager'] && !$need['owner']) return false;

        Db::exec("UPDATE approvals SET status = 'skipped' WHERE company_id = ? AND doc_type = ? AND doc_id = ? AND status IN ('pending','waiting')", [$cid, $docType, $docId]);
        $level = 1;
        foreach (['manager', 'owner'] as $role) {
            if (!$need[$role]) continue;
            Db::insert('approvals', ['company_id' => $cid, 'doc_type' => $docType, 'doc_id' => $docId, 'level' => $level, 'approver_role' => $role,
                'status' => $level === 1 ? 'pending' : 'waiting', 'summary' => mb_substr($summary, 0, 255), 'amount' => $amount, 'requested_by' => $requester['id']]);
            if ($level === 1) self::notifyApprovers($cid, $role, $summary, (int) $requester['id']);
            $level++;
        }
        Audit::log($cid, (int) $requester['id'], $docType, $docId, 'approval_requested', ['levels' => $need, 'checks' => $checks]);
        return true;
    }

    private static function notifyApprovers(int $cid, string $role, string $summary, int $requesterId): void
    {
        $ids = array_column(Db::all('SELECT id FROM users WHERE company_id = ? AND role = ? AND is_active = 1 AND id <> ?', [$cid, $role, $requesterId]), 'id');
        if (!$ids && $role === 'manager') $ids = array_column(Db::all("SELECT id FROM users WHERE company_id = ? AND role = 'owner' AND is_active = 1", [$cid]), 'id');
        $deps = $ids ? array_column(Db::all('SELECT deputy_id FROM users WHERE deputy_id IS NOT NULL AND id IN ' . Db::in($ids), $ids), 'deputy_id') : [];
        foreach (array_unique(array_merge($ids, $deps)) as $id) Notifier::notify($cid, (int) $id, 'approval_needed', 'Approval needed', $summary, 'approval', null);
    }

    /** A person set as the boss's / a manager's deputy (backup approver) can approve for them. */
    public static function effective(array $user): array
    {
        $for = Db::all("SELECT id, name, role FROM users WHERE company_id = ? AND deputy_id = ? AND is_active = 1 AND role IN ('owner','manager')", [$user['company_id'], $user['id']]);
        foreach ($for as $f) {
            if ($f['role'] === 'owner' || ($f['role'] === 'manager' && $user['role'] === 'employee')) {
                $user['role'] = $f['role'];
                $user['behalf_of'] = $f['name'];
            }
        }
        return $user;
    }

    public static function pendingFor(array $user): array
    {
        $user = self::effective($user);
        $cid = (int) $user['company_id'];
        if ($user['role'] === 'employee') return [];
        $roleCond = $user['role'] === 'owner' ? "a.status = 'pending'" : "a.status = 'pending' AND a.approver_role = 'manager' AND a.requested_by <> ?";
        $p = $user['role'] === 'owner' ? [$cid] : [$cid, $user['id']];
        return Db::all("SELECT a.*, u.name AS requested_by_name FROM approvals a LEFT JOIN users u ON u.id = a.requested_by
                         WHERE a.company_id = ? AND $roleCond ORDER BY a.id DESC LIMIT 300", $p);
    }

    public static function history(int $cid, string $docType, int $docId): array
    {
        return Db::all("SELECT a.*, u.name AS acted_by_name,
                                (SELECT f.id FROM attachments f WHERE f.entity_type = 'approval' AND f.entity_id = a.id ORDER BY f.id DESC LIMIT 1) AS voice_id
                           FROM approvals a LEFT JOIN users u ON u.id = a.acted_by
                         WHERE a.company_id = ? AND a.doc_type = ? AND a.doc_id = ? ORDER BY a.id", [$cid, $docType, $docId]);
    }

    public static function isPending(int $cid, string $docType, int $docId): bool
    {
        return (bool) Db::value("SELECT 1 FROM approvals WHERE company_id = ? AND doc_type = ? AND doc_id = ? AND status IN ('pending','waiting') LIMIT 1", [$cid, $docType, $docId]);
    }

    /** Approve or reject one approval row. Returns 'approved' | 'rejected' | 'next' (moved to next level). */
    public static function act(array $user, int $approvalId, bool $approve, ?string $remarks): string
    {
        $user = self::effective($user);
        if (!empty($user['behalf_of'])) $remarks = trim(($remarks ?? '') . " (on behalf of {$user['behalf_of']})");
        $cid = (int) $user['company_id'];
        $a = Db::one("SELECT * FROM approvals WHERE id = ? AND company_id = ? AND status = 'pending'", [$approvalId, $cid]);
        if (!$a) throw HttpError::notFound('This approval is no longer pending');
        $isOwner = $user['role'] === 'owner';
        if (!$isOwner) {
            if ($user['role'] !== 'manager' || $a['approver_role'] !== 'manager') throw HttpError::forbidden('Only the boss can approve this');
            if ((int) $a['requested_by'] === (int) $user['id']) throw HttpError::forbidden('You cannot approve your own request');
        }
        if (!$approve && !trim(preg_replace('/\(on behalf of [^)]*\)/', '', (string) $remarks))) throw HttpError::badRequest('Reason is required to reject');

        $now = date('Y-m-d H:i:s');
        Db::update('approvals', (int) $a['id'], ['status' => $approve ? 'approved' : 'rejected', 'acted_by' => $user['id'], 'acted_at' => $now, 'remarks' => $remarks]);
        Audit::log($cid, (int) $user['id'], $a['doc_type'], (int) $a['doc_id'], $approve ? 'approved' : 'rejected', ['level' => $a['approver_role'], 'remarks' => $remarks]);

        if (!$approve) {
            Db::exec("UPDATE approvals SET status = 'skipped' WHERE company_id = ? AND doc_type = ? AND doc_id = ? AND status IN ('pending','waiting')", [$cid, $a['doc_type'], $a['doc_id']]);
            Docs::onRejected($a['doc_type'], (int) $a['doc_id'], $cid, (int) $user['id'], (string) $remarks);
            if ($a['requested_by']) Notifier::notify($cid, (int) $a['requested_by'], 'approval_rejected', 'Rejected: ' . $a['summary'], $remarks);
            return 'rejected';
        }

        // The boss approving covers any remaining levels (override)
        if ($isOwner) {
            Db::exec("UPDATE approvals SET status = 'approved', acted_by = ?, acted_at = ?, remarks = COALESCE(remarks, 'Approved by boss') WHERE company_id = ? AND doc_type = ? AND doc_id = ? AND status IN ('pending','waiting')",
                [$user['id'], $now, $cid, $a['doc_type'], $a['doc_id']]);
        }
        $next = Db::one("SELECT * FROM approvals WHERE company_id = ? AND doc_type = ? AND doc_id = ? AND status = 'waiting' ORDER BY level LIMIT 1", [$cid, $a['doc_type'], $a['doc_id']]);
        if ($next) {
            Db::update('approvals', (int) $next['id'], ['status' => 'pending']);
            self::notifyApprovers($cid, $next['approver_role'], $next['summary'] . ' (manager approved)', (int) $next['requested_by']);
            return 'next';
        }
        Docs::onApproved($a['doc_type'], (int) $a['doc_id'], $cid, (int) $user['id']);
        if ($a['requested_by']) Notifier::notify($cid, (int) $a['requested_by'], 'approval_done', 'Approved: ' . $a['summary']);
        return 'approved';
    }
}
