<?php
namespace App\Services\Erp;

use App\Core\{Db, HttpError};

/**
 * ERP module permissions.
 * owner → everything. manager → edit every business module (department head + approvals);
 * owner-only areas (workflows, approval rules, roles, tally settings) stay with the owner.
 * employee → whatever their ERP role (erp_roles.perms) grants: "view" or "edit" per module.
 */
final class Perm
{
    public const MODULES = [
        'masters' => 'Masters (products, vendors, customers)',
        'purchase' => 'Purchase & vendors',
        'inventory' => 'Stock & GRN',
        'sales' => 'Sales & quotations',
        'delivery' => 'Delivery',
        'accounts' => 'Accounts & payments',
        'recovery' => 'Recovery (udhari)',
        'returns' => 'Returns',
        'expenses' => 'Expenses',
        'complaints' => 'Complaints & maintenance',
        'reports' => 'Business reports',
    ];
    public const OWNER_ONLY = ['workflows', 'approval_rules', 'roles', 'tally'];

    private static array $cache = [];

    public static function perms(array $user): array
    {
        if ($user['role'] === 'owner') return array_fill_keys(array_keys(self::MODULES), 'edit');
        if ($user['role'] === 'manager') return array_fill_keys(array_keys(self::MODULES), 'edit');
        $rid = (int) ($user['erp_role_id'] ?? 0);
        if (!$rid) return [];
        if (!isset(self::$cache[$rid])) {
            $json = Db::value('SELECT perms FROM erp_roles WHERE id = ? AND company_id = ?', [$rid, $user['company_id']]);
            self::$cache[$rid] = json_decode((string) $json, true) ?: [];
        }
        return self::$cache[$rid];
    }

    public static function can(array $user, string $module, bool $write = false): bool
    {
        if (in_array($module, self::OWNER_ONLY, true)) return $user['role'] === 'owner';
        $p = self::perms($user)[$module] ?? null;
        return $write ? $p === 'edit' : in_array($p, ['view', 'edit'], true);
    }

    public static function need(array $user, string $module, bool $write = false): void
    {
        if (!self::can($user, $module, $write)) {
            throw HttpError::forbidden('You do not have ' . ($write ? 'edit' : 'view') . ' access to ' . (self::MODULES[$module] ?? $module));
        }
    }
}
