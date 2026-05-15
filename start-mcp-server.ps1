param(
  [int]$Port = 7800,
  [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ServerDir = Join-Path $RepoRoot "mcp-server"
$EntryPoint = Join-Path $ServerDir "dist\index.js"
$HealthUrl = "http://localhost:$Port/health"

function Write-Info($Message) {
  Write-Host "[figma-mcp] $Message"
}

function Get-ListeningProcess($PortNumber) {
  try {
    return Get-NetTCPConnection -LocalPort $PortNumber -State Listen -ErrorAction Stop | Select-Object -First 1
  } catch {
    return $null
  }
}

function Test-McpHealth {
  try {
    return Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 2
  } catch {
    return $null
  }
}

if (!(Test-Path $ServerDir)) {
  throw "MCP server directory not found: $ServerDir"
}

$health = Test-McpHealth
if ($health -and $health.ok) {
  Write-Info "MCP server is already running at $HealthUrl"
  Write-Info "connected=$($health.connected)"
  if ($CheckOnly) {
    exit 0
  }
  Write-Info "Nothing to start. Keep the existing server running."
  exit 0
}

$listener = Get-ListeningProcess $Port
if ($listener) {
  $process = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
  $name = if ($process) { $process.ProcessName } else { "unknown" }
  throw "Port $Port is already in use by PID $($listener.OwningProcess) ($name), but $HealthUrl did not return a healthy MCP response."
}

if ($CheckOnly) {
  Write-Info "No MCP server is listening on port $Port."
  if (Test-Path $EntryPoint) {
    Write-Info "Build artifact exists: $EntryPoint"
  } else {
    Write-Info "Build artifact is missing and would be created on start: $EntryPoint"
  }
  exit 0
}

Push-Location $ServerDir
try {
  if (!(Test-Path $EntryPoint)) {
    Write-Info "Build artifact missing. Running npm.cmd run build..."
    npm.cmd run build
  }

  $env:MCP_HTTP_PORT = [string]$Port
  Write-Info "Starting MCP server on http://localhost:$Port"
  Write-Info "Press Ctrl+C to stop."
  node dist/index.js
} finally {
  Pop-Location
}
