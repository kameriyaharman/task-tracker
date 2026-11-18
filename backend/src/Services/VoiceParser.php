<?php
namespace App\Services;

use App\Core\Config;

/**
 * Turns a spoken sentence (English / Hindi / Hinglish) into a task draft.
 * "Imran, kal 11 baje tak Sharma Traders se payment collect karna"
 *   → {title: "Collect payment — Sharma Traders", assigned_to: Imran, due_at: tomorrow 11:00}
 *
 * If config ai.anthropic_api_key is set, Claude does the parsing; otherwise a rule-based parser is used.
 */
final class VoiceParser
{
    public static function parse(string $text, array $people): array
    {
        if (Config::get('ai.anthropic_api_key')) {
            $r = self::parseWithClaude($text, $people);
            if ($r) return $r;
        }
        return self::parseRules($text, $people);
    }

    public static function parseRules(string $text, array $people): array
    {
        $rest = ' ' . $text . ' ';
        $assignee = null;

        // 1. assignee — match first names (or full names) anywhere in the sentence
        foreach ($people as $p) {
            $first = preg_split('/\s+/', trim($p['name']))[0];
            foreach ([$p['name'], $first] as $needle) {
                if ($needle && preg_match('/(?<![\p{L}])' . preg_quote($needle, '/') . '(?![\p{L}])\s*(ko|ji)?[,:]?/iu', $rest, $m)) {
                    $assignee = ['id' => (int) $p['id'], 'name' => $p['name']];
                    $rest = str_replace($m[0], ' ', $rest);
                    break 2;
                }
            }
        }

        // 2. day
        $day = null;
        $dayWords = [
            '/\b(aaj|today|आज)\b/iu' => 0,
            '/\b(parso|parson|day after tomorrow|परसों)\b/iu' => 2,
            '/\b(kal|tomorrow|कल)\b/iu' => 1,
        ];
        foreach ($dayWords as $re => $add) {
            if (preg_match($re, $rest)) { $day = strtotime("today +$add day"); $rest = preg_replace($re, ' ', $rest, 1); break; }
        }
        $weekdays = ['monday' => 'somvar|somwar', 'tuesday' => 'mangalvar|mangalwar', 'wednesday' => 'budhvar|budhwar',
                     'thursday' => 'guruvar|guruwar|brihaspativar', 'friday' => 'shukravar|shukrawar', 'saturday' => 'shanivar|shaniwar', 'sunday' => 'ravivar|raviwar|itvaar'];
        if ($day === null) {
            foreach ($weekdays as $en => $hi) {
                $re = '/\b(' . $en . '|' . substr($en, 0, 3) . '|' . $hi . ')\b/iu';
                if (preg_match($re, $rest)) { $day = strtotime("next $en"); $rest = preg_replace($re, ' ', $rest, 1); break; }
            }
        }

        // 3. time — "11 baje", "5 pm", "shaam 6", "10:30"
        $hour = null; $min = 0;
        if (preg_match('/\b(subah|morning|dopahar|afternoon|shaam|sham|evening|raat|night)?\s*(\d{1,2})(?:[:.](\d{2}))?\s*(baje|bje|am|pm|o\'?clock)?\b/iu', $rest, $m)
            && ($m[4] !== '' || $m[1] !== '' || ($m[3] ?? '') !== '')) {
            $hour = (int) $m[2]; $min = (int) ($m[3] ?? 0);
            $part = strtolower($m[1] . ' ' . $m[4]);
            if (preg_match('/pm|shaam|sham|evening|raat|night|dopahar|afternoon/', $part) && $hour < 12) $hour += 12;
            elseif (!preg_match('/am|subah|morning/', $part) && $hour >= 1 && $hour <= 7) $hour += 12; // "5 baje" → 5 PM in office context
            $rest = str_replace($m[0], ' ', $rest);
        }
        $rest = preg_replace('/\b(tak|by|till|until|se pehle|before)\b/iu', ' ', $rest);

        $due = null;
        if ($day !== null || $hour !== null) {
            $base = $day ?? strtotime('today');
            $due = date('Y-m-d H:i:s', $base + (($hour ?? 18) * 3600) + $min * 60);
        }

        // 4. priority
        $priority = preg_match('/\b(urgent|jaldi|zaroori|jaruri|asap|important|high)\b/iu', $rest) ? 'high' : 'medium';
        $rest = preg_replace('/\b(urgent|jaldi|zaroori|jaruri|asap|important|please|plz)\b/iu', ' ', $rest);

        // 5. title — "<party> se payment collect karna" → "Collect payment — <party>"
        $rest = trim(preg_replace('/\s+/', ' ', preg_replace('/[,.!]+/', ' ', $rest)));
        $rest = preg_replace('/\s+(karna|karni|karo|kar dena|kar do|krna|hai|he|h)$/iu', '', $rest);
        $title = $rest;
        if (preg_match('/^(.+?)\s+(se|ko|ke liye|ka|ki|for|from|to)\s+(.+?)\s+(\w+)$/iu', $rest, $m)) {
            // "Sharma Traders se payment collect" → verb=collect, object=payment, party=Sharma Traders
            $party = trim($m[1]); $obj = trim($m[3]); $verb = trim($m[4]);
            $title = ucfirst($verb) . ' ' . $obj . ' — ' . $party;
        }
        // Hinglish verb at the end → English imperative at the front ("GST file bhejna" → "Send GST file")
        $verbs = ['bhejna|bhejni|bhej do|bhejo' => 'Send', 'banana|banani|bana do|banao' => 'Prepare', 'call karna|call karo|phone karna|call' => 'Call',
                  'check karna|check karo|dekhna|dekh lena|check' => 'Check', 'lena|le lo|le aana' => 'Get', 'dena|de do' => 'Give',
                  'milna|meet karna' => 'Meet', 'update karna|update' => 'Update', 'post karna|post karo|post' => 'Post', 'pay karna|payment karna' => 'Pay'];
        foreach ($verbs as $re => $en) {
            if (preg_match('/^(.+?)\s+(' . $re . ')$/iu', $title, $m)) { $title = $en . ' ' . $m[1]; break; }
        }
        $title = mb_strtoupper(mb_substr($title, 0, 1)) . mb_substr($title, 1);

        return [
            'title' => $title ?: $text,
            'assigned_to' => $assignee['id'] ?? null,
            'assignee_name' => $assignee['name'] ?? null,
            'due_at' => $due,
            'priority' => $priority,
            'transcript' => $text,
            'engine' => 'rules',
        ];
    }

