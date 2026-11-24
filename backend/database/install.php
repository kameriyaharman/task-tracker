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
// v3 — client feedback: urgent priority, checklist owners, repeat window, task templates
foreach (['tasks', 'recurring_rules'] as $tb) {
    if (strpos($colType($tb, 'priority'), 'urgent') === false) {
        Db::pdo()->exec("ALTER TABLE $tb MODIFY priority ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium'");
    }
}
if (!$col('task_checklist', 'assigned_to')) {
    Db::pdo()->exec('ALTER TABLE task_checklist ADD COLUMN assigned_to INT UNSIGNED NULL, ADD COLUMN done_by INT UNSIGNED NULL, ADD COLUMN done_at DATETIME NULL, ADD KEY idx_cl_user (assigned_to)');
}
if (!$col('recurring_rules', 'starts_on')) {
    Db::pdo()->exec('ALTER TABLE recurring_rules ADD COLUMN starts_on DATE NULL, ADD COLUMN start_time TIME NULL');
}
Db::pdo()->exec("CREATE TABLE IF NOT EXISTS task_templates (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  code VARCHAR(20) NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NULL,
  department_id INT UNSIGNED NULL,
  priority ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
  proof_type VARCHAR(40) NULL,
  checklist_json TEXT NULL,
  due_hours SMALLINT NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tpl_code (company_id, code),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
// v4 — task approval, backup approver, escalation chain, emergency, handover, goal updates, knowledge base, complaint analysis
if (strpos($colType('task_activity', 'action'), '255') === false) Db::pdo()->exec('ALTER TABLE task_activity MODIFY action VARCHAR(255) NOT NULL');
if (!$col('users', 'deputy_id')) Db::pdo()->exec('ALTER TABLE users ADD COLUMN deputy_id INT UNSIGNED NULL');
if (!$col('tasks', 'approval_status')) {
    Db::pdo()->exec("ALTER TABLE tasks ADD COLUMN approval_status ENUM('none','pending','rejected') NOT NULL DEFAULT 'none',
        ADD COLUMN approver_id INT UNSIGNED NULL, ADD COLUMN approved_by INT UNSIGNED NULL, ADD COLUMN approval_note VARCHAR(255) NULL,
        ADD COLUMN escalation_level TINYINT NOT NULL DEFAULT 0, ADD COLUMN is_emergency TINYINT(1) NOT NULL DEFAULT 0");
    // tasks already late when this ships don't flood everyone with escalations
    Db::exec("UPDATE tasks SET escalation_level = 4 WHERE status NOT IN ('done','cancelled') AND due_at < NOW()");
}
if (!$col('goals', 'measure')) Db::pdo()->exec("ALTER TABLE goals ADD COLUMN measure ENUM('manual','tasks') NOT NULL DEFAULT 'manual'");
if (!$col('complaints', 'category')) {
    Db::pdo()->exec('ALTER TABLE complaints ADD COLUMN category VARCHAR(40) NULL, ADD COLUMN product_id INT UNSIGNED NULL, ADD COLUMN root_cause TEXT NULL');
}
Db::pdo()->exec("CREATE TABLE IF NOT EXISTS task_watchers (
  task_id INT UNSIGNED NOT NULL, user_id INT UNSIGNED NOT NULL, reason VARCHAR(20) NOT NULL DEFAULT 'escalation',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (task_id, user_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
Db::pdo()->exec("CREATE TABLE IF NOT EXISTS task_handovers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, company_id INT UNSIGNED NOT NULL,
  from_user INT UNSIGNED NOT NULL, to_user INT UNSIGNED NOT NULL, by_user INT UNSIGNED NOT NULL,
  task_ids TEXT NOT NULL, note VARCHAR(255) NULL, until_date DATE NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, returned_at DATETIME NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
Db::pdo()->exec("CREATE TABLE IF NOT EXISTS goal_updates (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, goal_id INT UNSIGNED NOT NULL, user_id INT UNSIGNED NOT NULL,
  added DECIMAL(14,2) NOT NULL DEFAULT 0, new_value DECIMAL(14,2) NOT NULL, note VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
Db::pdo()->exec("CREATE TABLE IF NOT EXISTS kb_entries (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, company_id INT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL, problem TEXT NULL, lesson TEXT NOT NULL, category VARCHAR(40) NULL, tags VARCHAR(200) NULL,
  source_type VARCHAR(20) NULL, source_id INT UNSIGNED NULL, created_by INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NULL,
  KEY idx_kb_src (source_type, source_id),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
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

// Old complaints without a category get one from their title (for the analysis page)
Db::exec("UPDATE complaints SET category = CASE
    WHEN type = 'maintenance' THEN 'Shop maintenance'
    WHEN title LIKE '%short%' OR title LIKE '%wrong%' OR title LIKE '%missing%' THEN 'Short / wrong supply'
    WHEN title LIKE '%late%' OR title LIKE '%delay%' THEN 'Late delivery'
    WHEN title LIKE '%damag%' OR title LIKE '%broken%' OR title LIKE '%crack%' THEN 'Damaged in delivery'
    WHEN title LIKE '%bill%' OR title LIKE '%rate%' OR title LIKE '%price%' THEN 'Billing / rate'
    WHEN title LIKE '%noise%' OR title LIKE '%not work%' OR title LIKE '%leak%' OR title LIKE '%defect%' THEN 'Product defect'
    ELSE 'Other' END WHERE category IS NULL");

// A few example lessons so the knowledge base isn't empty on day one
foreach (Db::all('SELECT id FROM companies') as $c) {
    if (Db::value('SELECT 1 FROM kb_entries WHERE company_id = ?', [$c['id']])) continue;
    $by = Db::value("SELECT id FROM users WHERE company_id = ? AND role = 'owner' ORDER BY id LIMIT 1", [$c['id']]);
    if (!$by) continue;
    foreach ([
        ['Seal joints before pouring concrete', 'Concrete slurry leaked through shuttering joints at a customer site.', 'Put tape / foam on all shuttering joints before pouring. Check once more just before the pour.', 'Site work', 'concrete, leakage, shuttering'],
        ['Count coils in front of the customer', 'Customer complained 2 wire coils were short after delivery.', 'Delivery boy counts every bundle with the customer and takes a photo of the material before taking OTP.', 'Delivery', 'short supply, wire, OTP'],
        ['Check paint shade code on the bill', 'Wrong shade given — customer had to come back.', 'Write the shade code on the bill and read it out to the customer before packing.', 'Products', 'paint, shade'],
        ['Confirm credit limit before giving material on udhari', 'Material given to a contractor whose old dues were already overdue.', 'Check customer outstanding on the bill screen; above limit needs manager approval.', 'Accounts', 'credit, udhari, recovery'],
    ] as [$t, $pb, $l, $cat, $tags]) {
        Db::insert('kb_entries', ['company_id' => $c['id'], 'title' => $t, 'problem' => $pb, 'lesson' => $l, 'category' => $cat, 'tags' => $tags, 'created_by' => $by]);
    }
}

// Starter task templates (standard showroom jobs) — only when a company has none yet
foreach (Db::all('SELECT id FROM companies') as $c) {
    if (Db::value('SELECT 1 FROM task_templates WHERE company_id = ?', [$c['id']])) continue;
    $dept = fn(string $n) => Db::value('SELECT id FROM departments WHERE company_id = ? AND name LIKE ? LIMIT 1', [$c['id'], "%$n%"]) ?: null;
    $tpl = [
        ['T01', 'Collect bill, enter in Tally, make payment', 'Accounts', 'high', 'photo', 8, ['Collect the bill from vendor', 'Bill received at office', 'Entry done in Tally', 'Payment made']],
        ['T02', 'Pay shop rent', 'Accounts', 'high', 'photo', 24, ['Rent amount confirmed', 'Payment done', 'Receipt photo uploaded']],
        ['T03', 'Vehicle service', 'Delivery', 'medium', 'photo', 48, ['Book service slot', 'Vehicle dropped', 'Service bill collected']],
        ['T04', 'Daily stock count — fast-moving items', 'Stores', 'medium', 'photo', 4, ['Count fast-moving items', 'Note shortages', 'Update stock register']],
        ['T05', 'Follow up pending payment with customer', 'Sales', 'urgent', null, 4, []],
        ['T06', 'Post today\'s offer on Instagram & WhatsApp status', 'Marketing', 'medium', 'link', 4, ['Design ready', 'Posted on Instagram', 'WhatsApp status updated']],
    ];
    foreach ($tpl as [$code, $title, $d, $pri, $proof, $hrs, $cl]) {
        Db::insert('task_templates', ['company_id' => $c['id'], 'code' => $code, 'title' => $title, 'department_id' => $dept($d),
            'priority' => $pri, 'proof_type' => $proof, 'due_hours' => $hrs, 'checklist_json' => json_encode($cl, JSON_UNESCAPED_UNICODE)]);
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

// Keshav demo data (one user per role + sample data everywhere). CLEAR_DEMO_DATA=1 removes it.
if (filter_var(getenv('CLEAR_DEMO_DATA') ?: '0', FILTER_VALIDATE_BOOLEAN)) {
    passthru(PHP_BINARY . ' ' . escapeshellarg(__DIR__ . '/demo_keshav.php') . ' --clear');
} elseif (filter_var(getenv('KESHAV_DEMO') ?: '0', FILTER_VALIDATE_BOOLEAN)) {
    passthru(PHP_BINARY . ' ' . escapeshellarg(__DIR__ . '/demo_keshav.php'));
}

if (filter_var(getenv('DEMO_DATA') ?: '0', FILTER_VALIDATE_BOOLEAN)) {
    passthru(PHP_BINARY . ' ' . escapeshellarg(__DIR__ . '/seed.php') . ' ' . escapeshellarg(getenv('DEMO_COMPANY_CODE') ?: 'DEMO'));
}
