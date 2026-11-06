# EUNOCURA mobile delivery chain.
#
# One command from source to a running app on the emulator (or a USB phone):
#
#   .\tools\mobile.ps1                 # build web + apk, install, launch
#   .\tools\mobile.ps1 -SkipBuild      # reuse the last APK, reinstall only
#   .\tools\mobile.ps1 -Screenshot patient-home
#
# Every step fails loudly: a stale APK that "installed fine" is worse than a red
# build, because you end up reviewing a screen that is not in the repo.

param(
    [switch]$SkipBuild,
    [switch]$SkipInstall,
    [string]$Screenshot,
    [string]$Apk = "",
    [string]$Device = ""
)

$ErrorActionPreference = "Stop"
$frontend = Split-Path -Parent $PSScriptRoot
$sdk = "$env:LOCALAPPDATA\Android\Sdk"
$adb = Join-Path $sdk "platform-tools\adb.exe"
$outDir = Join-Path $PSScriptRoot "..\..\work\mobile-shots"

function Step($message) {
    Write-Host ""
    Write-Host "== $message" -ForegroundColor Cyan
}

if (-not $Device) {
    $devices = & $adb devices | Select-String "device$" | ForEach-Object { ($_ -split "\s+")[0] }
    if (-not $devices) { throw "No adb device. Start the emulator (zxt_api34) or plug the phone in." }
    $Device = $devices[0]
}
Write-Host "device: $Device"

if (-not $Apk) { $Apk = Join-Path $frontend "android\app\build\outputs\apk\release\app-release.apk" }

if (-not $SkipBuild) {
    Step "web build"
    Push-Location $frontend
    npm run build
    if ($LASTEXITCODE -ne 0) { Pop-Location; throw "vite build failed" }

    Step "cap sync"
    npx cap sync android
    if ($LASTEXITCODE -ne 0) { Pop-Location; throw "cap sync failed" }

    Step "gradle assembleRelease"
    Push-Location (Join-Path $frontend "android")
    & .\gradlew.bat assembleRelease --console=plain
    $code = $LASTEXITCODE
    Pop-Location
    Pop-Location
    if ($code -ne 0) { throw "gradle failed (exit $code)" }
}

if (-not (Test-Path $Apk)) { throw "APK not found at $Apk" }
Write-Host ("apk: {0} ({1:N1} MB)" -f $Apk, ((Get-Item $Apk).Length / 1MB))

if (-not $SkipInstall) {
    Step "install"
    & $adb -s $Device install -r $Apk
    if ($LASTEXITCODE -ne 0) { throw "adb install failed" }

    Step "launch"
    & $adb -s $Device shell am force-stop dev.eunocura.app
    & $adb -s $Device shell am start -n dev.eunocura.app/.MainActivity
    # The splash holds for ~0.9s and the bundle boots under it.
    Start-Sleep -Seconds 4
}

if ($Screenshot) {
    Step "screenshot: $Screenshot"
    New-Item -ItemType Directory -Force -Path $outDir | Out-Null
    $target = Join-Path $outDir "$Screenshot.png"
    # PowerShell's `>` writes UTF-16 and corrupts a PNG, so capture on the device
    # and pull the bytes back.
    & $adb -s $Device shell screencap -p /sdcard/eunocura-shot.png
    & $adb -s $Device pull /sdcard/eunocura-shot.png $target | Out-Null
    Write-Host "saved $target"
}

Write-Host ""
Write-Host "done" -ForegroundColor Green
