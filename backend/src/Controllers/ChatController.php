<?php
namespace App\Controllers;

use App\Core\{Controller, Db, HttpError};
use App\Services\{Notifier, Upload};

/** Team & 1:1 chat with text, voice notes, files and shared tasks. Clients poll /messages?after=<id>. */
final class ChatController extends Controller
{
    private function member(int $roomId): array
    {
        $room = Db::one('SELECT r.* FROM chat_rooms r JOIN chat_members m ON m.room_id = r.id AND m.user_id = ?
                          WHERE r.id = ? AND r.company_id = ?', [$this->uid(), $roomId, $this->cid]);
        if (!$room) throw HttpError::notFound('Chat not found');
        return $room;
    }

    /** GET /chat/rooms */
    public function rooms(): array
    {
        $rows = Db::all(
            'SELECT r.*, m.last_read_message_id,
                    (SELECT COUNT(*) FROM chat_messages x WHERE x.room_id = r.id AND x.id > m.last_read_message_id AND x.user_id <> ?) AS unread,
                    (SELECT x.body FROM chat_messages x WHERE x.room_id = r.id ORDER BY x.id DESC LIMIT 1) AS last_body,
                    (SELECT x.kind FROM chat_messages x WHERE x.room_id = r.id ORDER BY x.id DESC LIMIT 1) AS last_kind,
                    (SELECT u.name FROM chat_members cm JOIN users u ON u.id = cm.user_id WHERE cm.room_id = r.id AND cm.user_id <> ? LIMIT 1) AS other_name
               FROM chat_rooms r JOIN chat_members m ON m.room_id = r.id AND m.user_id = ?
              WHERE r.company_id = ? ORDER BY COALESCE(r.last_message_at, \'1970-01-01\') DESC',
            [$this->uid(), $this->uid(), $this->uid(), $this->cid]);
        foreach ($rows as &$r) {
            $r['title'] = $r['is_group'] ? $r['name'] : $r['other_name'];
            $r['unread'] = (int) $r['unread'];
        }
        return $rows;
    }

    /** POST /chat/rooms {name, member_ids[]} (group) or {user_id} (1:1, returns existing if any) */
    public function createRoom(): array
    {
        if ($other = $this->req->int('user_id')) {
            $this->assertSameCompanyUser($other);
            $existing = Db::value('SELECT r.id FROM chat_rooms r
                JOIN chat_members a ON a.room_id = r.id AND a.user_id = ? JOIN chat_members b ON b.room_id = r.id AND b.user_id = ?
                WHERE r.is_group = 0 AND r.company_id = ? LIMIT 1', [$this->uid(), $other, $this->cid]);
            if ($existing) return ['id' => (int) $existing];
            $id = Db::insert('chat_rooms', ['company_id' => $this->cid, 'is_group' => 0, 'created_by' => $this->uid()]);
            $members = [$this->uid(), $other];
        } else {
            $in = $this->req->require(['name']);
            $members = array_unique(array_merge([$this->uid()], array_map('intval', (array) $this->req->input('member_ids', []))));
            foreach ($members as $m) $this->assertSameCompanyUser($m);
            $id = Db::insert('chat_rooms', ['company_id' => $this->cid, 'name' => mb_substr($in['name'], 0, 100), 'is_group' => 1,
                'department_id' => $this->req->int('department_id'), 'created_by' => $this->uid()]);
        }
        foreach ($members as $m) Db::insert('chat_members', ['room_id' => $id, 'user_id' => $m]);
        return ['id' => $id];
    }

    /** GET /chat/rooms/{id}/messages?after=<id>&before=<id> */
    public function messages(): array
    {
        $room = $this->member($this->param('id'));
        $after = (int) ($this->req->query['after'] ?? 0);
        $before = (int) ($this->req->query['before'] ?? 0);
        $where = 'm.room_id = ?'; $p = [$room['id']];
        if ($after) { $where .= ' AND m.id > ?'; $p[] = $after; }
        if ($before) { $where .= ' AND m.id < ?'; $p[] = $before; }
        $rows = Db::all("SELECT m.*, u.name AS user_name, t.title AS task_title, t.due_at AS task_due, ua.name AS task_assignee,
                                a.file_name, a.mime, a.duration_sec
                           FROM chat_messages m JOIN users u ON u.id = m.user_id
                      LEFT JOIN tasks t ON t.id = m.task_id LEFT JOIN users ua ON ua.id = t.assigned_to
                      LEFT JOIN attachments a ON a.id = m.attachment_id
                          WHERE $where ORDER BY m.id DESC LIMIT 50", $p);
        $rows = array_reverse($rows);
        if ($rows) Db::exec('UPDATE chat_members SET last_read_message_id = GREATEST(last_read_message_id, ?) WHERE room_id = ? AND user_id = ?',
            [(int) end($rows)['id'], $room['id'], $this->uid()]);
        foreach ($rows as &$r) $r['mine'] = (int) $r['user_id'] === $this->uid();
        return ['room' => $room, 'messages' => $rows];
    }

    /** POST /chat/rooms/{id}/messages {body} | multipart voice/file | {task_id} */
    public function send(): array
    {
        $room = $this->member($this->param('id'));
        $data = ['room_id' => $room['id'], 'user_id' => $this->uid(), 'kind' => 'text', 'body' => $this->req->input('body')];
        if (!empty($this->req->files['voice'])) {
            $msgId = Db::insert('chat_messages', $data + ['kind' => 'voice']);
            $att = Upload::save($this->req->files['voice'], $this->cid, $this->uid(), 'chat', $msgId, 'voice', $this->req->int('duration'));
            Db::exec('UPDATE chat_messages SET kind = \'voice\', attachment_id = ? WHERE id = ?', [$att['id'], $msgId]);
        } elseif (!empty($this->req->files['file'])) {
            $msgId = Db::insert('chat_messages', ['kind' => 'file'] + $data);
            $att = Upload::save($this->req->files['file'], $this->cid, $this->uid(), 'chat', $msgId);
            Db::exec('UPDATE chat_messages SET attachment_id = ? WHERE id = ?', [$att['id'], $msgId]);
        } elseif ($taskId = $this->req->int('task_id')) {
            if (!Db::value('SELECT 1 FROM tasks WHERE id = ? AND company_id = ?', [$taskId, $this->cid])) throw HttpError::badRequest('Unknown task');
            $data['kind'] = 'task'; $data['task_id'] = $taskId;
            $msgId = Db::insert('chat_messages', $data);
        } else {
            if (trim((string) $data['body']) === '') throw HttpError::badRequest('Empty message');
            $msgId = Db::insert('chat_messages', $data);
        }
        Db::exec('UPDATE chat_rooms SET last_message_at = NOW() WHERE id = ?', [$room['id']]);
        Db::exec('UPDATE chat_members SET last_read_message_id = ? WHERE room_id = ? AND user_id = ?', [$msgId, $room['id'], $this->uid()]);

        $others = array_column(Db::all('SELECT user_id FROM chat_members WHERE room_id = ? AND user_id <> ?', [$room['id'], $this->uid()]), 'user_id');
        $preview = $data['kind'] === 'text' ? mb_substr((string) $data['body'], 0, 100) : ['voice' => '🎤 Voice message', 'file' => '📎 File', 'task' => '📌 Task shared'][$data['kind']] ?? '';
        foreach ($others as $o) {
            Notifier::notify($this->cid, (int) $o, 'chat', ($room['is_group'] ? $room['name'] . ' · ' : '') . $this->user['name'], $preview, 'chat', (int) $room['id']);
        }
        $this->req->query['after'] = $msgId - 1;
        return $this->messages();
    }
}
