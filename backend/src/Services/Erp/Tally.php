<?php
namespace App\Services\Erp;

use App\Core\Db;

/**
 * TallyPrime sync. The app never talks to Tally directly (Tally runs on the shop PC).
 * Approved/final documents are queued in tally_queue; the Windows connector on the Tally PC
 * pulls pending items (GET /tally/pending), posts the XML to Tally on localhost:9000 and
 * reports the result back (POST /tally/result). Each voucher carries a fixed REMOTEID
 * (keshav-<type>-<id>) so a retry alters the same voucher instead of creating a duplicate.
 *
 * Ledger names come from company erp_settings.tally.ledgers (defaults below) and must match Tally.
 */
final class Tally
{
    public const DEFAULT_LEDGERS = [
        'sales' => 'Sales', 'purchase' => 'Purchase', 'cash' => 'Cash', 'bank' => 'Bank',
        'cgst_out' => 'Output CGST', 'sgst_out' => 'Output SGST', 'cgst_in' => 'Input CGST', 'sgst_in' => 'Input SGST',
        'discount' => 'Discount Allowed', 'expense' => 'Office Expenses', 'sales_return' => 'Sales Return', 'purchase_return' => 'Purchase Return',
        'walkin' => 'Cash Customer',
    ];

    public static function enqueue(int $cid, string $refType, int $refId, string $voucherType): void
    {
        if (!self::enabled($cid)) return;
        Db::exec("INSERT INTO tally_queue (company_id, ref_type, ref_id, voucher_type) VALUES (?, ?, ?, ?)
                  ON DUPLICATE KEY UPDATE status = 'pending', error = NULL", [$cid, $refType, $refId, $voucherType]);
    }

    public static function settings(int $cid): array
    {
        $s = json_decode((string) Db::value('SELECT erp_settings FROM companies WHERE id = ?', [$cid]), true) ?: [];
        $t = $s['tally'] ?? [];
        $t['ledgers'] = array_merge(self::DEFAULT_LEDGERS, array_filter((array) ($t['ledgers'] ?? [])));
        $t['enabled'] = !empty($t['enabled']);
        return $t;
    }

    public static function enabled(int $cid): bool { return self::settings($cid)['enabled']; }

    private static function x($s): string { return htmlspecialchars((string) $s, ENT_XML1 | ENT_QUOTES, 'UTF-8'); }
    private static function d(string $date): string { return date('Ymd', strtotime($date)); }
    private static function amt(float $a): string { return number_format($a, 2, '.', ''); }

    private static function envelope(string $company, string $body, string $report = 'Vouchers'): string
    {
        return '<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>' . $report
            . '</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>' . self::x($company) . '</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC><REQUESTDATA>'
            . $body . '</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>';
    }

    private static function ledgerMaster(string $name, string $parent, ?string $gstin = null): string
    {
        return '<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="' . self::x($name) . '" ACTION="Create"><NAME>' . self::x($name) . '</NAME><PARENT>'
            . self::x($parent) . '</PARENT><ISBILLWISEON>Yes</ISBILLWISEON>' . ($gstin ? '<PARTYGSTIN>' . self::x($gstin) . '</PARTYGSTIN>' : '') . '</LEDGER></TALLYMESSAGE>';
    }

    /** One accounting line. Tally: debit = ISDEEMEDPOSITIVE Yes + negative amount. */
    private static function line(string $ledger, float $amount, bool $debit, bool $party = false, ?string $billRef = null): string
    {
        $a = $debit ? -abs($amount) : abs($amount);
        $bill = $party && $billRef ? '<BILLALLOCATIONS.LIST><NAME>' . self::x($billRef) . '</NAME><BILLTYPE>New Ref</BILLTYPE><AMOUNT>' . self::amt($a) . '</AMOUNT></BILLALLOCATIONS.LIST>' : '';
        return '<ALLLEDGERENTRIES.LIST><LEDGERNAME>' . self::x($ledger) . '</LEDGERNAME><ISDEEMEDPOSITIVE>' . ($debit ? 'Yes' : 'No')
            . '</ISDEEMEDPOSITIVE><ISPARTYLEDGER>' . ($party ? 'Yes' : 'No') . '</ISPARTYLEDGER><AMOUNT>' . self::amt($a) . '</AMOUNT>' . $bill . '</ALLLEDGERENTRIES.LIST>';
    }

    private static function voucher(string $remoteId, string $type, string $date, string $number, string $party, string $narration, array $lines): string
    {
        return '<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER REMOTEID="' . self::x($remoteId) . '" VCHTYPE="' . self::x($type) . '" ACTION="Create">'
            . '<DATE>' . self::d($date) . '</DATE><VOUCHERTYPENAME>' . self::x($type) . '</VOUCHERTYPENAME><VOUCHERNUMBER>' . self::x($number) . '</VOUCHERNUMBER>'
            . '<PARTYLEDGERNAME>' . self::x($party) . '</PARTYLEDGERNAME><NARRATION>' . self::x($narration) . '</NARRATION><PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>'
            . implode('', $lines) . '</VOUCHER></TALLYMESSAGE>';
    }

    /** Builds [ledger_xml, voucher_xml] for a queue row. */
    public static function build(array $q): array
    {
        $cid = (int) $q['company_id'];
        $t = self::settings($cid);
        $L = $t['ledgers'];
        $company = $t['company'] ?? '';
        $rid = 'keshav-' . $q['ref_type'] . '-' . $q['ref_id'];
        $masters = '';
        $lines = [];

        switch ($q['ref_type']) {
            case 'sales_invoice':
                $doc = Db::one('SELECT s.*, c.name AS cname, c.gstin FROM sales_docs s LEFT JOIN customers c ON c.id = s.customer_id WHERE s.id = ?', [$q['ref_id']]);
                $party = $doc['cname'] ?: $L['walkin'];
                $masters = self::ledgerMaster($party, 'Sundry Debtors', $doc['gstin'] ?? null);
                $taxable = (float) $doc['subtotal'] - (float) $doc['discount'];
                $half = round((float) $doc['tax'] / 2, 2);
                $lines = [self::line($party, (float) $doc['total'], true, true, $doc['doc_no']), self::line($L['sales'], $taxable, false),
                          self::line($L['cgst_out'], $half, false), self::line($L['sgst_out'], round((float) $doc['tax'] - $half, 2), false)];
                $diff = round((float) $doc['total'] - $taxable - (float) $doc['tax'], 2); // round-off
                if (abs($diff) >= 0.01) $lines[] = self::line('Round Off', abs($diff), $diff < 0);
                return [self::envelope($company, $masters, 'All Masters'), self::envelope($company, self::voucher($rid, 'Sales', $doc['doc_date'], $doc['doc_no'], $party, 'App invoice ' . $doc['doc_no'], $lines))];

            case 'grn':
                $g = Db::one('SELECT g.*, v.name AS vname, v.gstin FROM grns g JOIN vendors v ON v.id = g.vendor_id WHERE g.id = ?', [$q['ref_id']]);
                $masters = self::ledgerMaster($g['vname'], 'Sundry Creditors', $g['gstin']);
                $half = round((float) $g['tax'] / 2, 2);
                $lines = [self::line($L['purchase'], (float) $g['subtotal'], true), self::line($L['cgst_in'], $half, true),
                          self::line($L['sgst_in'], round((float) $g['tax'] - $half, 2), true), self::line($g['vname'], (float) $g['total'], false, true, $g['bill_no'] ?: $g['grn_no'])];
                $diff = round((float) $g['total'] - (float) $g['subtotal'] - (float) $g['tax'], 2);
                if (abs($diff) >= 0.01) $lines[] = self::line('Round Off', abs($diff), $diff > 0);
                return [self::envelope($company, $masters, 'All Masters'), self::envelope($company, self::voucher($rid, 'Purchase', $g['bill_date'] ?: $g['created_at'], $g['bill_no'] ?: $g['grn_no'], $g['vname'], 'GRN ' . $g['grn_no'], $lines))];

            case 'payment':
                $p = Db::one('SELECT * FROM payments WHERE id = ?', [$q['ref_id']]);
                $party = $p['party_type'] === 'customer'
                    ? (Db::value('SELECT name FROM customers WHERE id = ?', [$p['party_id']]) ?: $L['walkin'])
                    : Db::value('SELECT name FROM vendors WHERE id = ?', [$p['party_id']]);
                $masters = self::ledgerMaster($party, $p['party_type'] === 'customer' ? 'Sundry Debtors' : 'Sundry Creditors');
                $cashBank = $p['mode'] === 'cash' ? $L['cash'] : $L['bank'];
                if ($p['direction'] === 'in') {
                    $lines = [self::line($cashBank, (float) $p['amount'], true), self::line($party, (float) $p['amount'], false, true, 'On Account')];
                    $type = 'Receipt';
                } else {
                    $lines = [self::line($party, (float) $p['amount'], true, true, 'On Account'), self::line($cashBank, (float) $p['amount'], false)];
                    $type = 'Payment';
                }
                return [self::envelope($company, $masters, 'All Masters'), self::envelope($company, self::voucher($rid, $type, $p['pay_date'], $p['pay_no'], $party, trim($p['pay_no'] . ' ' . $p['reference']), $lines))];

            case 'expense':
                $e = Db::one('SELECT * FROM expenses WHERE id = ?', [$q['ref_id']]);
                $cashBank = $e['mode'] === 'cash' ? $L['cash'] : $L['bank'];
                $lines = [self::line($L['expense'], (float) $e['amount'], true), self::line($cashBank, (float) $e['amount'], false)];
                return ['', self::envelope($company, self::voucher($rid, 'Payment', $e['exp_date'], $e['exp_no'], $cashBank, $e['category'] . ' · ' . $e['paid_to'] . ' · ' . $e['notes'], $lines))];

            case 'return':
                $r = Db::one('SELECT * FROM returns_docs WHERE id = ?', [$q['ref_id']]);
                if ($r['type'] === 'sales') {
                    $party = Db::value('SELECT name FROM customers WHERE id = ?', [$r['party_id']]) ?: $L['walkin'];
                    $lines = [self::line($L['sales_return'], (float) $r['total'], true), self::line($party, (float) $r['total'], false, true, 'On Account')];
                    $type = 'Credit Note';
                } else {
                    $party = Db::value('SELECT name FROM vendors WHERE id = ?', [$r['party_id']]);
                    $lines = [self::line($party, (float) $r['total'], true, true, 'On Account'), self::line($L['purchase_return'], (float) $r['total'], false)];
                    $type = 'Debit Note';
                }
                return ['', self::envelope($company, self::voucher($rid, $type, $r['created_at'], $r['return_no'], $party, (string) $r['reason'], $lines))];
        }
        return ['', ''];
    }
}
