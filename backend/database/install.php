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
echo "Schema OK\n";

$code = strtoupper((string) (getenv('COMPANY_CODE') ?: 'KESHAV'));
if (!Db::value('SELECT id FROM companies WHERE code = ?', [$code])) {
    $pass = getenv('ADMIN_PASSWORD');
    if (!$pass) { fwrite(STDERR, "ADMIN_PASSWORD not set — skipping owner creation\n"); }
    else {
        $cid = Db::insert('companies', ['code' => $code, 'name' => getenv('COMPANY_NAME') ?: 'Keshav Architectural Hardware']);
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
}

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
