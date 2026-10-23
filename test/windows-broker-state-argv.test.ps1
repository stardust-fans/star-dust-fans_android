$ErrorActionPreference = 'Stop'
$sourcePath = Join-Path $PSScriptRoot '..\agents\016_[Ops]_WindowsBrokerReadback\host-update\windows-broker-state-diagnostics.ps1'
$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($sourcePath, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw 'Diagnostic script failed to parse.' }
$definition = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Get-SafeArgv' }, $true)
if (-not $definition) { throw 'Argument tokenizer was not found.' }
Invoke-Expression $definition.Extent.Text
$argv = Get-SafeArgv 'D:\GitHubActions\tools\node-v24.22.0-win-x64\node.exe "D:\GitEdge\runner-broker\scripts\runner-broker.mjs" serve --state-dir "D:\GitEdge\runner-state"'
if ($argv.Count -ne 5 -or $argv[1] -ne 'D:\GitEdge\runner-broker\scripts\runner-broker.mjs' -or $argv[4] -ne 'D:\GitEdge\runner-state') {
  throw 'Argument tokenizer did not return the expected flat broker argv.'
}
Write-Output 'PowerShell tokenizer returned five broker arguments.'
