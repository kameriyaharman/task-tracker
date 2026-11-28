<?php
namespace App\Services\Erp;

use App\Core\Db;

/** Default ERP setup for a company (runs once per item; safe on every start). */
final class Seed
{
    public static function run(int $cid): void
    {
        if (!Db::value('SELECT 1 FROM warehouses WHERE company_id = ?', [$cid])) {
            Db::insert('warehouses', ['company_id' => $cid, 'name' => 'Showroom', 'type' => 'showroom']);
            Db::insert('warehouses', ['company_id' => $cid, 'name' => 'Godown', 'type' => 'godown']);
        }
        if (!Db::value('SELECT 1 FROM units WHERE company_id = ?', [$cid])) {
            foreach (['Piece', 'Bag', 'Box', 'Kg', 'Ltr', 'Ft', 'Mtr', 'Sq.Ft', 'MT', 'Set', 'Roll', 'Bundle', 'Pair', 'Coil'] as $u) Db::insert('units', ['company_id' => $cid, 'name' => $u]);
        }
        if (!Db::value('SELECT 1 FROM product_categories WHERE company_id = ?', [$cid])) {
            foreach (['Cement', 'Steel / TMT', 'Pipes & Fittings', 'Paint', 'Electrical', 'Sanitary', 'Tiles', 'Hardware & Tools', 'Plywood'] as $c) Db::insert('product_categories', ['company_id' => $cid, 'name' => $c]);
        }
        $roles = [
            'Purchase Executive' => ['purchase' => 'edit', 'masters' => 'edit', 'inventory' => 'view', 'reports' => 'view'],
            'Store Incharge' => ['inventory' => 'edit', 'purchase' => 'view', 'delivery' => 'edit', 'masters' => 'view', 'returns' => 'edit'],
            'Sales Executive' => ['sales' => 'edit', 'masters' => 'view', 'inventory' => 'view', 'recovery' => 'view', 'complaints' => 'edit'],
            'Accountant' => ['accounts' => 'edit', 'recovery' => 'edit', 'expenses' => 'edit', 'reports' => 'view', 'purchase' => 'view', 'sales' => 'view', 'returns' => 'view', 'masters' => 'view'],
            'Recovery Executive' => ['recovery' => 'edit', 'sales' => 'view', 'accounts' => 'view'],
            'Delivery Staff' => ['delivery' => 'edit'],
            'HR Executive' => ['reports' => 'view'],
            'Department Head' => ['purchase' => 'edit', 'inventory' => 'edit', 'sales' => 'edit', 'delivery' => 'edit', 'recovery' => 'view', 'complaints' => 'edit', 'reports' => 'view', 'masters' => 'view'],
        ];
        foreach ($roles as $name => $perms) {
            if (!Db::value('SELECT 1 FROM erp_roles WHERE company_id = ? AND name = ?', [$cid, $name])) {
                Db::insert('erp_roles', ['company_id' => $cid, 'name' => $name, 'perms' => json_encode($perms)]);
            }
        }
        if (!Db::value('SELECT 1 FROM approval_rules WHERE company_id = ?', [$cid])) {
            foreach ([
                ['purchase_order', 0, 'manager'], ['purchase_order', 50000, 'manager_owner'],
                ['grn', 0, 'manager'], ['vendor_payment', 0, 'manager'], ['vendor_payment', 50000, 'manager_owner'],
                ['expense', 0, 'manager'], ['expense', 10000, 'manager_owner'],
                ['sales_return', 0, 'manager'], ['purchase_return', 0, 'manager'],
                ['sales_discount', 5, 'manager'], ['sales_discount', 10, 'owner'],
                ['credit_limit', 0.01, 'owner'],
            ] as [$t, $min, $lv]) Db::insert('approval_rules', ['company_id' => $cid, 'doc_type' => $t, 'min_amount' => $min, 'levels' => $lv]);
        }
        if (!Db::value('SELECT 1 FROM workflows WHERE company_id = ?', [$cid])) {
            $rid = fn($n) => (string) Db::value('SELECT id FROM erp_roles WHERE company_id = ? AND name = ?', [$cid, $n]);
            $wf = [
                ['Purchase → goods receiving', 'purchase_order.approved', [
                    ['name' => 'Send PO to vendor & confirm dispatch date', 'type' => 'task', 'assign_type' => 'erp_role', 'assign_value' => $rid('Purchase Executive'), 'due_hours' => 4, 'priority' => 'high'],
                    ['name' => 'Receive material, check quantity & make GRN', 'type' => 'task', 'assign_type' => 'erp_role', 'assign_value' => $rid('Store Incharge'), 'due_hours' => 72, 'proof' => 'photo'],
                ]],
                ['GRN → bill verification', 'grn.approved', [
                    ['name' => 'Verify vendor bill against GRN', 'type' => 'task', 'assign_type' => 'erp_role', 'assign_value' => $rid('Accountant'), 'due_hours' => 24],
                ]],
                ['Delivery process', 'delivery.created', [
                    ['name' => 'Pick & pack material', 'type' => 'task', 'assign_type' => 'erp_role', 'assign_value' => $rid('Store Incharge'), 'due_hours' => 2, 'priority' => 'high'],
                    ['name' => 'Deliver & take customer OTP', 'type' => 'task', 'assign_type' => 'erp_role', 'assign_value' => $rid('Delivery Staff'), 'due_hours' => 6, 'proof' => 'photo'],
                ]],
                ['Udhari (credit sale) follow-up', 'invoice.credit', [
                    ['name' => 'Call customer for payment before due date', 'type' => 'task', 'assign_type' => 'erp_role', 'assign_value' => $rid('Recovery Executive'), 'due_hours' => 168],
                    ['name' => 'Boss review of big credit sale', 'type' => 'notify', 'assign_type' => 'role', 'assign_value' => 'owner', 'min_amount' => 100000],
                ]],
                ['Complaint handling', 'complaint.created', [
                    ['name' => 'Inspect complaint & plan action', 'type' => 'task', 'assign_type' => 'role', 'assign_value' => 'manager', 'due_hours' => 24, 'priority' => 'high'],
                ]],
            ];
            foreach ($wf as [$name, $event, $steps]) {
                Db::insert('workflows', ['company_id' => $cid, 'name' => $name, 'trigger_event' => $event, 'steps' => json_encode(Workflow::cleanSteps($steps))]);
            }
        }
    }
}
