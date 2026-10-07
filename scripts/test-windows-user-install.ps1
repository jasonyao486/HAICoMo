param([switch]$Child, [string]$TestRoot, [string]$NodePath, [string]$Installer, [string]$Repo)
$ErrorActionPreference = 'Stop'
if (!$IsWindows -or $env:GITHUB_ACTIONS -ne 'true') { throw 'Disposable Windows GitHub runner required' }
if (!$Child) {
  $Repo = (Get-Location).Path
  $version = (Get-Content package.json | ConvertFrom-Json).version
  $Installer = (Get-Item "release/$version/*-setup.exe").FullName
  $NodePath = (Get-Command node).Source
  $TestRoot = Join-Path $env:RUNNER_TEMP 'haicomo-standard-user'
  New-Item -ItemType Directory -Path $TestRoot | Out-Null
  $baseline = 'HAICoMo-0.3.3-windows-x64-setup.exe'
  $baseUrl = 'https://github.com/jasonyao486/HAICoMo/releases/download/v0.3.3'
  Invoke-WebRequest "$baseUrl/$baseline" -OutFile "$TestRoot/previous-setup.exe"
  $manifest = (Invoke-WebRequest "$baseUrl/SHA256SUMS-win32-x64.txt").Content
  if ($manifest -is [byte[]]) { $manifest = [Text.Encoding]::UTF8.GetString($manifest) }
  $expected = (($manifest -split "`n" | Where-Object { $_.Trim().EndsWith($baseline) }) -split '\s+')[0]
  if ((Get-FileHash "$TestRoot/previous-setup.exe" -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'Previous installer checksum mismatch' }
  $guid = (& $NodePath -e "const {UUID}=require('builder-util-runtime');console.log(UUID.v5(require('./package.json').build.appId,UUID.parse('50e065bc-3134-11e6-9bab-38c9862bdaf3')))").Trim()
  $machineKey = "HKLM:\Software\$guid"
  if (Test-Path $machineKey) { throw 'Runner already has machine-wide application state' }
  $machineDirectory = Join-Path $TestRoot 'machine-fixture'
  New-Item -ItemType Directory $machineDirectory | Out-Null
  Set-Content "$machineDirectory/retain.txt" 'Synthetic machine installation'
  $username = 'haicomo-ci'
  $password = ConvertTo-SecureString (([guid]::NewGuid().ToString('N')) + 'aA9!') -AsPlainText -Force
  $account = New-LocalUser -Name $username -Password $password -AccountNeverExpires
  try {
    $usersGroup = Get-LocalGroup -SID 'S-1-5-32-545'
    Add-LocalGroupMember -Group $usersGroup -Member $account
    $sid = $account.SID.Value
    & icacls $TestRoot /grant "*${sid}:(OI)(CI)F" /T /Q | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Unable to grant test output access' }
    & icacls $Repo /grant "*${sid}:(OI)(CI)RX" /T /Q | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Unable to grant test source read access' }
    New-Item $machineKey | Out-Null
    Set-ItemProperty $machineKey InstallLocation $machineDirectory
    $credential = [pscredential]::new("$env:COMPUTERNAME\$username", $password)
    $arguments = @('-NoProfile', '-File', "`"$Repo/scripts/test-windows-user-install.ps1`"", '-Child', '-TestRoot', "`"$TestRoot`"", '-NodePath', "`"$NodePath`"", '-Installer', "`"$Installer`"", '-Repo', "`"$Repo`"")
    $process = Start-Process (Get-Command pwsh).Source -Credential $credential -LoadUserProfile -ArgumentList $arguments -PassThru -RedirectStandardOutput "$TestRoot/stdout.txt" -RedirectStandardError "$TestRoot/stderr.txt"
    if (!$process.WaitForExit(600000)) { Stop-Process -Id $process.Id -Force; throw 'Standard-user test timed out' }
    $process.Refresh()
    $evidence = "validation/$version/standard-user"
    New-Item -ItemType Directory -Force $evidence | Out-Null
    foreach ($name in @('stdout.txt','stderr.txt','result.json','screens','regression','playwright')) {
      if (Test-Path "$TestRoot/$name") { Copy-Item "$TestRoot/$name" $evidence -Recurse -Force }
    }
    if ($process.ExitCode -ne 0) {
      Get-Content "$TestRoot/stderr.txt"
      throw "Standard-user test failed: $($process.ExitCode)"
    }
    $result = Get-Content "$TestRoot/result.json" | ConvertFrom-Json
    if ($result.admin -ne $false -or $result.result -ne 'passed') { throw 'Missing non-admin verification' }
    if ((Get-ItemProperty $machineKey).InstallLocation -ne $machineDirectory -or !(Test-Path "$machineDirectory/retain.txt")) { throw 'Machine installation fixture was changed' }
    Copy-Item "$TestRoot/result.json" "release/$version/windows-user-verification.json"
  } finally {
    if (Test-Path $machineKey) { Remove-Item $machineKey }
    Remove-LocalUser -Name $username
  }
  exit 0
}

Set-Location $Repo
$version = (Get-Content package.json | ConvertFrom-Json).version
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
$admin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if ($admin) { throw 'Test must run under an actual non-administrator token' }
$profile = (Get-ItemProperty "HKLM:\Software\Microsoft\Windows NT\CurrentVersion\ProfileList\$($identity.User.Value)").ProfileImagePath
$env:USERPROFILE = [Environment]::ExpandEnvironmentVariables($profile)
$env:USERNAME = 'haicomo-ci'
$env:APPDATA = Join-Path $env:USERPROFILE 'AppData/Roaming'
$env:LOCALAPPDATA = Join-Path $env:USERPROFILE 'AppData/Local'
$env:TEMP = Join-Path $env:LOCALAPPDATA 'Temp'
$env:TMP = $env:TEMP
New-Item -ItemType Directory -Force $env:TEMP | Out-Null
# A denied protected write proves this is not an elevated test process.
$probe = "HKLM:\Software\HAICoMoDeniedProbe-$([guid]::NewGuid())"
$writeDenied = $false
try { New-Item $probe -ErrorAction Stop | Out-Null } catch { $writeDenied = $true }
if (!$writeDenied) { Remove-Item $probe; throw 'Protected registry write unexpectedly succeeded' }
function Invoke-Installer([string]$File, [string[]]$Arguments) {
  $p = Start-Process -FilePath $File -ArgumentList $Arguments -PassThru -Wait
  if ($p.ExitCode -ne 0) { throw "Installer process failed: $($p.ExitCode)" }
}
$guid = (& $NodePath -e "const {UUID}=require('builder-util-runtime');console.log(UUID.v5(require('./package.json').build.appId,UUID.parse('50e065bc-3134-11e6-9bab-38c9862bdaf3')))").Trim()
function Find-Install {
  # electron-builder includes the version in DisplayName and keeps the location in a separate key.
  $entry = Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$guid"
  if ($entry.DisplayName -notlike 'HAICoMo *') { throw 'Unexpected current-user uninstall registration' }
  $location = (Get-ItemProperty "HKCU:\Software\$guid").InstallLocation
  $entry | Add-Member -NotePropertyName InstallLocation -NotePropertyValue $location -Force
  return $entry
}
Invoke-Installer $Installer @('/S')
$entry = Find-Install
$directory = $entry.InstallLocation
if (!$directory.StartsWith($env:LOCALAPPDATA, [StringComparison]::OrdinalIgnoreCase)) { throw 'Install is outside current-user LocalAppData' }
$executable = Join-Path $directory 'HAICoMo.exe'
if (!(Test-Path $executable)) { throw 'Installed application is missing' }
if (Test-Path (Join-Path $directory 'resources/elevate.exe')) { throw 'Elevation helper must not be shipped' }
if (Test-Path "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$guid") { throw 'Unexpected machine installation' }
if (!(Test-Path 'HKCU:\Software\Classes\.haicomo')) { throw 'Missing user-level project association' }
if (!(Test-Path (Join-Path $env:APPDATA 'Microsoft/Windows/Start Menu/Programs/HAICoMo.lnk'))) { throw 'Missing current-user shortcut' }
$sentinel = Join-Path $env:APPDATA 'haicomo/retain-on-uninstall.txt'
New-Item -ItemType Directory -Force (Split-Path $sentinel) | Out-Null
Set-Content $sentinel 'Synthetic retained settings'
$env:HAICOMO_PACKAGED_EXECUTABLE = $executable
$env:HAICOMO_SCREENSHOT_DIR = Join-Path $TestRoot 'screens'
$env:HAICOMO_EVIDENCE_DIR = Join-Path $TestRoot 'regression'
& $NodePath node_modules/@playwright/test/cli.js test tests/e2e/v031.spec.ts tests/e2e/v032.spec.ts --output="$TestRoot/playwright"
if ($LASTEXITCODE -ne 0) { throw 'Installed application tests failed under standard user' }
Invoke-Installer $Installer @('/S')
if (!(Test-Path $sentinel)) { throw 'Upgrade removed user settings' }
$entry = Find-Install
if ($entry.UninstallString -notmatch '^"([^"\r\n]+)" /currentuser$') { throw 'Unexpected uninstaller command' }
$uninstaller = $Matches[1]
Invoke-Installer $uninstaller @('/S', "_?=$directory")
if (Test-Path $executable) { throw 'Uninstall did not remove executable' }
if (Test-Path $entry.PSPath) { throw 'Uninstall registration was retained' }
if (!(Test-Path $sentinel)) { throw 'Uninstall removed user settings' }
# Exercise an actual previous-version upgrade, not only a same-version reinstall.
Invoke-Installer "$TestRoot/previous-setup.exe" @('/S', '/currentuser')
Invoke-Installer $Installer @('/S')
$entry = Find-Install
if ($entry.DisplayVersion -ne $version -or !(Test-Path $sentinel)) { throw 'Previous-version upgrade failed or removed data' }
if ($entry.UninstallString -notmatch '^"([^"\r\n]+)" /currentuser$') { throw 'Unexpected upgraded uninstaller command' }
Invoke-Installer $Matches[1] @('/S', "_?=$($entry.InstallLocation)")
if (Test-Path (Join-Path $entry.InstallLocation 'HAICoMo.exe')) { throw 'Upgraded application uninstall failed' }
$hash = (Get-FileHash -Algorithm SHA256 $Installer).Hash.ToLowerInvariant()
@{ version = $version; result = 'passed'; admin = $false; protectedWriteDenied = $true; install = $true; launch = $true; reinstall = $true; previousVersionUpgrade = '0.3.3'; uninstall = $true; retainedData = $true; installerSha256 = $hash } | ConvertTo-Json | Set-Content "$TestRoot/result.json"
