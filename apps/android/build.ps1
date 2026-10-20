<#
.SYNOPSIS
    星尘粉丝站 Android 客户端 —— 一键构建（不依赖 Gradle / Android Studio）

.DESCRIPTION
    流程：aapt2 compile -> aapt2 link -> javac -> d8 -> 塞入 classes.dex
           -> zipalign -> apksigner 签名 -> 输出 out\star-dust-mobile.apk

    SDK 定位顺序：$env:ANDROID_HOME -> $env:ANDROID_SDK_ROOT
                 -> Android Studio 默认目录 -> 本项目 sdk\
    若都找不到需要的组件，会自动下载 build-tools 34 与 platforms;android-34。

    注意：Windows 上的 aapt2/zipalign 会把命令行参数按 UTF-8 解析，
    路径里一旦有中文就会"找不到目录"。脚本会自动用 subst 映射一个
    纯 ASCII 盘符来构建，结束后自动解除映射。

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File build.ps1
    powershell -ExecutionPolicy Bypass -File build.ps1 -Clean
#>
[CmdletBinding()]
param(
    [switch]$Clean,
    [string]$Proxy = '',
    [switch]$NoSdkDownload
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# 兼容三种启动方式：文件运行 / dot-source / Invoke-Expression
if ($PSScriptRoot) {
    $RealRoot = $PSScriptRoot
} elseif ($MyInvocation.MyCommand.Path) {
    $RealRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
} else {
    $RealRoot = (Get-Location).Path
}
if (-not (Test-Path -LiteralPath (Join-Path $RealRoot 'app\src\main\AndroidManifest.xml'))) {
    throw 'Run this script from the apps/android project; the resolved path is not a valid Android project root.'
}

$Package     = 'com.stardust.fans'
$MinSdk      = 23
$TargetSdk   = 34
$VersionCode = 6
$VersionName = '1.3.0'
$ApkName     = 'star-dust-mobile.apk'

$BuildToolsUrl = 'https://dl.google.com/android/repository/build-tools_r36_windows.zip'
$PlatformUrl   = 'https://dl.google.com/android/repository/platform-34-ext7_r03.zip'

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host "=== $Message ===" -ForegroundColor Cyan
}

function Write-Ok([string]$Message) {
    Write-Host "  OK  $Message" -ForegroundColor Green
}

# ---------------------------------------------------------------- 中文路径处理

