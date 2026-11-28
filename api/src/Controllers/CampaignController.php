<?php
namespace App\Controllers;

use App\Core\{Controller, Db, HttpError};

final class CampaignController extends Controller
{
    private const FIELDS = ['title', 'channel', 'owner_id', 'stage', 'sub_status', 'go_live_on', 'reach', 'leads', 'notes'];

    /** GET /campaigns — grouped by stage for the board */
    public function index(): array
    {
        $rows = Db::all('SELECT c.*, u.name AS owner_name,
                    (SELECT COUNT(*) FROM tasks t WHERE t.campaign_id = c.id) AS tasks_total,
                    (SELECT COUNT(*) FROM tasks t WHERE t.campaign_id = c.id AND t.status = \'done\') AS tasks_done
                   FROM campaigns c LEFT JOIN users u ON u.id = c.owner_id WHERE c.company_id = ? ORDER BY c.go_live_on IS NULL, c.go_live_on, c.id DESC', [$this->cid]);
        $board = ['idea' => [], 'production' => [], 'scheduled' => [], 'live' => []];
        foreach ($rows as $r) {
            $r['owner_initials'] = $r['owner_name'] ? MeController::initials($r['owner_name']) : null;
            $board[$r['stage']][] = $r;
        }
        return $board;
    }

    public function store(): array
    {
        $this->req->require(['title']);
        $id = Db::insert('campaigns', $this->req->only(self::FIELDS) + ['company_id' => $this->cid]);
        return Db::one('SELECT * FROM campaigns WHERE id = ?', [$id]);
    }

    public function update(): array
    {
        $id = $this->param('id');
        if (!Db::value('SELECT 1 FROM campaigns WHERE id = ? AND company_id = ?', [$id, $this->cid])) throw HttpError::notFound();
        $data = $this->req->only(self::FIELDS);
        if (isset($data['stage']) && !in_array($data['stage'], ['idea', 'production', 'scheduled', 'live'], true)) throw HttpError::badRequest('Bad stage');
        Db::update('campaigns', $id, $data, $this->cid);
        return Db::one('SELECT * FROM campaigns WHERE id = ?', [$id]);
    }

    public function destroy(): array
    {
        Db::exec('DELETE FROM campaigns WHERE id = ? AND company_id = ?', [$this->param('id'), $this->cid]);
        return ['deleted' => true];
    }
}
