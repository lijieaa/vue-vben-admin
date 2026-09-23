# Start SCADA frontend (@vben/web-ele) on http://127.0.0.1:5777
#
# Usage:
#   .\scripts\start-frontend.ps1
#   .\scripts\start-frontend.ps1 -Install
#   .\scripts\start-frontend.ps1 -Foreground   # run in this terminal (Ctrl+C to stop)
#   .\scripts\start-frontend.cmd              # double-click
param(
  [switch]$Install,
  [switch]$Foreground,
  [int]$Port = 5777,
  [int]$ReadyTimeoutSec = 180,
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

# Avoid system HTTP proxy breaking localhost probes (Clash/etc on :7890)
$env:NO_PROXY = '127.0.0.1,localhost,::1'
$env:no_proxy = $env:NO_PROXY

function Test-PortListening([int]$p) {
  try {
    $c = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
    return $null -ne $c
  } catch {
    return [bool](netstat -ano | Select-String (":{0}\s+.*LISTENING" -f $p))
  }
}

function Test-TcpOpen([string]$hostName, [int]$p, [int]$timeoutMs = 800) {
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $iar = $client.BeginConnect($hostName, $p, $null, $null)
    $ok = $iar.AsyncWaitHandle.WaitOne($timeoutMs, $false)
    if (-not $ok) { $client.Close(); return $false }
    $client.EndConnect($iar)
    $client.Close()
    return $true
  } catch {
    return $false
  }
}

Write-Host ("Repo: {0}" -f $root)

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  throw 'pnpm not found. Install Node.js + pnpm, then retry.'
}

if ($Install -or -not (Test-Path (Join-Path $root 'node_modules'))) {
  Write-Host 'Running pnpm install...'
  pnpm install
  if ($LASTEXITCODE -ne 0) { throw "pnpm install failed: $LASTEXITCODE" }
}

$url = "http://127.0.0.1:{0}/" -f $Port

if ((Test-PortListening $Port) -or (Test-TcpOpen '127.0.0.1' $Port)) {
  Write-Host ("Port {0} already listening - frontend may already be running." -f $Port)
  Write-Host ("Open {0}" -f $url)
  if (-not $NoBrowser) {
    try { Start-Process $url } catch {}
  }
  exit 0
}

Write-Host 'Deps check:'
if (Test-PortListening 8080) {
  Write-Host '  scada HTTP :8080 LISTENING'
} else {
  Write-Host '  WARN scada HTTP :8080 not listening (device/tag API will fail)'
}
if (Test-PortListening 8085) {
  Write-Host '  scada MQTT-WS :8085 LISTENING'
} else {
  Write-Host '  WARN scada MQTT-WS :8085 not listening (live values / write ack offline)'
}

if ($Foreground) {
  Write-Host ("Starting pnpm dev:ele in this terminal -> {0}" -f $url)
  pnpm dev:ele
  exit $LASTEXITCODE
}

Write-Host 'Starting pnpm dev:ele in a new console...'
$proc = Start-Process -FilePath 'cmd.exe' -WorkingDirectory $root -PassThru `
  -ArgumentList @('/k', 'title web-ele :5777 && pnpm dev:ele')
Write-Host ("Dev console PID={0}" -f $proc.Id)

$deadline = (Get-Date).AddSeconds($ReadyTimeoutSec)
while ((Get-Date) -lt $deadline) {
  if ($proc.HasExited) {
    throw 'dev:ele console exited before ready'
  }
  if ((Test-PortListening $Port) -or (Test-TcpOpen '127.0.0.1' $Port)) {
    Write-Host ("Ready: {0}" -f $url)
    if (-not $NoBrowser) {
      try { Start-Process $url } catch {}
    }
    exit 0
  }
  Start-Sleep -Milliseconds 500
}

Write-Host ("Timeout waiting for port {0} (first compile can be slow - check the console)." -f $Port)
Write-Host ("URL when ready: {0}" -f $url)
exit 1
