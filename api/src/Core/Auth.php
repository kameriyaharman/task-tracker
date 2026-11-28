<?php
namespace App\Core;

final class Auth
{
    private const RANK = ['employee' => 1, 'manager' => 2, 'owner' => 3];

    public static function authenticate(Request $req): array
    {
        $token = $req->bearer();
        if (!$token) throw HttpError::unauthorized('Login required');
        $payload = Jwt::decode($token);
        if (!$payload) throw HttpError::unauthorized('Session expired, please login again');

        $user = Db::one(
            'SELECT u.*, c.name AS company_name, c.code AS company_code, d.name AS department_name
               FROM users u
               JOIN companies c ON c.id = u.company_id
          LEFT JOIN departments d ON d.id = u.department_id
              WHERE u.id = ? AND u.is_active = 1',
            [(int) $payload['sub']]
        );
        if (!$user) throw HttpError::unauthorized('Account disabled');
        return $user;
    }

    public static function requireRole(array $user, string $min): void
    {
        if ($min === 'user') return;
        if ((self::RANK[$user['role']] ?? 0) < (self::RANK[$min] ?? 99)) throw HttpError::forbidden();
    }

    public static function isManager(array $user): bool
    {
        return in_array($user['role'], ['manager', 'owner'], true);
    }

    public static function issue(array $user): string
    {
        return Jwt::encode(
            ['sub' => (int) $user['id'], 'cid' => (int) $user['company_id'], 'role' => $user['role']],
            (int) Config::get('jwt_ttl', 60 * 60 * 24 * 30)
        );
    }

    /** Ids of people this user can manage: owner = everyone; manager = direct + indirect reports + own dept. */
    public static function teamIds(array $user): array
    {
        if ($user['role'] === 'owner') {
            return array_map('intval', array_column(
                Db::all('SELECT id FROM users WHERE company_id = ? AND is_active = 1', [$user['company_id']]), 'id'));
        }
        if ($user['role'] !== 'manager') return [(int) $user['id']];

        $ids = [(int) $user['id']];
        $frontier = [(int) $user['id']];
        for ($depth = 0; $depth < 6 && $frontier; $depth++) {
            $rows = Db::all('SELECT id FROM users WHERE company_id = ? AND manager_id IN ' . Db::in($frontier),
                array_merge([$user['company_id']], $frontier));
            $frontier = array_diff(array_map('intval', array_column($rows, 'id')), $ids);
            $ids = array_merge($ids, $frontier);
        }
        if ($user['department_id']) {
            $dept = Db::all('SELECT id FROM users WHERE company_id = ? AND department_id = ?', [$user['company_id'], $user['department_id']]);
            $ids = array_merge($ids, array_map('intval', array_column($dept, 'id')));
        }
        return array_values(array_unique($ids));
    }
}
