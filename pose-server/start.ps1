# Starts the pose server and a free Cloudflare quick tunnel, then prints the pairing link (Windows).
# Usage: .\start.ps1 [-App https://nutri-move-ai.vercel.app] [-Port 8000]
param([string]$App = "https://nutri-move-ai.vercel.app", [int]$Port = 8000)
Set-Location $PSScriptRoot
$env:NM_TOKEN = if ($env:NM_TOKEN) { $env:NM_TOKEN } else { "{0:D6}" -f (Get-Random -Maximum 1000000) }
$env:PORT = "$Port"
# Prefer the project's virtual environment so nothing needs activating first.
$py = if ($env:PYTHON) { $env:PYTHON } elseif (Test-Path ".venv\Scripts\python.exe") { (Resolve-Path ".venv\Scripts\python.exe").Path } else { "python" }
if (-not (Test-Path "models\instanthmr.onnx")) { & $py download_model.py }
$server = Start-Process -FilePath $py -ArgumentList "server.py" -PassThru -NoNewWindow
try {
  for ($i = 0; $i -lt 60; $i++) {
    try { Invoke-WebRequest "http://127.0.0.1:$Port/health" -UseBasicParsing | Out-Null; break } catch { Start-Sleep 1 }
  }
  Write-Host "pose server up. pairing code: $($env:NM_TOKEN)"
  Write-Host "starting tunnel ..."
  cloudflared tunnel --url "http://127.0.0.1:$Port" 2>&1 | ForEach-Object {
    $line = "$_"
    if ($line -match 'https://([a-z0-9-]+\.trycloudflare\.com)') {
      Write-Host ""
      Write-Host "Open this on the phone (type it or scan it as a QR):"
      Write-Host "  $App/workout/pair?server=$($Matches[1])&token=$($env:NM_TOKEN)"
      Write-Host ""
    }
  }
} finally { Stop-Process -Id $server.Id -ErrorAction SilentlyContinue }
