<?php
/**
 * Cron entry point. On cPanel/Hostinger add ONE cron job, every 5 minutes:
 *   php /home/USER/public_html/api/cron/run.php
 * It generates recurring tasks, sends "due in 1 hour" reminders, overdue alerts and
 * auto-closes forgotten punches.
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }

require dirname(__DIR__) . '/src/bootstrap.php';

use App\Core\Db;
use App\Services\{Log, Notifier, RecurringEngine, WhatsApp};

$lock = fopen(sys_get_temp_dir() . '/keshav-cron.lock', 'c');
if (!flock($lock, LOCK_EX | LOCK_NB)) exit;

// 1. Recurring tasks for today (idempotent) and tomorrow early so "Upcoming" shows them.
$made = RecurringEngine::runForDate(date('Y-m-d'));

// 2. Reminders "X minutes before"
$due = Db::all("SELECT t.*, u.mobile, u.name AS assignee_name, u.notify_whatsapp, u.language, u.id AS uid
                  FROM tasks t JOIN users u ON u.id = t.assigned_to
                 WHERE t.status NOT IN ('done','cancelled') AND t.remind_before_min IS NOT NULL AND t.reminder_sent_at IS NULL
                   AND t.due_at > NOW() AND t.due_at <= NOW() + INTERVAL t.remind_before_min MINUTE");
foreach ($due as $t) {
    $mins = (int) round((strtotime($t['due_at']) - time()) / 60);
    $when = $mins >= 60 ? round($mins / 60) . ' hour' . ($mins >= 120 ? 's' : '') : "$mins min";
    Notifier::notify((int) $t['company_id'], (int) $t['assigned_to'], 'reminder', "⏰ Due in $when", $t['title'], 'task', (int) $t['id']);
    if ($t['send_whatsapp']) {
        WhatsApp::send((int) $t['company_id'], ['id' => $t['uid'], 'mobile' => $t['mobile'], 'notify_whatsapp' => $t['notify_whatsapp'], 'language' => $t['language']],
            "⏰ Reminder: {$t['title']} — due in $when", (int) $t['id']);
    }
    Db::exec('UPDATE tasks SET reminder_sent_at = NOW() WHERE id = ?', [$t['id']]);
}

// 3. Overdue alert once (to assignee + assigner) when a task crosses its deadline
$over = Db::all("SELECT t.* FROM tasks t WHERE t.status NOT IN ('done','cancelled') AND t.due_at < NOW() AND t.due_at > NOW() - INTERVAL 10 MINUTE");
foreach ($over as $t) {
    $already = Db::value("SELECT 1 FROM notifications WHERE type = 'task_overdue' AND entity_id = ? LIMIT 1", [$t['id']]);
    if ($already) continue;
    $name = Db::value('SELECT name FROM users WHERE id = ?', [$t['assigned_to']]);
    Notifier::notify((int) $t['company_id'], (int) $t['assigned_to'], 'task_overdue', 'Overdue: ' . $t['title'], null, 'task', (int) $t['id']);
    if ($t['assigned_by'] != $t['assigned_to']) {
        Notifier::notify((int) $t['company_id'], (int) $t['assigned_by'], 'task_overdue', 'Overdue: ' . $t['title'], "$name · late", 'task', (int) $t['id']);
    }
}

// 3b. Escalation: still open 24 h after the deadline → assignee's manager and the boss are told (once)
$esc = Db::all("SELECT t.* FROM tasks t WHERE t.status NOT IN ('done','cancelled') AND t.escalated_at IS NULL AND t.due_at < NOW() - INTERVAL 24 HOUR");
foreach ($esc as $t) {
    $cid = (int) $t['company_id'];
    $who = Db::one('SELECT name, manager_id FROM users WHERE id = ?', [$t['assigned_to']]);
    $to = array_map('intval', array_column(Db::all("SELECT id FROM users WHERE company_id = ? AND role = 'owner' AND is_active = 1", [$cid]), 'id'));
    if (!empty($who['manager_id'])) $to[] = (int) $who['manager_id'];
    foreach (array_unique($to) as $uid) {
        if ($uid !== (int) $t['assigned_to']) Notifier::notify($cid, $uid, 'task_escalated', 'Escalated: ' . $t['title'], ($who['name'] ?? '') . ' · overdue by more than a day', 'task', (int) $t['id']);
    }
    Db::exec('UPDATE tasks SET escalated_at = NOW() WHERE id = ?', [$t['id']]);
}

// 3c. Workflow runs: advance any run whose current tasks are all closed (safety net)
foreach (Db::all("SELECT r.id FROM workflow_runs r WHERE r.status = 'running' AND NOT EXISTS
          (SELECT 1 FROM tasks t WHERE t.workflow_run_id = r.id AND t.status IN ('not_started','in_progress','on_hold'))") as $r) {
    App\Services\Erp\Workflow::advance((int) $r['id']);
}

// 4. At 23:55 close punches left open (worked till shift end)
if (date('H:i') >= '23:50') {
    Db::exec("UPDATE attendance a JOIN companies c ON c.id = a.company_id
                 SET a.punch_out_at = CONCAT(a.work_date, ' ', c.shift_end),
                     a.worked_minutes = GREATEST(0, TIMESTAMPDIFF(MINUTE, a.punch_in_at, CONCAT(a.work_date, ' ', c.shift_end)))
               WHERE a.work_date = CURDATE() AND a.punch_in_at IS NOT NULL AND a.punch_out_at IS NULL");
}

Log::write('cron', "recurring=$made reminders=" . count($due) . ' overdue=' . count($over));
