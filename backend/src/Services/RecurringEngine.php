<?php
namespace App\Services;

use App\Controllers\TaskController;
use App\Core\Db;

/** Generates task occurrences from recurring_rules. Run daily by cron (cron/daily.php). */
final class RecurringEngine
{
    /** Does the rule fire on this date? */
    public static function firesOn(array $r, int $ts): bool
    {
        $d = date('Y-m-d', $ts);
        if ($r['ends_on'] && $d > $r['ends_on']) return false;
        switch ($r['frequency']) {
            case 'daily':
                $wd = $r['weekdays'] ? array_map('intval', explode(',', $r['weekdays'])) : [1, 2, 3, 4, 5, 6];
                return in_array((int) date('N', $ts), $wd, true);
            case 'weekly':
                $wd = $r['weekdays'] ? array_map('intval', explode(',', $r['weekdays'])) : [1];
                return in_array((int) date('N', $ts), $wd, true);
            case 'monthly':
                $day = (int) ($r['month_day'] ?: 1);
                $last = (int) date('t', $ts);
                return (int) date('j', $ts) === min($day, $last);
            case 'custom':
                $n = max(1, (int) $r['interval_days']);
                $start = strtotime(date('Y-m-d', strtotime($r['created_at'])));
                return ((int) round(($ts - $start) / 86400)) % $n === 0;
        }
        return false;
    }

    /** Next N occurrence dates from $from (inclusive). */
    public static function nextDates(array $r, int $count = 3, ?int $from = null): array
    {
        $out = [];
        $ts = $from ?? strtotime('tomorrow');
        for ($i = 0; $i < 400 && count($out) < $count; $i++, $ts += 86400) {
            if (self::firesOn($r, $ts)) $out[] = date('Y-m-d', $ts);
        }
        return $out;
    }

    public static function assigneeFor(array &$r): int
    {
        $rot = $r['rotation_json'] ? json_decode($r['rotation_json'], true) : [];
        if (!$rot) return (int) $r['assignee_id'];
        $id = (int) $rot[$r['rotation_index'] % count($rot)];
        $r['rotation_index'] = ($r['rotation_index'] + 1) % count($rot);
        return $id;
    }

    /** Create the occurrence for $date if not already created. Returns task id or null. */
    public static function generate(array $r, string $date): ?int
    {
        $exists = Db::value('SELECT id FROM tasks WHERE recurring_rule_id = ? AND DATE(due_at) = ?', [$r['id'], $date]);
        if ($exists) return null;
        $assignee = self::assigneeFor($r);
        $id = Db::insert('tasks', [
            'company_id' => $r['company_id'], 'title' => $r['title'], 'description' => $r['description'],
            'assigned_to' => $assignee, 'assigned_by' => $r['created_by'], 'department_id' => $r['department_id'],
            'goal_id' => $r['goal_id'], 'recurring_rule_id' => $r['id'], 'priority' => $r['priority'],
            'due_at' => "$date {$r['due_time']}", 'proof_type' => $r['proof_type'] ?: null, 'source' => 'recurring',
            'remind_before_min' => 60,
        ]);
        TaskController::insertChecklist($id, $r['checklist_json'] ? json_decode($r['checklist_json'], true) : []);
        Db::exec('UPDATE recurring_rules SET rotation_index = ?, last_generated_on = ? WHERE id = ?', [$r['rotation_index'], $date, $r['id']]);
        Notifier::notify((int) $r['company_id'], $assignee, 'task_assigned', 'Recurring task due', $r['title'], 'task', $id);
        return $id;
    }

    /** Called by cron: create today's occurrences for every active rule. */
    public static function runForDate(string $date): int
    {
        $n = 0;
        $ts = strtotime($date);
        foreach (Db::all('SELECT * FROM recurring_rules WHERE is_active = 1') as $r) {
            if (self::firesOn($r, $ts) && self::generate($r, $date)) $n++;
        }
        return $n;
    }
}
