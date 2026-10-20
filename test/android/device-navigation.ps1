param(
    [Parameter(Mandatory)][string]$DeviceSerial,
    [Parameter(Mandatory)][string]$OutputDirectory,
    [string]$Adb = 'adb',
    [int]$NavigationRounds = 3,
    [int]$TeardownRounds = 10
)
$ErrorActionPreference = 'Stop'
$outputRoot = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null
$results = [Collections.Generic.List[object]]::new()

function Invoke-Adb([string[]]$Arguments) {
    $value = & $Adb -s $DeviceSerial @Arguments 2>&1
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        ($value -join "`n") | Set-Content -LiteralPath (Join-Path $outputRoot 'adb-failure.txt') -Encoding utf8
        throw "ADB $($Arguments[0]) exited with code $exitCode; see adb-failure.txt"
    }
    return ($value -join "`n")
}
function Read-Ui([string]$Name) {
    $null = Invoke-Adb @('shell','uiautomator','dump','/data/local/tmp/stardust-smoke.xml')
    $file = Join-Path $outputRoot ($Name + '.xml')
    $null = Invoke-Adb @('pull','/data/local/tmp/stardust-smoke.xml',$file)
    return [xml](Get-Content -LiteralPath $file -Raw)
}
function Tap-Node([string]$XPath, [string]$Name) {
    $document = Read-Ui $Name
    $node = @($document.SelectNodes($XPath) | Where-Object { $_.bounds -ne '[0,0][0,0]' }) | Select-Object -First 1
    if (-not $node -or $node.bounds -notmatch '^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$') { throw "Missing visible control: $Name" }
    $x = [int](([int]$Matches[1] + [int]$Matches[3]) / 2)
    $y = [int](([int]$Matches[2] + [int]$Matches[4]) / 2)
    $null = Invoke-Adb @('shell','input','tap',"$x","$y")
}
function Assert-Alive([string]$Name) {
    $process = Invoke-Adb @('shell','pidof','com.stardust.fans')
    if (-not $process.Trim()) { throw "App exited: $Name" }
}
function Wait-WebTitle([string]$Pattern, [string]$Name) {
    for ($attempt = 0; $attempt -lt 5; $attempt++) {
        $document = Read-Ui ($Name + '-' + $attempt)
        $titles = @($document.SelectNodes('//node[@class="android.webkit.WebView"]') | ForEach-Object { $_.text }) -join ' '
        if ($titles -match $Pattern) {
            Assert-Alive $Name
            $results.Add([pscustomobject]@{ Case = $Name; Passed = $true; Title = $titles })
            Write-Output "PASS $Name"
            return
        }
    }
    throw "Expected web page did not load: $Name"
}

try {
    $null = Invoke-Adb @('shell','am','start','-W','-n','com.stardust.fans/.MainActivity')
    Tap-Node '//node[@resource-id="com.stardust.fans:id/bottom_dock"]/node[@text="视频"]' 'initial-video-tab'
    Wait-WebTitle '视频' 'initial-video'
    $tabs = @(
        @{ Label = '同人'; Title = '同人' },
        @{ Label = '量贩'; Title = '量贩' },
        @{ Label = '论坛'; Title = '登录|论坛' },
        @{ Label = '我的'; Title = '登录|用户中心' },
        @{ Label = '视频'; Title = '视频' }
    )
    for ($round = 1; $round -le $NavigationRounds; $round++) {
        foreach ($tab in $tabs) {
            $name = "tab-$round-$($tab.Label)"
            Tap-Node ('//node[@resource-id="com.stardust.fans:id/bottom_dock"]/node[@text="' + $tab.Label + '"]') $name
            Wait-WebTitle $tab.Title $name
        }
    }
    foreach ($page in @(
        @{ Label = '日报'; Title = '日报' },
        @{ Label = '星图'; Title = '星图' },
        @{ Label = '关于'; Title = '关于' },
        @{ Label = '指南'; Title = '指南' }
    )) {
        Tap-Node '//node[@resource-id="com.stardust.fans:id/top_pages"]' ('menu-' + $page.Label)
        Tap-Node ('//node[@text="' + $page.Label + '"]') ('entry-' + $page.Label)
        Wait-WebTitle $page.Title ('page-' + $page.Label)
    }
    Tap-Node '//node[@resource-id="com.stardust.fans:id/top_search"]' 'open-search'
    Tap-Node '//node[@resource-id="com.stardust.fans:id/search_input"]' 'focus-search'
    $null = Invoke-Adb @('shell','input','text','BV1L1bj6mEtC')
    $null = Invoke-Adb @('shell','input','keyevent','66')
    $searchPassed = $false
    for ($attempt = 0; $attempt -lt 5; $attempt++) {
        $searchUi = Read-Ui ('search-result-' + $attempt)
        if ($searchUi.SelectNodes('//node[@resource-id="com.stardust.fans:id/result_title"]').Count -gt 0) { $searchPassed = $true; break }
    }
    if (-not $searchPassed) { throw 'Native video search did not return a result' }
    $results.Add([pscustomobject]@{ Case='native-video-search'; Passed=$true })
    Write-Output 'PASS native-video-search'
    $null = Invoke-Adb @('shell','input','keyevent','4')
    $null = Invoke-Adb @('shell','am','start','-W','-n','com.stardust.fans/.MainActivity')
    Tap-Node '//node[@resource-id="com.stardust.fans:id/top_settings"]' 'open-settings'
    $settingsUi = Read-Ui 'settings'
    if ($settingsUi.SelectNodes('//node[@package="com.stardust.fans"][@class="android.widget.Switch"]').Count -lt 2) { throw 'Notification settings controls missing' }
    $results.Add([pscustomobject]@{ Case='native-settings'; Passed=$true })
    Write-Output 'PASS native-settings'
    $null = Invoke-Adb @('shell','input','keyevent','4')
    $null = Invoke-Adb @('shell','input','keyevent','3')
    $null = Invoke-Adb @('shell','am','start','-W','-n','com.stardust.fans/.MainActivity')
    Assert-Alive 'background-resume'
    $results.Add([pscustomobject]@{ Case='background-resume'; Passed=$true })
    Write-Output 'PASS background-resume'
    $null = Invoke-Adb @('shell','am','force-stop','com.stardust.fans')
    for ($round = 1; $round -le $TeardownRounds; $round++) {
        $null = Invoke-Adb @('shell','am','start','-W','-n','com.stardust.fans/.MainActivity')
        Assert-Alive "teardown-$round-launch"
        $null = Invoke-Adb @('shell','input','keyevent','4')
    }
    $null = Invoke-Adb @('shell','am','start','-W','-n','com.stardust.fans/.MainActivity')
    Wait-WebTitle '视频' 'teardown-final-relaunch'
    $results.Add([pscustomobject]@{ Case='activity-teardown-rounds'; Passed=$true; Count=$TeardownRounds })
    Write-Output "PASS activity-teardown-rounds: $TeardownRounds"
} catch {
    $results.Add([pscustomobject]@{ Case='execution'; Passed=$false; Error=$_.Exception.Message })
    throw
} finally {
    $results | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $outputRoot 'navigation-results.json') -Encoding utf8
}
