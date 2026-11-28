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
        $masked = '+91 ' . substr($u['mobile'], 0, 2) . 'XXX X' . substr($u['mobile'], -4);
        if (!empty($u['pin_hash'])) return ['sent' => false, 'mode' => 'pin', 'masked' => $masked];

        $demo = Config::get('otp.demo_code');
        if (!$demo && Config::get('sms.provider', 'log') === 'log') {
            throw HttpError::badRequest('Your app PIN is not set yet. Ask the admin to set it (Admin panel → Employees → your name → App login PIN).');
        }
        $recent = (int) Db::value('SELECT COUNT(*) FROM otp_codes WHERE user_id = ? AND created_at > NOW() - INTERVAL 15 MINUTE', [$u['id']]);
        if ($recent >= 5) throw HttpError::tooMany();

        $otp = $demo ?: str_pad((string) random_int(0, 9999), 4, '0', STR_PAD_LEFT);
        Db::insert('otp_codes', [
            'user_id' => $u['id'],
            'code_hash' => password_hash($otp, PASSWORD_DEFAULT),
            'expires_at' => date('Y-m-d H:i:s', time() + 300),
        ]);
        if (!$demo) Sms::sendOtp($u['mobile'], $otp);
        return ['sent' => true, 'mode' => 'otp', 'expires_in' => 300, 'masked' => $masked];
    }

    /** POST /auth/verify-otp {mobile, otp} */
    public function verifyOtp(): array
    {
        $in = $this->req->require(['mobile', 'otp']);
        $u = $this->findUser($in['mobile']);
        if (!empty($u['pin_hash'])) {
            if ($u['pin_locked_until'] && strtotime($u['pin_locked_until']) > time()) {
                throw HttpError::tooMany('Too many wrong PINs. Try again after ' . date('g:i A', strtotime($u['pin_locked_until'])) . ' or ask the admin to reset your PIN.');
            }
            if (!password_verify((string) $in['otp'], $u['pin_hash'])) {
                $fails = (int) $u['pin_fails'] + 1;
                Db::exec('UPDATE users SET pin_fails = ?, pin_locked_until = ? WHERE id = ?', [$fails >= 5 ? 0 : $fails, $fails >= 5 ? date('Y-m-d H:i:s', time() + 900) : null, $u['id']]);
                throw HttpError::badRequest($fails >= 5 ? 'Wrong PIN 5 times — locked for 15 minutes.' : 'Wrong PIN (' . (5 - $fails) . ' tries left). Ask the admin if you forgot it.');
            }
            Db::exec('UPDATE users SET pin_fails = 0, pin_locked_until = NULL WHERE id = ?', [$u['id']]);
            return $this->session($u);
        }
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
        if (!$u) throw HttpError::unauthorized('This mobile number / email is not registered. Ask the admin to add you in Employees.');
        if (!$u['password_hash']) throw HttpError::unauthorized('No password is set for this user. Staff log in on the mobile app with OTP — or ask the admin to set a password.');
        if (!password_verify($in['password'], $u['password_hash'])) throw HttpError::unauthorized('Wrong password. Please try again.');
        if (!Auth::isManager($u) && empty($u['erp_role_id'])) throw HttpError::forbidden('Admin panel is for the boss, managers and office staff with a showroom role');
        return $this->session($u);
    }

    private function session(array $u): array
    {
        return ['token' => Auth::issue($u), 'user' => (new MeController($this->req))->profile((int) $u['id'])];
    }
}
