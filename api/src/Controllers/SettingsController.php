<?php
namespace App\Controllers;

use App\Core\{Config, Controller, Db, HttpError};
use App\Services\Upload;

final class SettingsController extends Controller
{
    /** GET /settings */
    public function show(): array
    {
        $c = Db::one('SELECT * FROM companies WHERE id = ?', [$this->cid]);
        $c['score_weights'] = json_decode($c['score_weights'], true);
        $c['languages'] = explode(',', $c['languages']);
        $c['geofence_count'] = (int) Db::value('SELECT COUNT(*) FROM geofences WHERE company_id = ?', [$this->cid]);
        $c['whatsapp_provider'] = Config::get('whatsapp.provider', 'log');
        $c['sms_provider'] = Config::get('sms.provider', 'log');
        $c['roles'] = Db::all('SELECT role, COUNT(*) AS n FROM users WHERE company_id = ? AND is_active = 1 GROUP BY role', [$this->cid]);
        return $c;
    }

    /** PATCH /settings — owner only */
    public function update(): array
    {
        $d = $this->req->only(['name', 'shift_start', 'shift_end', 'late_grace_min', 'languages', 'score_weights', 'whatsapp_enabled', 'whatsapp_number', 'gcal_enabled', 'timezone']);
        if (isset($d['languages']) && is_array($d['languages'])) $d['languages'] = implode(',', $d['languages']);
        if (isset($d['score_weights'])) {
            $w = (array) $d['score_weights'];
            if (array_sum($w) !== 100) throw HttpError::badRequest('Score weights must add up to 100');
            $d['score_weights'] = json_encode(array_map('intval', $w));
        }
        foreach (['whatsapp_enabled', 'gcal_enabled'] as $b) if (isset($d[$b])) $d[$b] = $d[$b] ? 1 : 0;
        Db::update('companies', $this->cid, $d);
        return $this->show();
    }

    /** GET /files/{id}?token= — authenticated file download (attachments, selfies are not public) */
    public function file(): void
    {
        $a = Db::one('SELECT * FROM attachments WHERE id = ? AND company_id = ?', [$this->param('id'), $this->cid]);
        if (!$a) throw HttpError::notFound();
        if ($a['kind'] === 'link') { header('Location: ' . $a['path']); return; }
        self::stream(Upload::dir() . '/' . $a['path'], $a['mime'], $a['file_name']);
    }

    /** GET /attendance/{id}/selfie?token= — managers only */
    public function selfie(): void
    {
        $a = Db::one('SELECT user_id, punch_in_selfie FROM attendance WHERE id = ? AND company_id = ?', [$this->param('id'), $this->cid]);
        if (!$a || !$a['punch_in_selfie']) throw HttpError::notFound();
        if ((int) $a['user_id'] !== $this->uid() && !$this->isManager()) throw HttpError::forbidden();
        self::stream(Upload::dir() . '/' . $a['punch_in_selfie'], 'image/jpeg', 'selfie.jpg');
    }

    private static function stream(string $path, ?string $mime, string $name): void
    {
        $real = realpath($path);
        if (!$real || !str_starts_with($real, realpath(Upload::dir())) || !is_file($real)) throw HttpError::notFound('File missing');
        header('Content-Type: ' . ($mime ?: 'application/octet-stream'));
        header('Content-Length: ' . filesize($real));
        header('Content-Disposition: inline; filename="' . str_replace('"', '', $name) . '"');
        header('Cache-Control: private, max-age=86400');
        readfile($real);
    }
}
