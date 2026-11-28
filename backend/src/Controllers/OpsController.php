<?php
namespace App\Controllers;

use App\Core\{Controller, Db, HttpError};
use App\Services\Upload;

/**
 * ONE-TIME go-live reset (owner-approved, 28 Nov 2026). Removed right after use.
 * Backs the whole database up to storage/backups, then deletes all demo/test data,
 * keeps the company set-up, and keeps one owner login with new credentials.
 */
final class OpsController extends Controller
{
    private const TOKEN_SHA256 = '09c256413191e68b68f66c3a3766c7d50feae0a1abe80f886bcc7fc3d200531c';
    private const KEEP = ['companies', 'approval_rules', 'customer_types', 'departments', 'erp_roles', 'expense_categories',
        'kb_entries', 'leave_types', 'task_templates', 'units', 'warehouses', 'workflows', 'users'];

    public function reset(): array
    {
        $tok = (string) ($_SERVER['HTTP_X_OPS_TOKEN'] ?? '');
        if (!$tok || !hash_equals(self::TOKEN_SHA256, hash('sha256', $tok))) throw HttpError::notFound();
        $mobile = (string) $this->req->input('mobile');
        $pass = (string) $this->req->input('password');
        if (!preg_match('/^\d{10}$/', $mobile) || strlen($pass) < 8) throw HttpError::badRequest('mobile/password');
        @set_time_limit(300);
        $pdo = Db::pdo();
        $tables = $pdo->query('SHOW TABLES')->fetchAll(\PDO::FETCH_COLUMN);

        // 1. full backup (SQL, gzipped) — storage/ is never served over the web
        $dir = dirname(__DIR__, 2) . '/storage/backups';
        if (!is_dir($dir)) mkdir($dir, 0770, true);
        $file = $dir . '/before-go-live-' . date('Ymd-His') . '.sql.gz';
        $gz = gzopen($file, 'w6');
        $rowsBacked = 0;
        foreach ($tables as $t) {
            $st = $pdo->query("SELECT * FROM `$t`");
            while ($r = $st->fetch(\PDO::FETCH_ASSOC)) {
                $vals = array_map(fn($v) => $v === null ? 'NULL' : $pdo->quote((string) $v), array_values($r));
                gzwrite($gz, "INSERT INTO `$t` (`" . implode('`,`', array_keys($r)) . "`) VALUES (" . implode(',', $vals) . ");\n");
                $rowsBacked++;
            }
        }
        gzclose($gz);

        // 2. wipe
        $owner = Db::one("SELECT * FROM users WHERE role = 'owner' ORDER BY id LIMIT 1");
        if (!$owner) throw HttpError::badRequest('no owner');
        $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
        $wiped = [];
        foreach ($tables as $t) {
            if (in_array($t, self::KEEP, true)) continue;
            $n = (int) $pdo->query("SELECT COUNT(*) FROM `$t`")->fetchColumn();
            $pdo->exec("TRUNCATE TABLE `$t`");
            $wiped[$t] = $n;
        }
        $wiped['users'] = (int) Db::value('SELECT COUNT(*) FROM users WHERE id <> ?', [$owner['id']]);
        Db::exec('DELETE FROM users WHERE id <> ?', [$owner['id']]);
        $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
        Db::exec('UPDATE departments SET head_user_id = NULL');
        Db::exec('UPDATE users SET mobile = ?, email = NULL, password_hash = ?, pin_hash = NULL, pin_fails = 0, pin_locked_until = NULL,
            manager_id = NULL, deputy_id = NULL, department_id = NULL WHERE id = ?', [$mobile, password_hash($pass, PASSWORD_DEFAULT), $owner['id']]);

        // business profile: drop demo contact details, keep the name and the digital-card link
        $c = Db::one('SELECT id, name, erp_settings FROM companies ORDER BY id LIMIT 1');
        $s = json_decode((string) $c['erp_settings'], true) ?: [];
        $s['profile'] = ['display_name' => $s['profile']['display_name'] ?? $c['name']];
        Db::exec('UPDATE companies SET erp_settings = ? WHERE id = ?', [json_encode($s, JSON_UNESCAPED_UNICODE), $c['id']]);

        // 3. uploaded files (photos, voice, documents)
        $files = 0;
        $up = Upload::dir();
        $it = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($up, \FilesystemIterator::SKIP_DOTS), \RecursiveIteratorIterator::CHILD_FIRST);
        foreach ($it as $f) {
            if ($f->getFilename() === '.htaccess') continue;
            if ($f->isDir()) @rmdir($f->getPathname()); elseif (@unlink($f->getPathname())) $files++;
        }
        return ['backup' => basename($file), 'backup_rows' => $rowsBacked, 'wiped' => array_filter($wiped), 'files_deleted' => $files,
            'owner' => Db::one('SELECT id, name, mobile, role FROM users WHERE id = ?', [$owner['id']])];
    }
}
