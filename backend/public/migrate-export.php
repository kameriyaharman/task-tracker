<?php
// TEMPORARY — read-only export used once to copy Railway data to BigRock (keshavkunj.com).
// Works only when the MIGRATE_TOKEN environment variable is set (Railway only) and the
// request sends the same value in the X-Migrate-Token header. Removed after migration.
header('Content-Type: application/json');
$token = getenv('MIGRATE_TOKEN');
$given = $_SERVER['HTTP_X_MIGRATE_TOKEN'] ?? '';
if (!$token || strlen($token) < 32 || !hash_equals($token, $given)) {
    http_response_code(404);
    echo json_encode(['error' => 'Not found']);
    exit;
}
set_time_limit(120);
$pdo = new PDO(
    sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', getenv('MYSQLHOST'), (int) (getenv('MYSQLPORT') ?: 3306), getenv('MYSQLDATABASE')),
    getenv('MYSQLUSER'), getenv('MYSQLPASSWORD'),
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
);
$pdo->exec("SET time_zone = '+05:30'");
$uploads = rtrim(getenv('UPLOAD_DIR') ?: dirname(__DIR__) . '/storage/uploads', '/');
$tables = array_column($pdo->query('SHOW FULL TABLES WHERE Table_type = "BASE TABLE"')->fetchAll(PDO::FETCH_NUM), 0);
$a = $_GET['a'] ?? '';

if ($a === 'tables') {
    $out = [];
    foreach ($tables as $t) $out[$t] = (int) $pdo->query("SELECT COUNT(*) FROM `$t`")->fetchColumn();
    echo json_encode(['tables' => $out]);
    exit;
}

if ($a === 'rows') {
    $t = $_GET['table'] ?? '';
    if (!in_array($t, $tables, true)) { http_response_code(400); echo json_encode(['error' => 'bad table']); exit; }
    $off = max(0, (int) ($_GET['offset'] ?? 0));
    $lim = min(2000, max(1, (int) ($_GET['limit'] ?? 500)));
    $rows = $pdo->query("SELECT * FROM `$t` LIMIT $lim OFFSET $off")->fetchAll();
    foreach ($rows as &$row) {
        foreach ($row as &$v) {
            if (is_string($v) && !mb_check_encoding($v, 'UTF-8')) $v = ['__b64' => base64_encode($v)];
        }
        unset($v);
    }
    unset($row);
    echo json_encode(['rows' => $rows]);
    exit;
}

if ($a === 'files') {
    $list = [];
    if (is_dir($uploads)) {
        $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($uploads, FilesystemIterator::SKIP_DOTS));
        foreach ($it as $f) {
            if ($f->isFile()) $list[] = ['p' => substr($f->getPathname(), strlen($uploads) + 1), 's' => $f->getSize()];
        }
    }
    echo json_encode(['files' => $list]);
    exit;
}

if ($a === 'file') {
    $p = $_GET['p'] ?? '';
    $base = realpath($uploads);
    $full = realpath($uploads . '/' . $p);
    if (!$base || !$full || strpos($full, $base . '/') !== 0 || !is_file($full)) { http_response_code(404); echo json_encode(['error' => 'no file']); exit; }
    header('Content-Type: application/octet-stream');
    header('Content-Length: ' . filesize($full));
    readfile($full);
    exit;
}

http_response_code(400);
echo json_encode(['error' => 'unknown action']);
