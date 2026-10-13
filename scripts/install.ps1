param(
  [switch]$Uninstall,
  [string]$Version = "latest",
  [string]$RepoOwner = "caya8205-2",
  [string]$RepoName = "imgpull"
)

$AppDir = "$env:LOCALAPPDATA\imgpull"
$BinPath = Join-Path $AppDir 'imgpull.exe'

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
    Write-Host "  >> PATH already contains imgpull" -ForegroundColor Cyan
  }
}

function RemoveFromPath {
  $current = [Environment]::GetEnvironmentVariable('PATH', 'User')
  if ($current -and $current.Contains($AppDir)) {
    $new = ($current -split ';' | Where-Object { $_ -ne $AppDir }) -join ';'
    [Environment]::SetEnvironmentVariable('PATH', $new, 'User')
  }
}

function Dl($url, $out) {
  $name = Split-Path $url -Leaf
  Write-Host "  Downloading $name ..." -NoNewline
  Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing
  Write-Host " " -NoNewline
  Checkmark "Downloaded $name"
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

# ── Already installed? ────────────────────────────────────
if (Test-Path $BinPath) {
  Write-Host "imgpull is already installed." -ForegroundColor Yellow
  Write-Host "  [U]ninstall   - remove imgpull"
  Write-Host "  [R]einstall   - overwrite files"
  Write-Host "  [C]ancel      - do nothing"
  $key = "$((Read-Host 'Choice'))".ToUpper()
  if ($key -eq 'U') { DoUninstall; return }
  if ($key -ne 'R') { Write-Host "Cancelled." -ForegroundColor Gray; return }
}

# ── Install flow ──────────────────────────────────────────
if (-not (Test-Path $AppDir)) { New-Item -ItemType Directory -Path $AppDir -Force | Out-Null }

$scriptPath = if ($MyInvocation.MyCommand.Path) { Split-Path $MyInvocation.MyCommand.Path -Parent } else { $null }
$localExe = if ($scriptPath) { Join-Path $scriptPath 'imgpull.exe' } else { $null }

if ($localExe -and (Test-Path $localExe)) {
  Write-Host "Installing from local files ..." -ForegroundColor Cyan
  Copy-Item -LiteralPath $localExe -Destination $BinPath -Force
  Checkmark "Copied imgpull.exe"
} else {
  Write-Host "Fetching release info from GitHub ..." -ForegroundColor Cyan

  if ($Version -eq "latest") {
    $apiUrl = "https://api.github.com/repos/$RepoOwner/$RepoName/releases/latest"
  } else {
    $apiUrl = "https://api.github.com/repos/$RepoOwner/$RepoName/releases/tags/$Version"
  }

  try {
    $release = Invoke-RestMethod -Uri $apiUrl -Headers @{ "User-Agent" = "imgpull-installer" }
    $baseUrl = "https://github.com/$RepoOwner/$RepoName/releases/download/$($release.tag_name)"

    Checkmark "Found release $($release.tag_name)"
    Dl "$baseUrl/imgpull.exe" $BinPath
  } catch {
    Write-Host ""
    Write-Host "ERROR: Failed to fetch release from GitHub." -ForegroundColor Red
    Write-Host "Make sure the repository has published releases." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "You can also download manually from:" -ForegroundColor Cyan
    Write-Host "https://github.com/$RepoOwner/$RepoName/releases" -ForegroundColor White
    exit 1
  }
}

AddToPath
Write-Host ""
Checkmark "Installation complete"
Write-Host ""
Write-Host "Installed to:" -ForegroundColor Cyan
Write-Host "  $AppDir" -ForegroundColor White
Write-Host ""
Write-Host "Open a new terminal and run: imgpull --help" -ForegroundColor White
