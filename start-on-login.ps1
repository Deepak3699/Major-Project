# Starts the already-built HireGen Docker stack after the current Windows user
# signs in. Docker Desktop is launched if it is not already running.
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

$logDirectory = Join-Path $PSScriptRoot '.local-runtime\startup'
$logPath = Join-Path $logDirectory 'startup.log'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

function Write-StartupLog([string]$Message) {
    Add-Content -LiteralPath $logPath -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
}

function Invoke-Compose([string[]]$Arguments) {
    $oldErrorAction = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = & docker compose --progress quiet @Arguments 2>&1
        $code = $LASTEXITCODE
        foreach ($line in $output) { Write-StartupLog ([string]$line) }
    } finally {
        $ErrorActionPreference = $oldErrorAction
    }
    return $code
}

try {
    $dockerCommand = Get-Command docker -ErrorAction Stop
    $desktopCandidates = @(
        (Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'),
        (Join-Path $env:LOCALAPPDATA 'Programs\Docker\Docker\Docker Desktop.exe')
    )
    $desktopPath = $desktopCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

    $engineCheckExit = 1
    try {
        & $dockerCommand.Source info *> $null
        $engineCheckExit = $LASTEXITCODE
    } catch { $engineCheckExit = 1 }
    if ($engineCheckExit -ne 0 -and $desktopPath) {
        Write-StartupLog 'Launching Docker Desktop.'
        Start-Process -FilePath $desktopPath -WindowStyle Hidden
    }

    $engineReady = $false
    for ($attempt = 1; $attempt -le 180; $attempt++) {
        try {
            & $dockerCommand.Source info *> $null
            $engineCheckExit = $LASTEXITCODE
        } catch { $engineCheckExit = 1 }
        if ($engineCheckExit -eq 0) { $engineReady = $true; break }
        Start-Sleep -Seconds 2
    }
    if (-not $engineReady) {
        throw 'Docker engine did not become ready. Start Docker Desktop and check startup.log.'
    }

    Write-StartupLog 'Starting HireGen containers.'
    if ((Invoke-Compose @('up', '-d')) -ne 0) { throw 'docker compose up failed.' }

    # Keep schema/bootstrap safe when this task is repeated at every sign-in.
    if ((Invoke-Compose @('run', '--rm', 'pg-migrator')) -ne 0) { throw 'Database base schema step failed.' }

    $migrated = $false
    for ($attempt = 1; $attempt -le 15; $attempt++) {
        if ((Invoke-Compose @('exec', '-T', 'api', 'npm', 'run', '--silent', 'migrate')) -eq 0) {
            $migrated = $true
            break
        }
        Start-Sleep -Seconds 3
    }
    if (-not $migrated) { throw 'Database migrations did not complete.' }

    # The seed script is idempotent and reads the existing credentials from .env.
    $seedExit = Invoke-Compose @('exec', '-T', 'api', 'npm', 'run', '--silent', 'seed:admin')
    if ($seedExit -ne 0) { Write-StartupLog 'Admin seed did not confirm; the account may already exist.' }

    Write-StartupLog 'HireGen stack started and database migrations checked.'
} catch {
    Write-StartupLog "Startup failed: $($_.Exception.Message)"
    exit 1
}
