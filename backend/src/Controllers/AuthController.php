<?php
namespace App\Controllers;

use App\Core\{Auth, Config, Controller, Db, HttpError};
use App\Services\Sms;

final class AuthController extends Controller
{
    private function findUser(string $companyCode, string $mobile): array
    {
        $mobile = self::normaliseMobile($mobile);
        $u = Db::one(
            'SELECT u.* FROM users u JOIN companies c ON c.id = u.company_id
              WHERE c.code = ? AND u.mobile = ? AND u.is_active = 1',
            [strtoupper(trim($companyCode)), $mobile]
        );
        if (!$u) throw HttpError::notFound('No employee found with this company code and mobile');
        return $u;
    }

    public static function normaliseMobile(string $m): string
    {
        $m = preg_replace('/\D/', '', $m);
        if (strlen($m) === 12 && str_starts_with($m, '91')) $m = substr($m, 2);
        return $m;
    }

    /** POST /auth/request-otp {company_code, mobile} */
    public function requestOtp(): array
    {
        $in = $this->req->require(['company_code', 'mobile']);
        $u = $this->findUser($in['company_code'], $in['mobile']);

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

    /** POST /auth/verify-otp {company_code, mobile, otp} */
    public function verifyOtp(): array
    {
        $in = $this->req->require(['company_code', 'mobile', 'otp']);
        $u = $this->findUser($in['company_code'], $in['mobile']);
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

    /** POST /auth/admin-login {company_code, login (mobile/email), password} — web panel */
    public function adminLogin(): array
    {
        $in = $this->req->require(['company_code', 'login', 'password']);
        $login = trim($in['login']);
        $u = Db::one(
            'SELECT u.* FROM users u JOIN companies c ON c.id = u.company_id
              WHERE c.code = ? AND (u.email = ? OR u.mobile = ?) AND u.is_active = 1',
            [strtoupper(trim($in['company_code'])), $login, self::normaliseMobile($login)]
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
