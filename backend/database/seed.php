<?php
/**
 * Demo data matching the design: a sample team with tasks, attendance history, leave, chat, goals.
 *   php database/seed.php [CODE]     → loads schema + demo company (default code DEMO)
 * Owner login (admin panel): company DEMO · mobile 9800011220 · password admin123
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
require dirname(__DIR__) . '/src/bootstrap.php';

use App\Core\Db;

$pdo = Db::pdo();
$pdo->exec(file_get_contents(__DIR__ . '/schema.sql'));
$code = strtoupper($argv[1] ?? getenv('DEMO_COMPANY_CODE') ?: 'DEMO');
if (Db::value('SELECT id FROM companies WHERE code = ?', [$code])) { echo "Demo company $code already exists.\n"; exit; }

$d = fn(string $rel) => date('Y-m-d H:i:s', strtotime($rel));
$cid = Db::insert('companies', ['code' => $code, 'name' => $code === 'KESHAV' ? 'Keshav Architectural Hardware' : 'Keshav Demo Team', 'shift_start' => '09:30:00', 'shift_end' => '18:30:00', 'whatsapp_enabled' => 1, 'gcal_enabled' => 1]);

$dept = [];
foreach (['Sales', 'Accounts', 'Operations', 'Marketing', 'HR', 'Field'] as $n) $dept[$n] = Db::insert('departments', ['company_id' => $cid, 'name' => $n]);

$pw = password_hash(getenv('DEMO_ADMIN_PASSWORD') ?: 'admin123', PASSWORD_DEFAULT);
$u = [];
$u['rajesh'] = Db::insert('users', ['company_id' => $cid, 'name' => 'Rajesh Jain', 'mobile' => '9800011220', 'email' => 'rajesh@keshav.in', 'designation' => 'Owner', 'role' => 'owner', 'password_hash' => $pw, 'location_consent' => 1]);
$people = [
    ['rohit', 'Rohit Mehra', '9800011221', 'Sales Executive', 'Sales', 'manager'],
    ['anjali', 'Anjali Gupta', '9800011222', 'Accountant', 'Accounts', 'employee'],
    ['vikas', 'Vikas Yadav', '9800011223', 'Plant Supervisor', 'Operations', 'employee'],
    ['imran', 'Imran Khan', '9800011224', 'Field Executive', 'Field', 'employee'],
    ['sneha', 'Sneha Rao', '9800011225', 'HR Executive', 'HR', 'employee'],
    ['pooja', 'Pooja Nair', '9800011226', 'Marketing Executive', 'Marketing', 'employee'],
];
foreach ($people as [$k, $name, $mob, $des, $dp, $role]) {
    $u[$k] = Db::insert('users', ['company_id' => $cid, 'name' => $name, 'mobile' => $mob, 'designation' => $des, 'role' => $role,
        'department_id' => $dept[$dp], 'manager_id' => $u['rajesh'], 'location_consent' => 1, 'joined_on' => '2024-04-01',
        'password_hash' => $role === 'manager' ? $pw : null]);
}
Db::exec('UPDATE users SET manager_id = ? WHERE id = ?', [$u['rohit'], $u['imran']]);

Db::insert('geofences', ['company_id' => $cid, 'name' => 'Head office', 'lat' => 28.5921, 'lng' => 77.0460, 'radius_m' => 200]);
Db::insert('geofences', ['company_id' => $cid, 'name' => 'Plant 2', 'lat' => 28.6100, 'lng' => 77.0300, 'radius_m' => 300]);

foreach ([['casual', 'Casual leave', 12, 0], ['sick', 'Sick leave', 8, 0], ['earned', 'Earned leave', 15, 30], ['compoff', 'Comp-off', 0, 0]] as [$c, $n, $q, $cf]) {
    Db::insert('leave_types', ['company_id' => $cid, 'code' => $c, 'name' => $n, 'yearly_quota' => $q, 'carry_forward_max' => $cf]);
}

$goal = Db::insert('goals', ['company_id' => $cid, 'title' => 'Revenue ₹1.2 Cr', 'scope' => 'company', 'period_label' => 'Q4 (Oct–Dec)', 'target_value' => 12000000, 'current_value' => 7680000, 'unit' => '₹', 'status' => 'at_risk']);
$g2 = Db::insert('goals', ['company_id' => $cid, 'parent_id' => null, 'title' => 'Close 40 deals', 'scope' => 'department', 'department_id' => $dept['Sales'], 'target_value' => 40, 'current_value' => 29, 'unit' => 'deals', 'status' => 'on_track']);
Db::insert('goals', ['company_id' => $cid, 'title' => 'Zero overdue tasks', 'scope' => 'company', 'target_value' => 100, 'current_value' => 81, 'unit' => '%', 'status' => 'on_track']);
Db::insert('goals', ['company_id' => $cid, 'title' => 'Hire 5 people', 'scope' => 'department', 'department_id' => $dept['HR'], 'target_value' => 5, 'current_value' => 2, 'status' => 'behind']);
Db::insert('goals', ['company_id' => $cid, 'parent_id' => $goal, 'title' => 'Close 40 deals (Sales)', 'scope' => 'department', 'department_id' => $dept['Sales'], 'target_value' => 40, 'current_value' => 29]);
Db::insert('goals', ['company_id' => $cid, 'parent_id' => $goal, 'title' => 'Collect ₹30 L dues (Accounts)', 'scope' => 'department', 'department_id' => $dept['Accounts'], 'target_value' => 3000000, 'current_value' => 1900000]);

$task = function (array $t) use ($cid, $u, $dept) {
    $id = Db::insert('tasks', $t + ['company_id' => $cid, 'assigned_by' => $u['rajesh']]);
    return $id;
};
$gst = $task(['title' => 'Send GST return data to CA', 'assigned_to' => $u['anjali'], 'department_id' => $dept['Accounts'], 'priority' => 'high', 'status' => 'in_progress', 'due_at' => $d('-2 hours'), 'send_whatsapp' => 1, 'remind_before_min' => 60]);
foreach (['Sales register Oct', 'Purchase register Oct', 'Bank statement', 'Expense bills'] as $i => $l) Db::insert('task_checklist', ['task_id' => $gst, 'label' => $l, 'is_done' => $i < 2 ? 1 : 0, 'sort_order' => $i]);
Db::insert('task_comments', ['task_id' => $gst, 'user_id' => $u['rajesh'], 'body' => 'CA ko aaj hi bhejna hai please']);
$task(['title' => 'Follow up 12 pending leads', 'assigned_to' => $u['rohit'], 'department_id' => $dept['Sales'], 'priority' => 'high', 'status' => 'in_progress', 'due_at' => date('Y-m-d 18:00:00'), 'goal_id' => $g2]);
$task(['title' => 'Collect payment — Sharma Traders', 'assigned_to' => $u['imran'], 'department_id' => $dept['Field'], 'priority' => 'high', 'status' => 'in_progress', 'due_at' => date('Y-m-d 16:00:00'), 'proof_type' => 'location']);
$task(['title' => 'Post Diwali offer reel', 'assigned_to' => $u['pooja'], 'department_id' => $dept['Marketing'], 'priority' => 'medium', 'due_at' => $d('tomorrow 18:00')]);
$task(['title' => 'Onboard 2 new joiners', 'assigned_to' => $u['sneha'], 'department_id' => $dept['HR'], 'priority' => 'low', 'due_at' => $d('friday 18:00')]);
$task(['title' => 'Prepare quotation for Mehta Builders', 'assigned_to' => $u['rohit'], 'department_id' => $dept['Sales'], 'priority' => 'high', 'due_at' => date('Y-m-d 18:00:00'), 'send_whatsapp' => 1, 'remind_before_min' => 60]);

// recurring rules
$rr = fn(array $r) => Db::insert('recurring_rules', $r + ['company_id' => $cid, 'created_by' => $u['rajesh']]);
$rr(['title' => 'Daily machine maintenance checklist', 'assignee_id' => $u['vikas'], 'department_id' => $dept['Operations'], 'frequency' => 'daily', 'weekdays' => '1,2,3,4,5,6', 'due_time' => '10:00:00', 'proof_type' => 'photo,location',
     'rotation_json' => json_encode([$u['vikas'], $u['imran']]), 'checklist_json' => json_encode(['Oil all machines', 'Check belts', 'Clean filters', 'Log readings'])]);
$rr(['title' => 'Bank reconciliation', 'assignee_id' => $u['anjali'], 'department_id' => $dept['Accounts'], 'frequency' => 'weekly', 'weekdays' => '1', 'due_time' => '12:00:00', 'proof_type' => 'file']);
$rr(['title' => 'Social media posts', 'assignee_id' => $u['pooja'], 'department_id' => $dept['Marketing'], 'frequency' => 'weekly', 'weekdays' => '1,3,5', 'due_time' => '11:00:00', 'proof_type' => 'link']);
$rr(['title' => 'Stock count — godown', 'assignee_id' => $u['vikas'], 'department_id' => $dept['Operations'], 'frequency' => 'monthly', 'month_day' => 1, 'due_time' => '17:00:00', 'proof_type' => 'photo']);
$rr(['title' => 'Payroll', 'assignee_id' => $u['sneha'], 'department_id' => $dept['HR'], 'frequency' => 'monthly', 'month_day' => 25, 'due_time' => '17:00:00', 'proof_type' => 'file']);
$rr(['title' => 'Lead follow-up review', 'assignee_id' => $u['rohit'], 'department_id' => $dept['Sales'], 'frequency' => 'daily', 'weekdays' => '1,2,3,4,5,6', 'due_time' => '18:00:00']);

// history: past 30 working days of attendance + completed tasks
$names = ['rohit', 'anjali', 'vikas', 'imran', 'sneha', 'pooja'];
for ($i = 30; $i >= 1; $i--) {
    $day = strtotime("-$i days");
    if (date('N', $day) == 7) continue;
    $date = date('Y-m-d', $day);
    foreach ($names as $k) {
        $late = random_int(0, 9) === 0;
        $field = $k === 'imran' && random_int(0, 2) === 0;
        $in = $late ? '09:52:00' : '09:' . str_pad((string) random_int(10, 35), 2, '0', STR_PAD_LEFT) . ':00';
        Db::insert('attendance', ['company_id' => $cid, 'user_id' => $u[$k], 'work_date' => $date, 'mode' => $field ? 'field' : 'office',
            'status' => $field ? 'field' : ($late ? 'late' : 'present'), 'punch_in_at' => "$date $in", 'punch_out_at' => "$date 18:" . random_int(30, 59) . ':00',
            'worked_minutes' => random_int(520, 560), 'late_minutes' => $late ? 22 : 0, 'punch_in_place' => $field ? 'Field' : 'Head office']);
        for ($n = 0; $n < random_int(1, 3); $n++) {
            $due = "$date 17:00:00";
            $done = date('Y-m-d H:i:s', strtotime($due) + (random_int(0, 9) < 8 ? -random_int(600, 20000) : random_int(1800, 30000)));
            Db::insert('tasks', ['company_id' => $cid, 'title' => ['Client call', 'Daily report', 'Invoice entry', 'Site visit', 'Update CRM'][random_int(0, 4)],
                'assigned_to' => $u[$k], 'assigned_by' => $u['rajesh'], 'status' => 'done', 'due_at' => $due, 'created_at' => "$date 09:00:00",
                'completed_at' => $done, 'manager_rating' => random_int(4, 5)]);
        }
    }
}
// today's punches
$today = date('Y-m-d');
foreach ([['rohit', '09:42', 'Head office', 'present', 0], ['anjali', '09:30', 'Head office', 'present', 0], ['vikas', '09:05', 'Plant 2', 'present', 0],
          ['imran', '10:10', 'Sharma Traders', 'field', 0], ['sneha', '10:22', 'Head office', 'late', 52]] as [$k, $t, $place, $st, $late]) {
    if (strtotime("$today $t") > time()) continue;
    Db::insert('attendance', ['company_id' => $cid, 'user_id' => $u[$k], 'work_date' => $today, 'mode' => $st === 'field' ? 'field' : 'office',
        'status' => $st, 'punch_in_at' => "$today $t:00", 'punch_in_place' => $place, 'late_minutes' => $late,
        'punch_in_lat' => 28.5921, 'punch_in_lng' => 77.0460, 'punch_in_geofence_id' => $st === 'field' ? null : 1]);
}
Db::insert('location_pings', ['company_id' => $cid, 'user_id' => $u['imran'], 'lat' => 28.6050, 'lng' => 77.0620, 'activity' => 'visit', 'place_label' => 'Sharma Traders', 'recorded_at' => $d('-20 minutes')]);
Db::insert('location_pings', ['company_id' => $cid, 'user_id' => $u['rohit'], 'lat' => 28.6300, 'lng' => 77.0800, 'activity' => 'moving', 'recorded_at' => $d('-5 minutes')]);
Db::insert('location_pings', ['company_id' => $cid, 'user_id' => $u['vikas'], 'lat' => 28.6101, 'lng' => 77.0301, 'activity' => 'still', 'place_label' => 'Plant 2', 'recorded_at' => $d('-8 minutes')]);

// approvals
$casual = (int) Db::value("SELECT id FROM leave_types WHERE company_id = ? AND code = 'casual'", [$cid]);
Db::insert('requests', ['company_id' => $cid, 'user_id' => $u['rohit'], 'approver_id' => $u['rajesh'], 'type' => 'leave', 'leave_type_id' => $casual,
    'from_date' => date('Y-m-d', strtotime('+6 days')), 'to_date' => date('Y-m-d', strtotime('+7 days')), 'days' => 2, 'handover_to' => $u['anjali'], 'reason' => 'Family function']);
Db::insert('requests', ['company_id' => $cid, 'user_id' => $u['imran'], 'approver_id' => $u['rohit'], 'type' => 'expense', 'amount' => 640, 'reason' => 'travel']);
Db::insert('requests', ['company_id' => $cid, 'user_id' => $u['sneha'], 'approver_id' => $u['rajesh'], 'type' => 'regularise', 'from_date' => date('Y-m-d', strtotime('-4 days')), 'reason' => 'Forgot to punch']);

// chat
$room = Db::insert('chat_rooms', ['company_id' => $cid, 'name' => 'Sales team', 'is_group' => 1, 'department_id' => $dept['Sales'], 'created_by' => $u['rajesh'], 'last_message_at' => $d('-30 minutes')]);
foreach (['rajesh', 'rohit', 'imran'] as $k) Db::insert('chat_members', ['room_id' => $room, 'user_id' => $u[$k]]);
Db::insert('chat_messages', ['room_id' => $room, 'user_id' => $u['rajesh'], 'body' => 'Aaj sabhi pending leads close karo 💪', 'created_at' => $d('-2 hours')]);
Db::insert('chat_messages', ['room_id' => $room, 'user_id' => $u['rohit'], 'body' => 'Ji sir, 8/12 done', 'created_at' => $d('-1 hour')]);

// campaigns
foreach ([['Customer testimonial reel', 'Instagram', 'idea', null], ['Year-end offer mailer', 'Email', 'idea', null], ['Diwali offer reel', 'Instagram', 'production', 'Editing'],
          ['Blog: GST tips', 'Website', 'production', 'Draft'], ['Festive banner', 'Facebook', 'scheduled', null], ['Navratri campaign', 'Instagram', 'live', null]] as [$t, $ch, $st, $sub]) {
    Db::insert('campaigns', ['company_id' => $cid, 'title' => $t, 'channel' => $ch, 'stage' => $st, 'sub_status' => $sub,
        'owner_id' => $t === 'Blog: GST tips' ? $u['anjali'] : $u['pooja'], 'go_live_on' => date('Y-m-d', strtotime('+' . random_int(1, 5) . ' days')),
        'reach' => $st === 'live' ? 48000 : null, 'leads' => $st === 'live' ? 312 : null]);
}

echo "Seeded demo company $code · owner mobile 9800011220 · password admin123\n";
