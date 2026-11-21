<?php
/**
 * Idempotent installer, run on every container start:
 *  - creates/updates tables (schema uses CREATE TABLE IF NOT EXISTS)
 *  - creates the real company + owner account the first time (from env)
 *  - optionally loads the demo company (DEMO_DATA=1)
 *
 * Env: COMPANY_CODE, COMPANY_NAME, ADMIN_NAME, ADMIN_MOBILE, ADMIN_EMAIL, ADMIN_PASSWORD, DEMO_DATA
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
require dirname(__DIR__) . '/src/bootstrap.php';

use App\Core\Db;

for ($i = 0; ; $i++) {
    try { Db::pdo(); break; } catch (Throwable $e) {
        if ($i >= 30) { fwrite(STDERR, "Database not reachable: {$e->getMessage()}\n"); exit(1); }
        echo "Waiting for database…\n"; sleep(2);
    }
}
Db::pdo()->exec(file_get_contents(__DIR__ . '/schema.sql'));
Db::pdo()->exec(file_get_contents(__DIR__ . '/erp.sql'));

// ── Column migrations for tables that already exist ──
$col = fn(string $t, string $c) => (bool) Db::value('SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?', [$t, $c]);
$colType = fn(string $t, string $c) => (string) Db::value('SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?', [$t, $c]);
if (!$col('users', 'erp_role_id')) Db::pdo()->exec('ALTER TABLE users ADD COLUMN erp_role_id INT UNSIGNED NULL AFTER role');
if (!$col('companies', 'erp_settings')) Db::pdo()->exec('ALTER TABLE companies ADD COLUMN erp_settings TEXT NULL');
if (!$col('tasks', 'workflow_run_id')) {
    Db::pdo()->exec('ALTER TABLE tasks ADD COLUMN workflow_run_id INT UNSIGNED NULL, ADD COLUMN workflow_step INT NULL,
        ADD COLUMN ref_type VARCHAR(30) NULL, ADD COLUMN ref_id INT UNSIGNED NULL, ADD COLUMN escalated_at DATETIME NULL,
        ADD KEY idx_task_wf (workflow_run_id), ADD KEY idx_task_ref (ref_type, ref_id)');
}
if (strpos($colType('tasks', 'status'), 'on_hold') === false) {
    Db::pdo()->exec("ALTER TABLE tasks MODIFY status ENUM('not_started','in_progress','on_hold','done','cancelled') NOT NULL DEFAULT 'not_started'");
}
if (strpos($colType('tasks', 'source'), 'workflow') === false) {
    Db::pdo()->exec("ALTER TABLE tasks MODIFY source ENUM('manual','voice','ai','recurring','whatsapp','workflow','erp') NOT NULL DEFAULT 'manual'");
}
if (strpos($colType('attachments', 'entity_type'), 'enum') === 0) {
    Db::pdo()->exec('ALTER TABLE attachments MODIFY entity_type VARCHAR(30) NOT NULL');
}
echo "Schema OK\n";

$code = strtoupper((string) (getenv('COMPANY_CODE') ?: 'KESHAV'));
// Keep the company name in sync with COMPANY_NAME (rebrands)
if (getenv('COMPANY_NAME')) Db::exec('UPDATE companies SET name = ? WHERE code = ?', [getenv('COMPANY_NAME'), $code]);
if (!Db::value('SELECT id FROM companies WHERE code = ?', [$code])) {
    $pass = getenv('ADMIN_PASSWORD');
    if (!$pass) { fwrite(STDERR, "ADMIN_PASSWORD not set — skipping owner creation\n"); }
    else {
        $cid = Db::insert('companies', ['code' => $code, 'name' => getenv('COMPANY_NAME') ?: 'Keshav Home Solution']);
        foreach (['Sales', 'Accounts', 'Store', 'Delivery', 'Marketing', 'HR'] as $d) Db::insert('departments', ['company_id' => $cid, 'name' => $d]);
        foreach ([['casual', 'Casual leave', 12, 0], ['sick', 'Sick leave', 8, 0], ['earned', 'Earned leave', 15, 30], ['compoff', 'Comp-off', 0, 0]] as [$c, $n, $q, $cf]) {
            Db::insert('leave_types', ['company_id' => $cid, 'code' => $c, 'name' => $n, 'yearly_quota' => $q, 'carry_forward_max' => $cf]);
        }
        Db::insert('users', [
            'company_id' => $cid, 'name' => getenv('ADMIN_NAME') ?: 'Keshav Admin', 'role' => 'owner', 'designation' => 'Owner',
            'mobile' => preg_replace('/\D/', '', (string) (getenv('ADMIN_MOBILE') ?: '9000000001')),
            'email' => getenv('ADMIN_EMAIL') ?: null, 'password_hash' => password_hash($pass, PASSWORD_DEFAULT),
        ]);
        echo "Created company $code with owner account\n";
    }
} elseif (getenv('RESET_ADMIN_PASSWORD') && getenv('ADMIN_PASSWORD')) {
    // RESET_ADMIN_PASSWORD=1 sets the owner's password to ADMIN_PASSWORD on every start
    $cid = (int) Db::value('SELECT id FROM companies WHERE code = ?', [$code]);
    Db::exec("UPDATE users SET password_hash = ? WHERE company_id = ? AND role = 'owner'",
        [password_hash((string) getenv('ADMIN_PASSWORD'), PASSWORD_DEFAULT), $cid]);
    echo "Owner password reset from ADMIN_PASSWORD\n";
}

// ERP defaults (warehouses, units, roles, approval rules, sample workflows) for every company
foreach (Db::all('SELECT id FROM companies') as $c) App\Services\Erp\Seed::run((int) $c['id']);

// One-time cleanup: REMOVE_COMPANY_CODE=DEMO deletes that company and every row that belongs to it.
// Never touches the main company (COMPANY_CODE).
$remove = strtoupper((string) getenv('REMOVE_COMPANY_CODE'));
if ($remove !== '' && $remove !== $code && ($rid = Db::value('SELECT id FROM companies WHERE code = ?', [$remove]))) {
    $rid = (int) $rid;
    Db::pdo()->exec('SET FOREIGN_KEY_CHECKS = 0');
    Db::exec('DELETE c FROM task_checklist c JOIN tasks t ON t.id = c.task_id WHERE t.company_id = ?', [$rid]);
    Db::exec('DELETE c FROM task_comments c JOIN tasks t ON t.id = c.task_id WHERE t.company_id = ?', [$rid]);
    Db::exec('DELETE a FROM task_activity a JOIN tasks t ON t.id = a.task_id WHERE t.company_id = ?', [$rid]);
    Db::exec('DELETE o FROM otp_codes o JOIN users u ON u.id = o.user_id WHERE u.company_id = ?', [$rid]);
    Db::exec('DELETE m FROM chat_messages m JOIN chat_rooms r ON r.id = m.room_id WHERE r.company_id = ?', [$rid]);
    Db::exec('DELETE m FROM chat_members m JOIN chat_rooms r ON r.id = m.room_id WHERE r.company_id = ?', [$rid]);
    foreach (['tasks', 'recurring_rules', 'attachments', 'attendance', 'location_pings', 'requests', 'timesheet_entries', 'projects', 'events',
              'chat_rooms', 'campaigns', 'notifications', 'whatsapp_log', 'rewards', 'ai_suggestions', 'goals', 'geofences', 'leave_types',
              'holidays', 'users', 'departments'] as $table) {
        Db::exec("DELETE FROM $table WHERE company_id = ?", [$rid]);
    }
    Db::exec('DELETE FROM companies WHERE id = ?', [$rid]);
    Db::pdo()->exec('SET FOREIGN_KEY_CHECKS = 1');
    echo "Removed company $remove and all its data\n";
}

if (filter_var(getenv('DEMO_DATA') ?: '0', FILTER_VALIDATE_BOOLEAN)) {
    passthru(PHP_BINARY . ' ' . escapeshellarg(__DIR__ . '/seed.php') . ' ' . escapeshellarg(getenv('DEMO_COMPANY_CODE') ?: 'DEMO'));
}
