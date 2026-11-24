<?php
namespace App\Services;

use App\Core\Config;
use App\Core\Db;
use App\Core\HttpError;

/**
 * Stores uploads outside the web root (storage/uploads) with random names.
 * Files are served only through GET /files/{id} after auth.
 */
final class Upload
{
    private const ALLOWED = [
        'image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/heic' => 'heic',
        'application/pdf' => 'pdf',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => 'xlsx',
        'application/vnd.ms-excel' => 'xls', 'text/csv' => 'csv',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx',
        'audio/mpeg' => 'mp3', 'audio/mp4' => 'm4a', 'audio/x-m4a' => 'm4a', 'audio/aac' => 'aac',
        'audio/ogg' => 'ogg', 'audio/webm' => 'webm', 'audio/wav' => 'wav', 'audio/x-wav' => 'wav',
        'video/mp4' => 'mp4', 'video/webm' => 'webm', 'video/quicktime' => 'mov', 'image/gif' => 'gif', 'image/heif' => 'heic',
    ];

    public static function dir(): string
    {
        $d = Config::get('upload_dir') ?: dirname(__DIR__, 2) . '/storage/uploads';
        if (!is_dir($d)) @mkdir($d, 0775, true);
        return $d;
    }

    /**
     * Save one $_FILES entry and register it in `attachments`. Returns attachment row.
     */
    public static function save(array $file, int $companyId, int $userId, string $entityType, int $entityId, ?string $kind = null, ?int $durationSec = null): array
    {
        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) throw HttpError::badRequest('Upload failed (code ' . ($file['error'] ?? '?') . ')');
        $max = (int) Config::get('upload_max_mb', 15) * 1024 * 1024;
        if ($file['size'] > $max) throw HttpError::badRequest('File too large');

        $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']) ?: 'application/octet-stream';
        if (!isset(self::ALLOWED[$mime])) throw HttpError::badRequest("File type not allowed: $mime");
        $ext = self::ALLOWED[$mime];

        $sub = $companyId . '/' . date('Y/m');
        $abs = self::dir() . '/' . $sub;
        if (!is_dir($abs)) @mkdir($abs, 0775, true);
        $name = bin2hex(random_bytes(16)) . '.' . $ext;
        if (!move_uploaded_file($file['tmp_name'], "$abs/$name") && !rename($file['tmp_name'], "$abs/$name")) {
            throw new \RuntimeException('Could not store upload');
        }

        $kind = $kind ?? (str_starts_with($mime, 'image/') ? 'image' : (str_starts_with($mime, 'audio/') ? 'voice' : 'file'));
        $id = Db::insert('attachments', [
            'company_id' => $companyId, 'entity_type' => $entityType, 'entity_id' => $entityId, 'kind' => $kind,
            'file_name' => mb_substr(basename($file['name'] ?? $name), 0, 200), 'path' => "$sub/$name",
            'mime' => $mime, 'size_bytes' => (int) $file['size'], 'duration_sec' => $durationSec, 'uploaded_by' => $userId,
        ]);
        return Db::one('SELECT * FROM attachments WHERE id = ?', [$id]);
    }

    /** Normalise $_FILES['x'] (single or multiple) to a list. */
    public static function list(array $files, string $key): array
    {
        if (empty($files[$key])) return [];
        $f = $files[$key];
        if (!is_array($f['name'])) return [$f];
        $out = [];
        foreach ($f['name'] as $i => $n) {
            $out[] = ['name' => $n, 'type' => $f['type'][$i], 'tmp_name' => $f['tmp_name'][$i], 'error' => $f['error'][$i], 'size' => $f['size'][$i]];
        }
        return $out;
    }
}
