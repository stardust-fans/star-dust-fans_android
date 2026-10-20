$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$javaRoot = Join-Path $root 'apps\android\app\src\main\java\com\stardust\fans'
$output = Join-Path ([System.IO.Path]::GetTempPath()) ('stardust-navigation-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $output | Out-Null
try {
    & javac -encoding UTF-8 -d $output (Join-Path $javaRoot 'NavigationPolicy.java') (Join-Path $PSScriptRoot 'NavigationPolicyTest.java')
    if ($LASTEXITCODE -ne 0) { throw 'javac failed' }
    & java -cp $output com.stardust.fans.NavigationPolicyTest
    if ($LASTEXITCODE -ne 0) { throw 'NavigationPolicy tests failed' }
    Write-Output 'NavigationPolicy checks passed.'
} finally {
    Remove-Item -LiteralPath $output -Recurse -Force
}
