<?php
namespace App\Core;

abstract class Controller
{
    protected Request $req;
    protected array $user;
    protected int $cid;

    public function __construct(Request $req)
    {
        $this->req = $req;
        $this->user = $req->user ?? [];
        $this->cid = (int) ($this->user['company_id'] ?? 0);
    }

    protected function uid(): int { return (int) $this->user['id']; }
    protected function isManager(): bool { return Auth::isManager($this->user); }
    protected function param(string $k): int { return (int) ($this->req->params[$k] ?? 0); }

    protected function paginate(): array
    {
        $page = max(1, (int) ($this->req->query['page'] ?? 1));
        $per = min(200, max(1, (int) ($this->req->query['per_page'] ?? 50)));
        return [$per, ($page - 1) * $per, $page];
    }

    protected function assertSameCompanyUser(?int $userId): void
    {
        if ($userId === null) return;
        $ok = Db::value('SELECT 1 FROM users WHERE id = ? AND company_id = ?', [$userId, $this->cid]);
        if (!$ok) throw HttpError::badRequest('Unknown user');
    }

    protected function assertInTeam(int $userId): void
    {
        if ($userId === $this->uid()) return;
        if (!in_array($userId, Auth::teamIds($this->user), true)) throw HttpError::forbidden('Not in your team');
    }
}
