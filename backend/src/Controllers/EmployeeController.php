<?php
namespace App\Controllers;

use App\Core\{Auth, Controller, Db, HttpError};

final class EmployeeController extends Controller
{
    private const FIELDS = ['name', 'mobile', 'email', 'designation', 'role', 'department_id', 'manager_id', 'language', 'joined_on', 'is_active', 'erp_role_id', 'deputy_id'];

    /** GET /employees?q=&department_id=&include_inactive= — everyone can list (needed for "Assign to" pickers) */
    public function index(): array
    {
        $where = 'u.company_id = ?'; $p = [$this->cid];
        if (empty($this->req->query['include_inactive'])) $where .= ' AND u.is_active = 1';
        if (!empty($this->req->query['q'])) { $where .= ' AND (u.name LIKE ? OR u.mobile LIKE ?)'; $p[] = '%' . $this->req->query['q'] . '%'; $p[] = '%' . $this->req->query['q'] . '%'; }
        if (!empty($this->req->query['department_id'])) { $where .= ' AND u.department_id = ?'; $p[] = (int) $this->req->query['department_id']; }
        $mgr = $this->isManager();
        $rows = Db::all("SELECT u.id, u.name, u.designation, u.role, u.department_id, d.name AS department_name, u.manager_id, m.name AS manager_name,
                                u.is_active, u.joined_on, u.language, u.erp_role_id, u.deputy_id, er.name AS erp_role_name" . ($mgr ? ', u.mobile, u.email, u.location_consent, (u.pin_hash IS NOT NULL) AS has_pin' : '') . "
                           FROM users u LEFT JOIN departments d ON d.id = u.department_id LEFT JOIN users m ON m.id = u.manager_id
                      LEFT JOIN erp_roles er ON er.id = u.erp_role_id
                          WHERE $where ORDER BY u.name", $p);
        foreach ($rows as &$r) $r['initials'] = MeController::initials($r['name']);
        return $rows;
    }

    public function store(): array
    {
        $in = $this->req->require(['name', 'mobile']);
        $data = $this->clean($this->req->only(self::FIELDS));
        if (Db::value('SELECT 1 FROM users WHERE company_id = ? AND mobile = ?', [$this->cid, $data['mobile']])) throw HttpError::conflict('Mobile already registered');
        if (($data['role'] ?? 'employee') === 'owner' && $this->user['role'] !== 'owner') throw HttpError::forbidden('Only owner can add owners');
        if ($pw = $this->req->input('password')) $data['password_hash'] = password_hash($pw, PASSWORD_DEFAULT);
        if (($pin = $this->req->input('pin')) !== null && $pin !== '') {
            if (!preg_match('/^\d{4}$/', (string) $pin)) throw HttpError::badRequest('App PIN must be 4 digits');
            $data['pin_hash'] = password_hash((string) $pin, PASSWORD_DEFAULT); $data['pin_fails'] = 0; $data['pin_locked_until'] = null;
        }
        $id = Db::insert('users', $data + ['company_id' => $this->cid]);
        return $this->one($id);
    }

    public function update(): array
    {
        $id = $this->param('id');
        $target = Db::one('SELECT * FROM users WHERE id = ? AND company_id = ?', [$id, $this->cid]);
        if (!$target) throw HttpError::notFound();
        if ($this->user['role'] !== 'owner' && ($target['role'] === 'owner' || ($this->req->input('role') === 'owner'))) throw HttpError::forbidden();
        if ($this->user['role'] !== 'owner' && !in_array($id, Auth::teamIds($this->user), true)) throw HttpError::forbidden();
        $data = $this->clean($this->req->only(self::FIELDS));
        if (isset($data['manager_id']) && (int) $data['manager_id'] === $id) throw HttpError::badRequest('Cannot be own manager');
        if ($pw = $this->req->input('password')) $data['password_hash'] = password_hash($pw, PASSWORD_DEFAULT);
        if (($pin = $this->req->input('pin')) !== null && $pin !== '') {
            if (!preg_match('/^\d{4}$/', (string) $pin)) throw HttpError::badRequest('App PIN must be 4 digits');
            $data['pin_hash'] = password_hash((string) $pin, PASSWORD_DEFAULT); $data['pin_fails'] = 0; $data['pin_locked_until'] = null;
        }
        Db::update('users', $id, $data, $this->cid);
        return $this->one($id);
    }

    /**
     * POST /employees/pins {only_missing?: bool} — owner/manager: give app-login PINs.
     * Returns the plain PINs once (name, mobile, pin) so they can be shared with each person.
     */
    public function generatePins(): array
    {
        $onlyMissing = (bool) $this->req->input('only_missing', true);
        $where = 'company_id = ? AND is_active = 1' . ($onlyMissing ? ' AND pin_hash IS NULL' : '');
        if ($this->user['role'] !== 'owner') $where .= " AND role <> 'owner'";
        $out = [];
        foreach (Db::all("SELECT id, name, mobile FROM users WHERE $where ORDER BY name", [$this->cid]) as $u) {
            if ($this->user['role'] !== 'owner' && !in_array((int) $u['id'], Auth::teamIds($this->user), true)) continue;
            do { $pin = str_pad((string) random_int(0, 9999), 4, '0', STR_PAD_LEFT); } while (preg_match('/^(\d)\1{3}$|^(0123|1234|2345|3456|4567|5678|6789)$/', $pin));
            Db::exec('UPDATE users SET pin_hash = ?, pin_fails = 0, pin_locked_until = NULL WHERE id = ?', [password_hash($pin, PASSWORD_DEFAULT), $u['id']]);
            $out[] = ['id' => (int) $u['id'], 'name' => trim($u['name']), 'mobile' => $u['mobile'], 'pin' => $pin];
        }
        return $out;
    }

    private function clean(array $d): array
    {
        if (isset($d['mobile'])) {
            $d['mobile'] = AuthController::normaliseMobile($d['mobile']);
            if (!preg_match('/^\d{10}$/', $d['mobile'])) throw HttpError::badRequest('Mobile must be 10 digits');
        }
        if (isset($d['role']) && !in_array($d['role'], ['owner', 'manager', 'employee'], true)) throw HttpError::badRequest('Bad role');
        foreach (['department_id', 'manager_id', 'erp_role_id', 'deputy_id'] as $k) if (array_key_exists($k, $d)) $d[$k] = $d[$k] ? (int) $d[$k] : null;
        if (isset($d['is_active'])) $d['is_active'] = $d['is_active'] ? 1 : 0;
        if (array_key_exists('joined_on', $d) && !$d['joined_on']) $d['joined_on'] = null;
        return $d;
    }

    private function one(int $id): array
    {
        foreach ($this->index() as $r) if ((int) $r['id'] === $id) return $r;
        return Db::one('SELECT id, name, role, is_active FROM users WHERE id = ?', [$id]);
    }

    /* ── departments ── */
    public function departments(): array
    {
        return Db::all('SELECT d.*, h.name AS head_name, (SELECT COUNT(*) FROM users u WHERE u.department_id = d.id AND u.is_active = 1) AS members
                          FROM departments d LEFT JOIN users h ON h.id = d.head_user_id WHERE d.company_id = ? ORDER BY d.name', [$this->cid]);
    }

    public function saveDepartment(): array
    {
        $name = trim((string) $this->req->require(['name'])['name']);
        $row = ['name' => $name, 'head_user_id' => $this->req->int('head_user_id')];
        if ($id = $this->param('id')) Db::update('departments', $id, $row, $this->cid);
        else Db::insert('departments', $row + ['company_id' => $this->cid]);
        return $this->departments();
    }

    public function deleteDepartment(): array
    {
        Db::exec('DELETE FROM departments WHERE id = ? AND company_id = ?', [$this->param('id'), $this->cid]);
        return $this->departments();
    }
}