    private static function parseWithClaude(string $text, array $people): ?array
    {
        $names = implode(', ', array_map(fn($p) => "{$p['id']}:{$p['name']}", $people));
        $prompt = "Today is " . date('l, Y-m-d H:i') . ". Team members (id:name): $names.\n"
            . "Convert this spoken instruction (may be Hindi/Hinglish) into a task. Reply with JSON only: "
            . "{\"title\": short English imperative title, \"assigned_to\": id or null, \"due_at\": \"YYYY-MM-DD HH:MM:SS\" or null, \"priority\": \"low|medium|high\"}.\n"
            . "Instruction: \"$text\"";
        $res = Http::postJson('https://api.anthropic.com/v1/messages', [
            'model' => Config::get('ai.model', 'claude-haiku-5-5'),
            'max_tokens' => 300,
            'messages' => [['role' => 'user', 'content' => $prompt]],
        ], ['x-api-key: ' . Config::get('ai.anthropic_api_key'), 'anthropic-version: 2023-06-01']);
        $out = $res['content'][0]['text'] ?? null;
        if (!$out || !preg_match('/\{.*\}/s', $out, $m)) return null;
        $j = json_decode($m[0], true);
        if (!is_array($j) || empty($j['title'])) return null;
        $name = null;
        foreach ($people as $p) if ((int) $p['id'] === (int) ($j['assigned_to'] ?? 0)) $name = $p['name'];
        return [
            'title' => $j['title'], 'assigned_to' => $name ? (int) $j['assigned_to'] : null, 'assignee_name' => $name,
            'due_at' => $j['due_at'] ?? null, 'priority' => in_array($j['priority'] ?? '', ['low', 'medium', 'high'], true) ? $j['priority'] : 'medium',
            'transcript' => $text, 'engine' => 'claude',
        ];
    }
}
