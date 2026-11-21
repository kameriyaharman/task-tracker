# ─────────────────────────────────────────────────────────────────────────────
#  Keshav ERP  →  TallyPrime connector
#  Run on the PC where TallyPrime is open.
#
#  One-time setup in TallyPrime:
#    F1 (Help) → Settings → Connectivity → Client/Server configuration
#      TallyPrime acts as: Both    Port: 9000
#    Open the company that matches the "Tally company name" in the Keshav admin panel.
#    Make sure these ledgers exist (names can be changed in admin → Tally):
#      Sales, Purchase, Cash, Bank, Output CGST, Output SGST, Input CGST, Input SGST,
#      Round Off, Office Expenses, Sales Return, Purchase Return, Cash Customer
#    (Customer / vendor ledgers are created automatically.)
#
#  Run:   Right-click → "Run with PowerShell"   (keep the window open)
#  Auto-start: Task Scheduler → Create task → At log on →
#          powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\Keshav\KeshavTallyConnector.ps1"
#
#  Safe to stop and start any time: nothing is lost, pending vouchers wait on the server.
#  Every voucher has a fixed REMOTEID, so a retry never creates a duplicate.
# ─────────────────────────────────────────────────────────────────────────────

$ApiUrl   = "__API_URL__"
$Token    = "__TOKEN__"
$TallyUrl = "__TALLY_URL__"
$EverySec = 60

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Headers = @{ "X-Tally-Token" = $Token }

function Post-Tally([string]$xml) {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($xml)
    return Invoke-WebRequest -Uri $TallyUrl -Method Post -Body $bytes -ContentType "text/xml; charset=utf-8" -UseBasicParsing -TimeoutSec 60
}

function Tally-Ok([string]$resp) {
    $created = 0; $altered = 0; $errors = 0
    if ($resp -match "<CREATED>(\d+)</CREATED>") { $created = [int]$Matches[1] }
    if ($resp -match "<ALTERED>(\d+)</ALTERED>") { $altered = [int]$Matches[1] }
    if ($resp -match "<ERRORS>(\d+)</ERRORS>")   { $errors  = [int]$Matches[1] }
    $lineErr = ""
    if ($resp -match "<LINEERROR>(.*?)</LINEERROR>") { $lineErr = $Matches[1] }
    return @{ ok = (($created + $altered) -gt 0 -and $errors -eq 0); error = $lineErr; raw = $resp }
}

Write-Host "Keshav → Tally connector started. Server: $ApiUrl   Tally: $TallyUrl" -ForegroundColor Green
while ($true) {
    try {
        $data = Invoke-RestMethod -Uri "$ApiUrl/tally/pending" -Headers $Headers -Method Get -TimeoutSec 60
        if ($data.tally_url) { $TallyUrl = $data.tally_url }
        foreach ($item in $data.items) {
            try {
                if ($item.ledger_xml) { try { Post-Tally $item.ledger_xml | Out-Null } catch { } }   # "already exists" is fine
                $r = Post-Tally $item.voucher_xml
                $res = Tally-Ok $r.Content
                $err = $res.error
                if (-not $res.ok -and -not $err) { $err = ($res.raw -replace "\s+", " ").Substring(0, [Math]::Min(400, $res.raw.Length)) }
                $body = @{ id = $item.id; ok = $res.ok; error = $err } | ConvertTo-Json
                Invoke-RestMethod -Uri "$ApiUrl/tally/result" -Headers $Headers -Method Post -Body $body -ContentType "application/json" | Out-Null
                if ($res.ok) { Write-Host (Get-Date -Format "HH:mm:ss") " OK    " $item.voucher_type $item.ref -ForegroundColor Cyan }
                else { Write-Host (Get-Date -Format "HH:mm:ss") " FAIL  " $item.voucher_type $item.ref $err -ForegroundColor Yellow }
            } catch {
                # Tally closed / not reachable: leave it pending, try again next round
                Write-Host (Get-Date -Format "HH:mm:ss") " Tally not reachable at $TallyUrl — is TallyPrime open with the company loaded?" -ForegroundColor Red
                break
            }
        }
    } catch {
        Write-Host (Get-Date -Format "HH:mm:ss") " Server not reachable: $($_.Exception.Message)" -ForegroundColor Red
    }
    Start-Sleep -Seconds $EverySec
}
