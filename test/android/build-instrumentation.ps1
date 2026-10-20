[CmdletBinding()]
param(
    [string]$SdkRoot = '',
    [string]$JavaHome = '',
    [string]$Keystore = '',
    [string]$OutputApk = ''
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if (-not $SdkRoot) {
    $SdkRoot = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } elseif ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } else { Join-Path $repoRoot 'work\android-sdk\sdk' }
}
if (-not $JavaHome) { $JavaHome = $env:JAVA_HOME }
if (-not $Keystore) { $Keystore = Join-Path $repoRoot 'apps\android\keys\debug.keystore' }
if (-not $OutputApk) { $OutputApk = Join-Path $PSScriptRoot 'instrumentation\device-smoke.apk' }

function Resolve-JavaHome {
    if ($JavaHome -and (Test-Path (Join-Path $JavaHome 'bin\java.exe')) -and
            (Test-Path (Join-Path $JavaHome 'bin\javac.exe')) -and
            (Test-Path (Join-Path $JavaHome 'bin\jar.exe'))) { return $JavaHome }
    if ($JavaHome) { throw 'JavaHome must point to a JDK with java, javac, and jar.' }
    $java = Get-Command java.exe -ErrorAction SilentlyContinue
    if ($java) {
        $details = (& $java.Source -XshowSettings:properties -version 2>&1 | Out-String)
        if ($details -match '(?m)^\s*java\.home\s*=\s*(.+?)\s*$') {
            $candidate = $Matches[1].Trim()
            if ((Test-Path (Join-Path $candidate 'bin\javac.exe')) -and
                    (Test-Path (Join-Path $candidate 'bin\jar.exe'))) { return $candidate }
        }
    }
    throw 'JDK not found; pass -JavaHome or set JAVA_HOME.'
}

$JavaHome = Resolve-JavaHome
$Java = Join-Path $JavaHome 'bin\java.exe'
$Javac = Join-Path $JavaHome 'bin\javac.exe'
$Jar = Join-Path $JavaHome 'bin\jar.exe'
if (-not (Test-Path $Keystore)) { throw "Debug keystore not found; pass -Keystore: $Keystore" }
if (-not (Test-Path (Join-Path $SdkRoot 'platforms\android-34\android.jar'))) { throw "Android SDK platform 34 not found under $SdkRoot" }
$androidJar = Join-Path $SdkRoot 'platforms\android-34\android.jar'
$buildTools = Get-ChildItem (Join-Path $SdkRoot 'build-tools') -Directory |
    Where-Object { (Test-Path (Join-Path $_.FullName 'aapt2.exe')) -and
        (Test-Path (Join-Path $_.FullName 'zipalign.exe')) -and
        (Test-Path (Join-Path $_.FullName 'lib\d8.jar')) -and
        (Test-Path (Join-Path $_.FullName 'lib\apksigner.jar')) } |
    Sort-Object { try { [version]$_.Name } catch { [version]'0.0' } } -Descending |
    Select-Object -First 1
if (-not $buildTools) { throw "Complete Android build-tools not found under $SdkRoot" }

$tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\') + '\'
$buildName = 'stardust-device-test-' + [guid]::NewGuid().ToString('N')
$buildDir = [System.IO.Path]::GetFullPath((Join-Path $tempRoot $buildName))
if (-not $buildDir.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
        (Split-Path -Leaf $buildDir) -notmatch '^stardust-device-test-[0-9a-f]{32}$') {
    throw 'Temporary build path failed validation.'
}
New-Item -ItemType Directory -Path $buildDir | Out-Null

try {
    $baseApk = Join-Path $buildDir 'base.apk'
    $genDir = Join-Path $buildDir 'gen'
    $classesDir = Join-Path $buildDir 'classes'
    $dexDir = Join-Path $buildDir 'dex'
    New-Item -ItemType Directory -Path $genDir, $classesDir, $dexDir | Out-Null

    $aapt2 = Join-Path $buildTools.FullName 'aapt2.exe'
    & $aapt2 link -o $baseApk -I $androidJar --manifest (Join-Path $PSScriptRoot 'instrumentation\AndroidManifest.xml') `
        --java $genDir --min-sdk-version 23 --target-sdk-version 34 --version-code 1 --version-name '1.0'
    if ($LASTEXITCODE -ne 0) { throw 'aapt2 link failed.' }

    & $Javac -encoding UTF-8 -source 8 -target 8 -Xlint:-options -classpath $androidJar -d $classesDir `
        (Join-Path $PSScriptRoot 'instrumentation\DeviceSmokeInstrumentation.java')
    if ($LASTEXITCODE -ne 0) { throw 'Instrumentation source compilation failed.' }

    $classesJar = Join-Path $buildDir 'classes.jar'
    & $Jar cf $classesJar -C $classesDir .
    if ($LASTEXITCODE -ne 0) { throw 'Instrumentation classes packaging failed.' }
    & $Java -cp (Join-Path $buildTools.FullName 'lib\d8.jar') com.android.tools.r8.D8 `
        --release --min-api 23 --lib $androidJar --output $dexDir $classesJar
    if ($LASTEXITCODE -ne 0) { throw 'Instrumentation dex generation failed.' }
    & $Jar uf $baseApk -C $dexDir classes.dex
    if ($LASTEXITCODE -ne 0) { throw 'Instrumentation dex packaging failed.' }

    $alignedApk = Join-Path $buildDir 'aligned.apk'
    & (Join-Path $buildTools.FullName 'zipalign.exe') -f -p 4 $baseApk $alignedApk
    if ($LASTEXITCODE -ne 0) { throw 'Instrumentation APK alignment failed.' }
    $signedApk = Join-Path $buildDir 'signed.apk'
    & $Java -jar (Join-Path $buildTools.FullName 'lib\apksigner.jar') sign `
        --ks $Keystore --ks-pass pass:android --ks-key-alias androiddebugkey --key-pass pass:android `
        --out $signedApk $alignedApk
    if ($LASTEXITCODE -ne 0) { throw 'Instrumentation APK signing failed.' }
    & $Java -jar (Join-Path $buildTools.FullName 'lib\apksigner.jar') verify $signedApk
    if ($LASTEXITCODE -ne 0) { throw 'Instrumentation APK signature verification failed.' }

    $destination = [System.IO.Path]::GetFullPath($OutputApk)
    $destinationParent = Split-Path -Parent $destination
    New-Item -ItemType Directory -Force -Path $destinationParent | Out-Null
    Copy-Item -LiteralPath $signedApk -Destination $destination -Force
    Write-Output $destination
} finally {
    $resolvedBuild = [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath $buildDir).Path)
    $resolvedParent = [System.IO.Path]::GetDirectoryName($resolvedBuild).TrimEnd('\') + '\'
    $buildItem = Get-Item -LiteralPath $resolvedBuild -Force
    if (($resolvedBuild -eq $buildDir) -and ($resolvedParent -eq $tempRoot) -and
            ((Split-Path -Leaf $resolvedBuild) -match '^stardust-device-test-[0-9a-f]{32}$') -and
            (($buildItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0)) {
        Remove-Item -LiteralPath $resolvedBuild -Recurse -Force
    } else {
        throw 'Temporary build path changed; refusing cleanup.'
    }
}
