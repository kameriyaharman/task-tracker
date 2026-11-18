<?php
namespace App\Controllers;

use App\Core\{Auth, Config, Controller, Db, HttpError};
use App\Services\Sms;

final class AuthController extends Controller
{
    /** Single-company install: the company is fixed by config (COMPANY_CODE), else the first company. */
    public static function companyId(): int
    {
        $code = Config::get('company_code');
        $id = $code ? Db::value('SELECT id FROM companies WHERE code = ?', [strtoupper($code)]) : null;
        $id = $id ?: Db::value('SELECT id FROM companies ORDER BY id LIMIT 1');
        if (!$id) throw new HttpError(503, 'App is not set up yet');
        return (int) $id;
    }

    private function findUser(string $mobile): array
    {
        $u = Db::one('SELECT * FROM users WHERE company_id = ? AND mobile = ? AND is_active = 1',
            [self::companyId(), self::normaliseMobile($mobile)]);
        if (!$u) throw HttpError::notFound('This mobile number is not registered. Ask your admin to add you.');
        return $u;
    }

    public static function normaliseMobile(string $m): string
    {
        $m = preg_replace('/\D/', '', $m);
        if (strlen($m) === 12 && str_starts_with($m, '91')) $m = substr($m, 2);
        return $m;
    }

    /** POST /auth/request-otp {mobile} */
    public function requestOtp(): array
    {
        $in = $this->req->require(['mobile']);
        $u = $this->findUser($in['mobile']);

        $recent = (int) Db::value('SELECT COUNT(*) FROM otp_codes WHERE user_id = ? AND created_at > NOW() - INTERVAL 15 MINUTE', [$u['id']]);
        if ($recent >= 5) throw HttpError::tooMany();

        $demo = Config::get('otp.demo_code'); // e.g. '5174' on staging — leave null in production
        $otp = $demo ?: str_pad((string) random_int(0, 9999), 4, '0', STR_PAD_LEFT);
        Db::insert('otp_codes', [
            'user_id' => $u['id'],
            'code_hash' => password_hash($otp, PASSWORD_DEFAULT),
            'expires_at' => date('Y-m-d H:i:s', time() + 300),
        ]);
        if (!$demo) Sms::sendOtp($u['mobile'], $otp);
        return ['sent' => true, 'expires_in' => 300, 'masked' => '+91 ' . substr($u['mobile'], 0, 2) . 'XXX X' . substr($u['mobile'], -4)];
    }

    /** POST /auth/verify-otp {mobile, otp} */
    public function verifyOtp(): array
    {
        $in = $this->req->require(['mobile', 'otp']);
        $u = $this->findUser($in['mobile']);
        $row = Db::one('SELECT * FROM otp_codes WHERE user_id = ? AND used_at IS NULL AND expires_at > NOW() ORDER BY id DESC LIMIT 1', [$u['id']]);
        if (!$row) throw HttpError::badRequest('OTP expired, request a new one');
        if ($row['attempts'] >= 5) throw HttpError::tooMany();
        if (!password_verify((string) $in['otp'], $row['code_hash'])) {
            Db::exec('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?', [$row['id']]);
            throw HttpError::badRequest('Wrong OTP');
        }
        Db::exec('UPDATE otp_codes SET used_at = NOW() WHERE id = ?', [$row['id']]);
        return $this->session($u);
    }

    /** POST /auth/admin-login {login (mobile/email), password} — web panel */
    public function adminLogin(): array
    {
        $in = $this->req->require(['login', 'password']);
        $login = trim($in['login']);
        $u = Db::one(
            'SELECT * FROM users WHERE company_id = ? AND (email = ? OR mobile = ?) AND is_active = 1',
            [self::companyId(), $login, self::normaliseMobile($login)]
        );
        if (!$u || !$u['password_hash'] || !password_verify($in['password'], $u['password_hash'])) {
            throw HttpError::unauthorized('Invalid login');
        }
        if (!Auth::isManager($u)) throw HttpError::forbidden('Admin panel is for owners and managers');
        return $this->session($u);
    }

    private function session(array $u): array
    {
        return ['token' => Auth::issue($u), 'user' => (new MeController($this->req))->profile((int) $u['id'])];
    }
}
