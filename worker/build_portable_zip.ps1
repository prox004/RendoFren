# ====================================================================
# RendoFren GPU Worker - Portable Native Distribution Builder
# ====================================================================
# This script builds a highly stable portable folder containing the raw source code,
# an embedded self-contained Python installation, pre-installed PIP packages, 
# and the portable Blender Engine. No unstable PyInstaller EXEs required!

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  RendoFren Portable Worker Builder (Native Source)       " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Prepare clean distribution directory
$distFolder = "dist\RendoFrenPortable"
if (Test-Path $distFolder) { Remove-Item -Recurse -Force $distFolder }
New-Item -ItemType Directory -Force -Path $distFolder | Out-Null

# 2. Copy Source Code and Assets
Write-Host "`n[1/4] Copying source code and assets..." -ForegroundColor Yellow
Copy-Item -Path "src" -Destination "$distFolder\src" -Recurse
Copy-Item -Path "Copper.blend" -Destination "$distFolder\"
Copy-Item -Path "requirements.txt" -Destination "$distFolder\"
Copy-Item -Path "RendoFrenWorker.py" -Destination "$distFolder\"
if (Test-Path ".env") { Copy-Item -Path ".env" -Destination "$distFolder\" }

# 3. Setup Portable Python Embeddable
Write-Host "`n[2/4] Downloading and configuring Portable Python 3.11..." -ForegroundColor Yellow
$pyZip = "python-3.11.8-embed-amd64.zip"
$pyUrl = "https://www.python.org/ftp/python/3.11.8/python-3.11.8-embed-amd64.zip"

if (-not (Test-Path $pyZip)) {
    Write-Host "Downloading Python 3.11 Embeddable Package..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri $pyUrl -OutFile $pyZip
}

$pyDir = "$distFolder\python"
Expand-Archive -Path $pyZip -DestinationPath $pyDir -Force

# Fix Python embeddable to support PIP by enabling site-packages
$pthFile = "$pyDir\python311._pth"
$pthContent = Get-Content $pthFile
$pthContent = $pthContent -replace "#import site", "import site"
Set-Content -Path $pthFile -Value $pthContent

# Install PIP natively inside the portable Python container
Write-Host "Injecting PIP into the portable Python container..." -ForegroundColor Cyan
Invoke-WebRequest -Uri "https://bootstrap.pypa.io/get-pip.py" -OutFile "$pyDir\get-pip.py"
& "$pyDir\python.exe" "$pyDir\get-pip.py" | Out-Null

# Install Requirements
Write-Host "Installing RendoFren dependencies inside portable folder..." -ForegroundColor Cyan
& "$pyDir\python.exe" -m pip install -r "$distFolder\requirements.txt" --quiet
& "$pyDir\python.exe" -m pip install PyQt6 --quiet

# 4. Handle Portable Blender
Write-Host "`n[3/4] Packaging Portable Blender 4.1.0..." -ForegroundColor Yellow
$blenderZip = "blender-4.1.0-windows-x64.zip"
$blenderUrl = "https://download.blender.org/release/Blender4.1/blender-4.1.0-windows-x64.zip"

if (-not (Test-Path $blenderZip)) {
    Write-Host "Downloading Portable Blender CLI (315MB)..." -ForegroundColor Cyan
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $blenderUrl -OutFile $blenderZip
}

Write-Host "Extracting Blender directly into distribution..." -ForegroundColor Cyan
if (Test-Path "blender_temp") { Remove-Item -Recurse -Force "blender_temp" }
Expand-Archive -Path $blenderZip -DestinationPath "blender_temp" -Force
New-Item -ItemType Directory -Force -Path "$distFolder\blender" | Out-Null
$extractedDir = Get-ChildItem "blender_temp" | Select-Object -First 1
Move-Item "$($extractedDir.FullName)\*" -Destination "$distFolder\blender"
Remove-Item -Recurse -Force "blender_temp"

# 5. Create Beautiful Launcher Script
Write-Host "`n[4/4] Generating Execution Launcher..." -ForegroundColor Yellow
$launcherContent = @"
@echo off
title RendoFren Secure GPU Render Worker
echo ===================================================
echo RendoFren Secure GPU Render Worker Standalone
echo ===================================================
echo.
echo Launching native Python Engine...

cd /d "%~dp0"
start "" ".\python\pythonw.exe" "RendoFrenWorker.py"
"@
$launcherContent | Out-File -Encoding ascii "$distFolder\Start_RendoFren.bat"

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host " PORTABLE DISTRIBUTION BUILT SUCCESSFULLY!" -ForegroundColor Green
Write-Host " Output Directory: g:\Project\RendoFren\worker\dist\RendoFrenPortable" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
