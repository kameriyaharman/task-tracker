<?php
namespace App\Controllers\Erp;

use App\Core\{Db, HttpError};
use App\Services\Erp\{Audit, Perm};

/** ERP roles (Purchase Executive, Store Incharge, …) with configurable module permissions. */
final class RoleController extends Base
{
    public function index(): array
    {
        $rows = Db::all('SELECT r.*, (SELECT COUNT(*) FROM users u WHERE u.erp_role_id = r.id AND u.is_active = 1) AS members FROM erp_roles r WHERE r.company_id = ? ORDER BY r.name', [$this->cid]);
        foreach ($rows as &$r) $r['perms'] = json_decode($r['perms'], true) ?: [];
        return ['modules' => Perm::MODULES, 'roles' => $rows];
    }

    public function store(): array { return $this->save(null); }
    public function update(): array { return $this->save($this->param('id')); }

    private function save(?int $id): array
    {
        $this->need('roles', true);
        $name = trim((string) $this->req->input('name'));
        if ($name === '') throw HttpError::badRequest('Role name is required');
        $perms = [];
        foreach ((array) $this->req->input('perms', []) as $m => $lvl) if (isset(Perm::MODULES[$m]) && in_array($lvl, ['view', 'edit'], true)) $perms[$m] = $lvl;
        if ($id) {
            if (!Db::value('SELECT 1 FROM erp_roles WHERE id = ? AND company_id = ?', [$id, $this->cid])) throw HttpError::notFound();
            Db::update('erp_roles', $id, ['name' => mb_substr($name, 0, 80), 'perms' => json_encode($perms)], $this->cid);
        } else {
            $id = Db::insert('erp_roles', ['company_id' => $this->cid, 'name' => mb_substr($name, 0, 80), 'perms' => json_encode($perms)]);
        }
        Audit::log($this->cid, $this->uid(), 'erp_role', $id, 'saved', $perms);
        return $this->index();
    }

    public function destroy(): array
    {
        $this->need('roles', true);
        Db::exec('UPDATE users SET erp_role_id = NULL WHERE erp_role_id = ? AND company_id = ?', [$this->param('id'), $this->cid]);
        Db::exec('DELETE FROM erp_roles WHERE id = ? AND company_id = ?', [$this->param('id'), $this->cid]);
        return $this->index();
    }

    /** POST /erp/roles/assign {user_id, erp_role_id|null} */
    public function assign(): array
    {
        if (!in_array($this->user['role'], ['owner', 'manager'], true)) throw HttpError::forbidden();
        $uid = (int) $this->req->require(['user_id'])['user_id'];
        $this->assertSameCompanyUser($uid);
        $rid = $this->req->int('erp_role_id');
        if ($rid && !Db::value('SELECT 1 FROM erp_roles WHERE id = ? AND company_id = ?', [$rid, $this->cid])) throw HttpError::badRequest('Unknown role');
        Db::exec('UPDATE users SET erp_role_id = ? WHERE id = ?', [$rid, $uid]);
        Audit::log($this->cid, $this->uid(), 'user', $uid, 'erp_role', ['erp_role_id' => $rid]);
        return ['ok' => true];
    }
}
