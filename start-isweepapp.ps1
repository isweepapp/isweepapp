# ── isweepapp.uk Production Launcher ─────────────────────────────────────────
# Run from CMD:  powershell -ExecutionPolicy Bypass -File start-isweepapp.ps1

$ProjectDir   = "C:\Users\Admin\Downloads\isweepapp"
$EnvFile      = "$ProjectDir\isweepapp.env"
$TunnelConfig = "C:\Users\Admin\.cloudflared\isweepapp-config.yml"

# ── Read env file line by line (handles special chars in values) ──────────────
foreach ($line in Get-Content $EnvFile) {
    if ($line -match "^PORT=(.+)$")                   { $env:PORT                   = $Matches[1] }
    if ($line -match "^DB_PATH=(.+)$")                { $env:DB_PATH                = $Matches[1] }
    if ($line -match "^ADMIN_PASSWORD=(.+)$")         { $env:ADMIN_PASSWORD         = $Matches[1] }
    if ($line -match "^FOOTBALL_DATA_API_KEY=(.*)$")  { $env:FOOTBALL_DATA_API_KEY  = $Matches[1] }
}

Write-Host ""
Write-Host "  isweepapp.uk  |  Production Launch" -ForegroundColor Cyan
Write-Host "  Node.js  ->  http://localhost:$($env:PORT)" -ForegroundColor Yellow
Write-Host "  Public   ->  https://isweepapp.uk" -ForegroundColor Green
Write-Host ""

# ── Open Cloudflare Tunnel in a separate window ───────────────────────────────
Write-Host "  Starting Cloudflare Tunnel in new window..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "Write-Host 'isweepapp Tunnel' -ForegroundColor Cyan; cloudflared tunnel --config '$TunnelConfig' run isweepapp"
)

Start-Sleep -Seconds 2

# ── Run Node.js in this window (inherits the env vars set above) ──────────────
Write-Host "  Starting Node.js (port $($env:PORT))..." -ForegroundColor Cyan
Write-Host "  Press Ctrl+C to stop." -ForegroundColor DarkGray
Write-Host ""
Set-Location $ProjectDir
node server.js
