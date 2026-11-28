<?php
namespace App\Services;

use App\Core\Config;

/** OTP delivery. Providers: 'log' (dev — writes to storage/logs/otp.log), 'msg91', '2factor'. */
final class Sms
{
    public static function sendOtp(string $mobile, string $otp): bool
    {
        $provider = Config::get('sms.provider', 'log');
        $mobile = preg_replace('/\D/', '', $mobile);
        if (strlen($mobile) === 10) $mobile = '91' . $mobile;

        switch ($provider) {
            case 'msg91':
                return Http::postJson('https://control.msg91.com/api/v5/otp?' . http_build_query([
                    'template_id' => Config::get('sms.msg91_template_id'),
                    'mobile' => $mobile,
                    'otp' => $otp,
                ]), [], ['authkey: ' . Config::get('sms.msg91_authkey')]) !== null;
            case '2factor':
                $key = Config::get('sms.twofactor_key');
                return Http::get("https://2factor.in/API/V1/$key/SMS/$mobile/$otp/OTP1") !== null;
            default:
                Log::write('otp', "$mobile => $otp");
                return true;
        }
    }
}
