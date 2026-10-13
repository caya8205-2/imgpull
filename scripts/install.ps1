param(
  [switch]$Uninstall,
  [string]$Version = "latest",
  [string]$RepoOwner = "caya8205-2",
  [string]$RepoName = "imgpull"
)

$AppDir = "$env:LOCALAPPDATA\imgpull"
$CmdPath = Join-Path $AppDir 'imgpull.cmd'
$Ps1Path = Join-Path $AppDir 'imgpull.ps1'

function Checkmark {
  param([string]$Text)
  Write-Host "  >> $Text" -ForegroundColor Green
}

function AddToPath {
  $current = [Environment]::GetEnvironmentVariable('PATH', 'User')
  if ($current -split ';' -notcontains $AppDir) {
    [Environment]::SetEnvironmentVariable('PATH', "$AppDir;$current", 'User')
    Checkmark "Added to PATH (user-level)"
  } else {
    Write-Host "  ✓ PATH already contains imgpull" -ForegroundColor Cyan
  }
}

function RemoveFromPath {
  $current = [Environment]::GetEnvironmentVariable('PATH', 'User')
  if ($current -and $current.Contains($AppDir)) {
    $new = ($current -split ';' | Where-Object { $_ -ne $AppDir }) -join ';'
    [Environment]::SetEnvironmentVariable('PATH', $new, 'User')
  }
}

function DoUninstall {
  Write-Host "Removing imgpull ..." -ForegroundColor Yellow
  if (Test-Path $AppDir) { Remove-Item $AppDir -Recurse -Force; Checkmark "Removed $AppDir" }
  RemoveFromPath
  Write-Host ""
  Checkmark "imgpull uninstalled"
}

# ── Uninstall flow ────────────────────────────────────────
if ($Uninstall) { DoUninstall; return }

# ── Prerequisite checks ───────────────────────────────────
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "ERROR: Node.js is required to run imgpull." -ForegroundColor Red
  Write-Host "Please install Node.js 18+ from https://nodejs.org or run:" -ForegroundColor Yellow
  Write-Host "  winget install OpenJS.NodeJS" -ForegroundColor Cyan
  exit 1
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Host "ERROR: npm is required to install imgpull." -ForegroundColor Red
  exit 1
}

# ── Already installed? ────────────────────────────────────
if (Test-Path $CmdPath) {
  Write-Host "imgpull is already installed." -ForegroundColor Yellow
  Write-Host "  [U]ninstall   - remove imgpull"
  Write-Host "  [R]einstall   - overwrite files"
  Write-Host "  [C]ancel      - do nothing"
  $key = (Read-Host "Choice").ToUpper()
  if ($key -eq 'U') { DoUninstall; return }
  if ($key -ne 'R') { Write-Host "Cancelled." -ForegroundColor Gray; return }
}

# ── Install flow ──────────────────────────────────────────
Write-Host "Installing imgpull to $AppDir ..." -ForegroundColor Cyan
if (-not (Test-Path $AppDir)) { New-Item -ItemType Directory -Path $AppDir -Force | Out-Null }

# Check if npm package exists or fallback to GitHub
$pkgSpec = if ($Version -eq "latest") { "imgpull" } else { "imgpull@$Version" }
$published = $false
try {
  $null = npm view $pkgSpec version 2>$null
  if ($LASTEXITCODE -eq 0) { $published = $true }
} catch {}

if (-not $published) {
  # Fallback to GitHub repository until published to npm registry
  $pkgSpec = "https://github.com/$RepoOwner/$RepoName.git"
}

Write-Host "  Installing package ($pkgSpec) via npm ..." -ForegroundColor Cyan
$installOutput = npm install --prefix "$AppDir" "$pkgSpec" 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "ERROR: Failed to install imgpull dependencies." -ForegroundColor Red
  Write-Host $installOutput
  exit 1
}
Checkmark "Installed package and dependencies"

# Create imgpull.cmd wrapper
$cmdContent = "@echo off`r`nnode `"%~dp0node_modules\imgpull\bin\imgpull.js`" %*"
Set-Content -Path $CmdPath -Value $cmdContent -Encoding ASCII
Checkmark "Created imgpull.cmd launcher"

# Create imgpull.ps1 wrapper
$ps1Content = "& node `"`$PSScriptRoot\node_modules\imgpull\bin\imgpull.js`" @args"
Set-Content -Path $Ps1Path -Value $ps1Content -Encoding UTF8
Checkmark "Created imgpull.ps1 launcher"

AddToPath
Write-Host ""
Checkmark "Installation complete"
Write-Host ""
Write-Host "Installed to:" -ForegroundColor Cyan
Write-Host "  $AppDir" -ForegroundColor White
Write-Host ""
Write-Host "Open a new terminal and run: imgpull" -ForegroundColor Green
