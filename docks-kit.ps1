# docks-kit.ps1 - Windows checkout launcher. It runs cli\src\main.ts with Bun
# and installs Bun and node_modules when they are missing.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# BEGIN GENERATED BUN PIN
$BunPin = "1.4.4"
# END GENERATED BUN PIN

# BEGIN GENERATED BUN FLOOR
$BunFloor = "1.4.4"
# END GENERATED BUN FLOOR

# Reject an unsupported host before the Bun install, so that the user gets
# one clear message instead of a failed download or a failed source run.
$ProcessorArchitecture = if (-not [string]::IsNullOrWhiteSpace($env:PROCESSOR_ARCHITEW6432)) {
  $env:PROCESSOR_ARCHITEW6432
} else {
  $env:PROCESSOR_ARCHITECTURE
}
if ([string]::IsNullOrWhiteSpace($ProcessorArchitecture)) {
  $ProcessorArchitecture = '<unknown>'
}
switch ($ProcessorArchitecture) {
  'AMD64' { }
  default {
    $HostName = "Windows-$ProcessorArchitecture"
    [Console]::Error.WriteLine("[docks-kit] unsupported host $HostName; docks-kit supports Linux on x64 and arm64, macOS on arm64, and Windows on x64.")
    exit 1
  }
}

function Find-Bun {
  $Command = Get-Command bun -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -ne $Command) {
    return $Command.Source
  }

  $Candidates = @()
  if (-not [string]::IsNullOrWhiteSpace($env:BUN_INSTALL)) {
    $Candidates += Join-Path $env:BUN_INSTALL 'bin\bun.exe'
  }
  if (-not [string]::IsNullOrWhiteSpace($env:USERPROFILE)) {
    $Candidates += Join-Path $env:USERPROFILE '.bun\bin\bun.exe'
  }
  foreach ($Candidate in $Candidates) {
    if (Test-Path -LiteralPath $Candidate -PathType Leaf) {
      return $Candidate
    }
  }
  return $null
}

$Bun = Find-Bun
if ($null -eq $Bun) {
  [Console]::Error.WriteLine('[docks-kit] Bun not found - installing (download-then-run)...')
  $TempInstaller = Join-Path ([IO.Path]::GetTempPath()) "bun-install-$([Guid]::NewGuid().ToString('N')).ps1"
  try {
    Invoke-WebRequest -Uri 'https://bun.sh/install.ps1' -OutFile $TempInstaller -UseBasicParsing
    # A downloaded .ps1 carries a Mark-of-the-Web, so calling it directly is
    # blocked under the default RemoteSigned policy. Use the invocation form
    # upstream documents, matching os/windows.ts bunInstaller.
    & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $TempInstaller -Version $BunPin *> $null
  } catch {
    # The install guidance below is shared by download and installer failures.
  } finally {
    Remove-Item -LiteralPath $TempInstaller -Force -ErrorAction SilentlyContinue
  }
  $Bun = Find-Bun
  if ($null -eq $Bun) {
    [Console]::Error.WriteLine('[docks-kit] Bun install failed. Install Bun manually from https://bun.sh, then run docks-kit again.')
    exit 1
  }
}

# Sentinel is a real dependency dir, not bare node_modules\ - a failed or
# partial install leaves node_modules\ present and would suppress the repair.
if (-not (Test-Path -LiteralPath (Join-Path $RepoDir 'node_modules\effect') -PathType Container)) {
  $DetectedBunVersion = ''
  try {
    $BunOutput = & $Bun --version 2>$null
    if ($LASTEXITCODE -eq 0) {
      $DetectedBunVersion = ([string]($BunOutput -join "`n")).TrimEnd("`r")
    }
  } catch {
    $DetectedBunVersion = ''
  }

  $NormalizedBunVersion = $DetectedBunVersion -replace '[-+].*$', ''
  $InstalledBunVersion = $null
  $RequiredBunVersion = $null
  if ($NormalizedBunVersion -match '^\d+\.\d+\.\d+$' -and $BunFloor -match '^\d+\.\d+\.\d+$') {
    try {
      $InstalledBunVersion = [version]::Parse($NormalizedBunVersion)
      $RequiredBunVersion = [version]::Parse($BunFloor)
    } catch {
      $InstalledBunVersion = $null
      $RequiredBunVersion = $null
    }
  }
  if ($null -ne $InstalledBunVersion -and $null -ne $RequiredBunVersion -and $InstalledBunVersion -lt $RequiredBunVersion) {
    [Console]::Error.WriteLine("[docks-kit] Bun $DetectedBunVersion is below the required floor $BunFloor; this checkout's lockfile requires Bun $BunFloor or newer. Run: bun upgrade")
    exit 1
  }
  [Console]::Error.WriteLine('[docks-kit] Installing CLI dependencies (bun install --frozen-lockfile)...')
  # Windows PowerShell 5.1 turns redirected native stderr lines into errors,
  # and the 'Stop' preference makes them terminate the script. The exit code
  # decides success, so scope a 'Continue' preference to the native call.
  $PreviousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  Push-Location $RepoDir
  try {
    & $Bun install --frozen-lockfile *> $null
    $InstallExit = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $PreviousPreference
    Pop-Location
  }
  if ($InstallExit -ne 0) {
    exit $InstallExit
  }
}

& $Bun (Join-Path $RepoDir 'cli\src\main.ts') @args
exit $LASTEXITCODE
