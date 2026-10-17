# up.ps1 - one-shot stack launcher for Windows 10/11 (PowerShell + Docker Desktop).
# Linux/macOS users: run ./up.sh instead. Same steps, same result.
#
# Idempotent: safe to re-run any time. Unlike up.sh this does NOT start an SSH
# server - that step is Linux host ops and has no meaning under Docker Desktop.
#
# Usage (from the repo folder, in PowerShell):
#   powershell -ExecutionPolicy Bypass -File .\up.ps1
#   # or, if script execution is already allowed:
#   .\up.ps1

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

function Step($msg) { Write-Host "==> $msg" }
function Note($msg) { Write-Host "    $msg" }

# --- Prerequisite checks -----------------------------------------------------
Step 'Checking Docker...'
try {
    & docker version --format '{{.Server.Version}}' 2>$null | Out-Null
} catch {
    Write-Host 'X Docker CLI not found on PATH.' -ForegroundColor Red
    Write-Host '  Install Docker Desktop: https://www.docker.com/products/docker-desktop/'
    exit 1
}
if ($LASTEXITCODE -ne 0) {
    Write-Host 'X Docker is installed but the daemon is not running.' -ForegroundColor Red
    Write-Host '  Start Docker Desktop and wait for it to report "running", then re-run this script.'
    exit 1
}
Note 'Docker OK'

try {
    & docker compose version | Out-Null
} catch {
    Write-Host 'X "docker compose" v2 not available. Update Docker Desktop.' -ForegroundColor Red
    exit 1
}

# --- .env --------------------------------------------------------------------
if (-not (Test-Path '.env')) {
    if (Test-Path '.env.example') {
        Copy-Item '.env.example' '.env'
        Note 'Created .env from .env.example.'
        Write-Host ''
        Write-Host '  !! OPEN .env AND SET THESE BEFORE YOU RELY ON THIS STACK:' -ForegroundColor Yellow
        Write-Host '       JWT_SECRET         - any long random string'
        Write-Host '       ENCRYPTION_SECRET  - min 32 chars, encrypts API keys at rest'
        Write-Host '       ADMIN_EMAIL / ADMIN_PASSWORD - the login this script bootstraps'
        Write-Host '       Optional: GEMINI_API_KEY, RESEND_API_KEY, SNOVIO/CONTACT_OUT keys'
        Write-Host '     Continuing now with the placeholder values so you can see it come up.'
        Write-Host ''
    } else {
        Write-Host 'X Neither .env nor .env.example found - cannot configure the stack.' -ForegroundColor Red
        exit 1
    }
}

# --- Build + start -----------------------------------------------------------
Step 'Building images & starting stack (postgres, redis, api, web, workers, reacher, n8n)...'
Write-Host '    First run pulls base images and builds - allow a few minutes.'
& docker compose up -d --build
if ($LASTEXITCODE -ne 0) {
    Write-Host 'X docker compose failed to bring the stack up. See output above.' -ForegroundColor Red
    exit 1
}

# --- Migrations (idempotent; postgres/api may still be warming up) -----------
Step 'Applying database migrations (idempotent)...'
$migrated = $false
for ($i = 1; $i -le 15; $i++) {
    & docker compose exec -T api npm run --silent migrate 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $migrated = $true; Note 'migrations applied'; break }
    Note "db/api not ready yet, retrying ($i/15)..."
    Start-Sleep -Seconds 3
}
if (-not $migrated) {
    Write-Host 'X Migrations did not apply after 15 attempts.' -ForegroundColor Red
    Write-Host '  Check: docker compose logs api | Select-Object -Last 40'
    exit 1
}

# --- Admin bootstrap (idempotent, reads ADMIN_EMAIL/ADMIN_PASSWORD from .env) -
Step 'Bootstrapping admin account (idempotent)...'
$seeded = $false
for ($i = 1; $i -le 10; $i++) {
    & docker compose exec -T api npm run --silent seed:admin 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $seeded = $true; break }
    Note "api not ready yet, retrying ($i/10)..."
    Start-Sleep -Seconds 3
}
if (-not $seeded) {
    Write-Host '! Admin bootstrap did not confirm. An admin may already exist.' -ForegroundColor Yellow
    Write-Host '  Verify: docker compose exec -T api npm run --silent seed:admin'
}

# --- Report ------------------------------------------------------------------
Step 'Status:'
& docker compose ps

# Read the credentials actually in use so the printed login is never a guess.
$adminEmail = ''
foreach ($line in Get-Content '.env') {
    if ($line.StartsWith('ADMIN_EMAIL=')) {
        $adminEmail = $line.Substring('ADMIN_EMAIL='.Length).Trim().Trim('"')
        break
    }
}
if (-not $adminEmail) { $adminEmail = 'ADMIN_EMAIL not set in .env' }

Write-Host ''
Write-Host 'Stack is up.' -ForegroundColor Green
Write-Host "  CRM UI    : http://localhost:5173"
Write-Host "  Login     : $adminEmail  /  (the ADMIN_PASSWORD value in .env)"
Write-Host '  API       : http://localhost:3000/health'
Write-Host '  n8n       : http://localhost:5678'
Write-Host ''
Write-Host 'Next commands:'
Write-Host '  docker compose ps                # status'
Write-Host '  docker compose logs -f api       # tail logs (web, workers, n8n too)'
Write-Host '  docker compose down              # stop, keep data'
Write-Host '  docker compose down -v           # stop AND WIPE databases'
Write-Host ''
Write-Host "If the browser shows a stale page after an update: Ctrl+Shift+R."
