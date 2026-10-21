# Budowa i podpisanie pakietów Androida (TWA, 2026-10-21): to samo, co robi `bubblewrap build`, ale bez Bubblewrap
# (z Git Bash nie znajduje gradlew.bat). Wynik: app-release-signed.apk (telefon, bez sklepu) i app-release-bundle.aab
# (Google Play). Hasła z keystore.local.json (poza gitem). Użycie: powershell -File android\build.ps1 [-SkipGradle]
param([switch]$SkipGradle)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-17.0.7.7-hotspot'
$env:ANDROID_HOME = "$env:USERPROFILE\android-sdk"
$buildTools = Join-Path $env:ANDROID_HOME 'build-tools\36.1.0'
$keys = Get-Content keystore.local.json | ConvertFrom-Json

if (-not $SkipGradle) {
  .\gradlew.bat assembleRelease bundleRelease --no-daemon
  if ($LASTEXITCODE -ne 0) { throw "gradle: kod $LASTEXITCODE" }
}

# APK: zipalign + apksigner (podpis v1–v3)
$unsigned = 'app\build\outputs\apk\release\app-release-unsigned.apk'
& "$buildTools\zipalign.exe" -f -v 4 $unsigned 'app-release-aligned.apk' | Out-Null
& "$buildTools\apksigner.bat" sign --ks android.keystore --ks-key-alias $keys.alias --ks-pass "pass:$($keys.storePassword)" --key-pass "pass:$($keys.keyPassword)" --out 'app-release-signed.apk' 'app-release-aligned.apk'
Remove-Item 'app-release-aligned.apk'
& "$buildTools\apksigner.bat" verify --print-certs 'app-release-signed.apk' | Select-String 'SHA-256'

# AAB: jarsigner (Play podpisuje potem własnym kluczem)
& "$env:JAVA_HOME\bin\jarsigner.exe" -keystore android.keystore -storepass $keys.storePassword -keypass $keys.keyPassword -signedjar 'app-release-bundle.aab' 'app\build\outputs\bundle\release\app-release.aab' $keys.alias | Select-Object -Last 1
Get-ChildItem 'app-release-signed.apk', 'app-release-bundle.aab' | Select-Object Name, Length
