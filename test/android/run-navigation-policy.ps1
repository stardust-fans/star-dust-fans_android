$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$javaRoot = Join-Path $root 'apps\android\app\src\main\java\com\stardust\fans'
$tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\') + '\'
$outputName = 'stardust-navigation-' + [guid]::NewGuid().ToString('N')
$output = [System.IO.Path]::GetFullPath((Join-Path $tempRoot $outputName))
if ((-not $output.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase)) -or
        ((Split-Path -Leaf $output) -notmatch '^stardust-navigation-[0-9a-f]{32}$')) {
    throw 'Temporary test output path failed validation.'
}
New-Item -ItemType Directory -Path $output | Out-Null
try {
    & javac -encoding UTF-8 -d $output (Join-Path $javaRoot 'NavigationPolicy.java') (Join-Path $javaRoot 'CallbackPolicy.java') (Join-Path $PSScriptRoot 'NavigationPolicyTest.java') (Join-Path $PSScriptRoot 'CallbackPolicyTest.java')
    if ($LASTEXITCODE -ne 0) { throw 'javac failed' }
    & java -cp $output com.stardust.fans.NavigationPolicyTest
    if ($LASTEXITCODE -ne 0) { throw 'NavigationPolicy tests failed' }
    & java -cp $output com.stardust.fans.CallbackPolicyTest
    if ($LASTEXITCODE -ne 0) { throw 'CallbackPolicy tests failed' }
    Write-Output 'NavigationPolicy checks passed.'
} finally {
    if (Test-Path -LiteralPath $output -PathType Container) {
        $resolvedOutput = [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath $output).Path)
        $outputParent = [System.IO.Path]::GetDirectoryName($resolvedOutput).TrimEnd('\') + '\'
        $resolvedItem = Get-Item -LiteralPath $resolvedOutput -Force
        if (($resolvedOutput -eq $output) -and ($outputParent -eq $tempRoot) -and
                (($resolvedItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0)) {
            Remove-Item -LiteralPath $resolvedOutput -Recurse -Force
        } else {
            throw 'Temporary test output path changed; refusing cleanup.'
        }
    }
}