# aapt2 / zipalign 是原生程序，含中文的路径会解析失败；用 subst 映射纯 ASCII 盘符
function Enable-AsciiRoot([string]$Path) {
    if ($Path -match '^[\x20-\x7E]+$') {
        return [pscustomobject]@{ Path = $Path; Drive = $null }
    }
    foreach ($letter in @('Z', 'Y', 'X', 'W', 'V', 'U', 'T', 'S')) {
        $drive = "${letter}:"
        if (Test-Path "$drive\") { continue }
        & subst.exe $drive $Path 2>$null
        if ($LASTEXITCODE -eq 0 -and (Test-Path "$drive\")) {
            return [pscustomobject]@{ Path = "$drive\"; Drive = $drive }
        }
    }
    throw '项目路径包含非 ASCII 字符，且无法分配 subst 盘符；请把项目移到纯英文路径后重试'
}

function Disable-AsciiRoot([string]$Drive) {
    if ($Drive) {
        & subst.exe $Drive /D 2>$null | Out-Null
    }
}

# ---------------------------------------------------------------- SDK 定位

function Get-JavaHome {
    if (($env:JAVA_HOME) -and (Test-Path (Join-Path $env:JAVA_HOME 'bin\java.exe')) -and
            (Test-Path (Join-Path $env:JAVA_HOME 'bin\javac.exe'))) {
        return $env:JAVA_HOME
    }
    if ($env:JAVA_HOME) {
        throw 'JAVA_HOME does not point to a JDK containing bin\javac.exe'
    }
    $java = Get-Command java.exe -ErrorAction SilentlyContinue
    if ($java) {
        $details = (& $java.Source -XshowSettings:properties -version 2>&1 | Out-String)
        if ($LASTEXITCODE -eq 0 -and $details -match '(?m)^\s*java\.home\s*=\s*(.+?)\s*$') {
            $candidate = $Matches[1].Trim()
            if ((Test-Path (Join-Path $candidate 'bin\java.exe')) -and
                    (Test-Path (Join-Path $candidate 'bin\javac.exe'))) {
                return $candidate
            }
        }
    }
    $javac = Get-Command javac.exe -ErrorAction SilentlyContinue
    if ($javac) {
        $candidate = Split-Path -Parent (Split-Path -Parent $javac.Source)
        if ((Test-Path (Join-Path $candidate 'bin\java.exe')) -and
                (Test-Path (Join-Path $candidate 'bin\javac.exe'))) {
            return $candidate
        }
    }
    throw '找不到 JDK（需要 JAVA_HOME 或 PATH 里有 javac）'
}

function Find-PlatformJar([string]$SdkRoot) {
    if (-not $SdkRoot) { return $null }
    $platformsDir = Join-Path $SdkRoot 'platforms'
    if (-not (Test-Path $platformsDir)) { return $null }
    $best = $null
    $bestApi = -1
    foreach ($dir in Get-ChildItem $platformsDir -Directory) {
        if ($dir.Name -notmatch '^android-(\d+)') { continue }
        $api = [int]$Matches[1]
        $jar = Join-Path $dir.FullName 'android.jar'
        if ((Test-Path $jar) -and ($api -ge $TargetSdk) -and ($api -gt $bestApi)) {
            $best = $jar
            $bestApi = $api
        }
    }
    return $best
}

function Find-BuildTools([string]$SdkRoot) {
    if (-not $SdkRoot) { return $null }
    $btDir = Join-Path $SdkRoot 'build-tools'
    if (-not (Test-Path $btDir)) { return $null }
    $best = $null
    $bestVer = ''
    foreach ($dir in Get-ChildItem $btDir -Directory) {
        $aapt2 = Join-Path $dir.FullName 'aapt2.exe'
        $zip = Join-Path $dir.FullName 'zipalign.exe'
        $sign = Join-Path $dir.FullName 'lib\apksigner.jar'
        $d8 = Join-Path $dir.FullName 'lib\d8.jar'
        if ((Test-Path $aapt2) -and (Test-Path $zip) -and (Test-Path $sign) -and (Test-Path $d8)) {
            if ($dir.Name -gt $bestVer) {
                $best = $dir.FullName
                $bestVer = $dir.Name
            }
        }
    }
    return $best
}

function Resolve-Sdk([string]$LocalSdk) {
    $candidates = @()
    if ($env:ANDROID_HOME) { $candidates += $env:ANDROID_HOME }
    if ($env:ANDROID_SDK_ROOT) { $candidates += $env:ANDROID_SDK_ROOT }
    $candidates += (Join-Path $env:LOCALAPPDATA 'Android\Sdk')
    $candidates += $LocalSdk

    foreach ($candidate in $candidates) {
        if (-not $candidate) { continue }
        if (-not (Test-Path $candidate)) { continue }
        $jar = Find-PlatformJar $candidate
        $bt = Find-BuildTools $candidate
        if ($jar -and $bt) {
            return [pscustomobject]@{ Root = $candidate; AndroidJar = $jar; BuildTools = $bt }
        }
    }
    return $null
}

function Invoke-Download([string]$Url, [string]$Destination) {
    Write-Host "  下载 $Url"
    if ($Proxy) {
        Invoke-WebRequest -Uri $Url -OutFile $Destination -Proxy $Proxy -UseBasicParsing
    } else {
        Invoke-WebRequest -Uri $Url -OutFile $Destination -UseBasicParsing
    }
}

function Assert-WorkspacePath([string]$Candidate, [string]$WorkspaceRoot) {
    $rootPath = [System.IO.Path]::GetFullPath($WorkspaceRoot).TrimEnd('\') + '\'
    $candidatePath = [System.IO.Path]::GetFullPath($Candidate)
    if (-not $candidatePath.StartsWith($rootPath, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing filesystem operation outside the Android project: $candidatePath"
    }
    if (Test-Path -LiteralPath $candidatePath) {
        $item = Get-Item -LiteralPath $candidatePath -Force
        if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw "Refusing filesystem operation through a reparse point: $candidatePath"
        }
    }
}

function Expand-Zip([string]$ZipPath, [string]$Destination) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem | Out-Null
    Assert-WorkspacePath $Destination $Root
    if (Test-Path $Destination) { Remove-Item -LiteralPath $Destination -Recurse -Force }
    [System.IO.Compression.ZipFile]::ExtractToDirectory($ZipPath, $Destination)
}

function Install-Sdk([string]$LocalSdk) {
    if ($NoSdkDownload) {
        throw '未找到可用的 Android SDK，且指定了 -NoSdkDownload。请安装 Android Studio 或去掉该参数。'
    }
    Write-Step "下载 Android SDK 组件（约 120MB，代理 $Proxy）"
    New-Item -ItemType Directory -Force -Path $LocalSdk | Out-Null
    $dlDir = Join-Path $LocalSdk '_downloads'
    New-Item -ItemType Directory -Force -Path $dlDir | Out-Null

    $btZip = Join-Path $dlDir 'build-tools_r36_windows.zip'
    if (-not (Test-Path $btZip)) { Invoke-Download $BuildToolsUrl $btZip }
    $platZip = Join-Path $dlDir 'platform-34-ext7_r03.zip'
    if (-not (Test-Path $platZip)) { Invoke-Download $PlatformUrl $platZip }

    $btTmp = Join-Path $dlDir 'bt_tmp'
    Expand-Zip $btZip $btTmp
    $aapt2 = Get-ChildItem $btTmp -Recurse -Filter 'aapt2.exe' | Select-Object -First 1
    if (-not $aapt2) { throw 'build-tools 包里没找到 aapt2.exe' }
    $btOut = Join-Path $LocalSdk 'build-tools\36.0.0'
    Assert-WorkspacePath $aapt2.Directory.FullName $Root
    Assert-WorkspacePath $btOut $Root
    New-Item -ItemType Directory -Force -Path (Split-Path $btOut -Parent) | Out-Null
    if (Test-Path $btOut) { Remove-Item -LiteralPath $btOut -Recurse -Force }
    Move-Item $aapt2.Directory.FullName $btOut
    Write-Ok "build-tools -> $btOut"

    $platTmp = Join-Path $dlDir 'plat_tmp'
    Expand-Zip $platZip $platTmp
    $androidJar = Get-ChildItem $platTmp -Recurse -Filter 'android.jar' | Select-Object -First 1
    if (-not $androidJar) { throw 'platform 包里没找到 android.jar' }
    $platOut = Join-Path $LocalSdk 'platforms\android-34'
    Assert-WorkspacePath $androidJar.Directory.FullName $Root
    Assert-WorkspacePath $platOut $Root
    New-Item -ItemType Directory -Force -Path (Split-Path $platOut -Parent) | Out-Null
    if (Test-Path $platOut) { Remove-Item -LiteralPath $platOut -Recurse -Force }
    Move-Item $androidJar.Directory.FullName $platOut
    Write-Ok "platform -> $platOut"

    Assert-WorkspacePath $btTmp $Root
    Assert-WorkspacePath $platTmp $Root
    Remove-Item -LiteralPath $btTmp, $platTmp -Recurse -Force -ErrorAction SilentlyContinue
}

# ---------------------------------------------------------------- 主流程

$ascii = Enable-AsciiRoot $RealRoot
$Root = $ascii.Path
try {
    if ($ascii.Drive) {
        Write-Step "路径包含中文，已映射 $($ascii.Drive) -> $RealRoot"
    }

    $AppDir = Join-Path $Root 'app'
    $SrcDir = Join-Path $AppDir 'src\main'
    $JavaDir = Join-Path $SrcDir 'java'
    $ResDir = Join-Path $SrcDir 'res'
    $Manifest = Join-Path $SrcDir 'AndroidManifest.xml'
    $BuildDir = Join-Path $Root 'build'
    $OutDir = Join-Path $Root 'out'
    $KeysDir = Join-Path $Root 'keys'
    $LocalSdk = Join-Path $Root 'sdk'

    Assert-WorkspacePath $BuildDir $Root
    Assert-WorkspacePath $OutDir $Root
    Assert-WorkspacePath $KeysDir $Root
    Assert-WorkspacePath $LocalSdk $Root

    Write-Step '环境检查'
    $JavaHome = Get-JavaHome
    $Java = Join-Path $JavaHome 'bin\java.exe'
    $Javac = Join-Path $JavaHome 'bin\javac.exe'
    $Jar = Join-Path $JavaHome 'bin\jar.exe'
    $KeyTool = Join-Path $JavaHome 'bin\keytool.exe'
    Write-Ok "JDK: $JavaHome"

    $sdk = Resolve-Sdk $LocalSdk
    if (-not $sdk) {
        Write-Host '  未找到包含 android-34 与 build-tools 的 SDK，准备下载' -ForegroundColor Yellow
        Install-Sdk $LocalSdk
        $sdk = Resolve-Sdk $LocalSdk
    }
    if (-not $sdk) { throw 'SDK 安装后仍无法定位，请检查目录布局' }
    Write-Ok "SDK: $($sdk.Root)"
    Write-Ok "android.jar: $($sdk.AndroidJar)"
    Write-Ok "build-tools: $($sdk.BuildTools)"

    $Aapt2 = Join-Path $sdk.BuildTools 'aapt2.exe'
    $ZipAlign = Join-Path $sdk.BuildTools 'zipalign.exe'
    $D8Jar = Join-Path $sdk.BuildTools 'lib\d8.jar'
    $SignerJar = Join-Path $sdk.BuildTools 'lib\apksigner.jar'

    if (Test-Path $BuildDir) {   # 始终清理，避免上次编译的旧 class 被一起打进 dex
        Remove-Item -LiteralPath $BuildDir -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $BuildDir, $OutDir, $KeysDir | Out-Null

    Write-Step '生成带 package 的 Manifest（AGP 式工程不带 package，aapt2 需要）'
    $manifestRaw = [System.IO.File]::ReadAllText($Manifest, [System.Text.Encoding]::UTF8)
    $needle = '<manifest xmlns:android="http://schemas.android.com/apk/res/android">'
    $replacement = '<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="' + $Package + '">'
    $stamped = $manifestRaw.Replace($needle, $replacement)
    if ($stamped -eq $manifestRaw) { throw '未能向 Manifest 注入 package 属性' }
    $stampedManifest = Join-Path $BuildDir 'AndroidManifest.xml'
    [System.IO.File]::WriteAllText($stampedManifest, $stamped, (New-Object System.Text.UTF8Encoding($false)))
    Write-Ok $stampedManifest

    Write-Step 'aapt2 compile（编译资源）'
    $resZip = Join-Path $BuildDir 'res.zip'
    & $Aapt2 compile --dir $ResDir -o $resZip
    if ($LASTEXITCODE -ne 0) { throw 'aapt2 compile 失败' }
    Write-Ok $resZip

    Write-Step 'aapt2 link（链接资源 + 生成 R.java）'
    $baseApk = Join-Path $BuildDir 'base.apk'
    $genDir = Join-Path $BuildDir 'gen'
    New-Item -ItemType Directory -Force -Path $genDir | Out-Null
    $ContractDir = [System.IO.Path]::GetFullPath((Join-Path $RealRoot '..\..\packages\site-contract'))
    if (-not (Test-Path (Join-Path $ContractDir 'site.json'))) { throw 'Shared site contract is missing' }
    & $Aapt2 link -o $baseApk -I $sdk.AndroidJar --manifest $stampedManifest --java $genDir --min-sdk-version $MinSdk --target-sdk-version $TargetSdk --version-code $VersionCode --version-name $VersionName -A $ContractDir $resZip
    if ($LASTEXITCODE -ne 0) { throw 'aapt2 link 失败' }
    Write-Ok $baseApk

    Write-Step 'javac（编译 Java 源码 + R.java）'
    $classesDir = Join-Path $BuildDir 'classes'
    New-Item -ItemType Directory -Force -Path $classesDir | Out-Null
    $sources = @()
    $sources += (Get-ChildItem $JavaDir -Recurse -Filter *.java | ForEach-Object { $_.FullName })
    $sources += (Get-ChildItem $genDir -Recurse -Filter R.java | ForEach-Object { $_.FullName })
    & $Javac -encoding UTF-8 -source 8 -target 8 -classpath $sdk.AndroidJar -Xlint:-options -d $classesDir $sources
    if ($LASTEXITCODE -ne 0) { throw 'javac 编译失败' }
    Write-Ok "$($sources.Count) 个源文件"

    Write-Step 'd8（转成 classes.dex）'
    $classesJar = Join-Path $BuildDir 'classes.jar'
    & $Jar cf $classesJar -C $classesDir .
    if ($LASTEXITCODE -ne 0) { throw '打包 classes.jar 失败' }
    $dexDir = Join-Path $BuildDir 'dex'
    New-Item -ItemType Directory -Force -Path $dexDir | Out-Null
    & $Java -Xmx1536m -cp $D8Jar com.android.tools.r8.D8 --release --min-api $MinSdk --lib $sdk.AndroidJar --output $dexDir $classesJar
    if ($LASTEXITCODE -ne 0) { throw 'd8 转换失败' }
    Write-Ok (Join-Path $dexDir 'classes.dex')

    Write-Step '把 classes.dex 放进 APK'
    & $Jar uf $baseApk -C $dexDir classes.dex
    if ($LASTEXITCODE -ne 0) { throw '写入 classes.dex 失败' }
    Write-Ok 'classes.dex 已加入'

    Write-Step 'zipalign（4 字节对齐）'
    $alignedApk = Join-Path $BuildDir 'aligned.apk'
    & $ZipAlign -f -p 4 $baseApk $alignedApk
    if ($LASTEXITCODE -ne 0) { throw 'zipalign 失败' }
    Write-Ok $alignedApk

    Write-Step '签名'
    $keystore = Join-Path $KeysDir 'debug.keystore'
    if (-not (Test-Path $keystore)) {
        & $KeyTool -genkeypair -keystore $keystore -alias androiddebugkey -storepass android -keypass android -keyalg RSA -keysize 2048 -validity 10000 -dname 'CN=StarDust Debug,O=StarDust,C=CN'
        if ($LASTEXITCODE -ne 0) { throw '生成 keystore 失败' }
        Write-Ok "已生成 $keystore"
    }
    $finalApk = Join-Path $OutDir $ApkName
    & $Java -jar $SignerJar sign --ks $keystore --ks-pass pass:android --key-pass pass:android --ks-key-alias androiddebugkey --v1-signing-enabled true --v2-signing-enabled true --out $finalApk $alignedApk
    if ($LASTEXITCODE -ne 0) { throw 'apksigner 签名失败' }
    Write-Ok $finalApk

    Write-Step '自检：aapt2 dump badging'
    & $Aapt2 dump badging $finalApk | Select-Object -First 10

    Write-Step '自检：apksigner verify'
    & $Java -jar $SignerJar verify -v $finalApk | Select-Object -First 8

    $sizeKb = [math]::Round((Get-Item $finalApk).Length / 1KB, 1)
    $realApk = Join-Path $RealRoot ('out\' + $ApkName)
    Write-Host ""
    Write-Host "构建完成：$realApk  ($sizeKb KB)" -ForegroundColor Green
    Write-Host "安装：adb install -r `"$realApk`"" -ForegroundColor Green
}
finally {
    Disable-AsciiRoot $ascii.Drive
}
