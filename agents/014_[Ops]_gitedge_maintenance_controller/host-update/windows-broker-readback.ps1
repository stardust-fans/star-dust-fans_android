$ErrorActionPreference = 'Stop'
$revision = '4c94799660f698dc5a65ae933ded9ffda5c4cd79'
$expectedNode = 'D:\GitHubActions\tools\node-v24.22.0-win-x64\node.exe'
$targets = @(
  @{ Root = 'D:\GitEdge\runner-broker'; StateDir = 'D:\GitEdge\runner-state'; BrokerTask = 'GitEdgeRunnerBroker'; Suffix = '1'; PreviousPid = 97244 },
  @{ Root = 'D:\GitEdge\runner-broker-2'; StateDir = 'D:\GitEdge\runner-state-2'; BrokerTask = 'GitEdgeRunnerBroker-2'; Suffix = '2'; PreviousPid = 98104 }
)

function Get-Tokens([string]$line) {
  $items = [System.Collections.Generic.List[string]]::new()
  foreach ($match in [regex]::Matches($line, '"([^"]*)"|(\S+)')) {
    if ($match.Groups[1].Success) { $items.Add($match.Groups[1].Value) } else { $items.Add($match.Groups[2].Value) }
  }
  return ,$items.ToArray()
}

function Test-Broker([object]$process, [hashtable]$target) {
  if ($process.Name -ne 'node.exe' -or -not [string]::Equals([string]$process.ExecutablePath, $expectedNode, [StringComparison]::OrdinalIgnoreCase)) { return $false }
  $tokens = Get-Tokens ([string]$process.CommandLine)
  if ($tokens.Count -lt 5 -or -not [string]::Equals([string]$tokens[0], $expectedNode, [StringComparison]::OrdinalIgnoreCase)) { return $false }
  if (@($tokens | Where-Object { $_ -match '^(?i)(?:-e|--eval|-p|--print|-r|--require|--import|--loader|--experimental-loader)(?:=|$)' }).Count) { return $false }
  $script = Join-Path $target.Root 'scripts\runner-broker.mjs'
  $scriptIndexes = @(for ($i = 1; $i -lt $tokens.Count; $i++) { if ([string]::Equals([string]$tokens[$i], $script, [StringComparison]::OrdinalIgnoreCase)) { $i } })
  $stateIndexes = @(for ($i = 0; $i -lt $tokens.Count; $i++) { if ([string]::Equals([string]$tokens[$i], '--state-dir', [StringComparison]::OrdinalIgnoreCase)) { $i } })
  if ($scriptIndexes.Count -ne 1 -or $stateIndexes.Count -ne 1) { return $false }
  $si = [int]$scriptIndexes[0]; $di = [int]$stateIndexes[0]
  return $si + 1 -lt $tokens.Count -and [string]::Equals([string]$tokens[$si + 1], 'serve', [StringComparison]::OrdinalIgnoreCase) -and $di -gt $si + 1 -and $di + 1 -lt $tokens.Count -and [string]::Equals([string]$tokens[$di + 1], $target.StateDir, [StringComparison]::OrdinalIgnoreCase)
}

foreach ($target in $targets) {
  $root = $target.Root
  $receiptPath = Join-Path $root 'work\broker-update-receipt.json'
  $lockPath = Join-Path $target.StateDir 'active.lock'
  $stderrPath = Join-Path (Join-Path $root 'work\ops') ('broker-update-' + $revision.Substring(0, 12) + '-logged-' + $target.Suffix + '.err.log')
  $helperName = 'GitEdgeBrokerUpdate-f929b6164fe5-' + $target.Suffix
  $report = [ordered]@{ root = $root; stateDir = $target.StateDir; actualHEAD = $null; headExitCode = $null; receiptStatus = $null; receiptRevision = $null; receiptPrevious = $null; receiptCompletedAt = $null; stoppedBrokerPid = $null; receiptBrokerPid = $null; receiptBrokerStartedAt = $null; receiptStableSeconds = $null; failureCategory = $null; brokerTaskState = $null; brokerTaskResult = $null; helperTaskState = $null; helperTaskResult = $null; processCount = 0; processPid = $null; processStartedAt = $null; oldProcessStillPresent = $null; lockExists = $false; lockPid = $null; lockAction = $null; lockStartedAt = $null; lockOwnedByProcess = $false; stderrBusyFlag = $false }
  try {
    $head = @(& git -c "safe.directory=$root" -c 'credential.helper=' -c 'core.askPass=' -C $root rev-parse HEAD 2>&1)
    $report.headExitCode = $LASTEXITCODE
    if ($LASTEXITCODE -eq 0) { $report.actualHEAD = ($head | Out-String).Trim() }
  } catch { $report.headExitCode = -1 }
  try {
    if (Test-Path -LiteralPath $receiptPath -PathType Leaf) {
      $receipt = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json -ErrorAction Stop
      $report.receiptStatus = $receipt.status; $report.receiptRevision = $receipt.revision; $report.receiptPrevious = $receipt.previous
      $report.receiptCompletedAt = $receipt.completedAt; $report.stoppedBrokerPid = $receipt.stoppedBrokerPid
      $report.receiptBrokerPid = $receipt.brokerProcess.pid; $report.receiptBrokerStartedAt = $receipt.brokerProcess.startedAt
      $report.receiptStableSeconds = $receipt.brokerTaskStableSeconds
      $report.failureCategory = $receipt.message
    } else { $report.receiptStatus = 'missing' }
  } catch { $report.receiptStatus = 'invalid' }
  try {
    $info = Get-ScheduledTaskInfo -TaskName $target.BrokerTask -ErrorAction Stop
    $report.brokerTaskState = (Get-ScheduledTask -TaskName $target.BrokerTask).State.ToString(); $report.brokerTaskResult = $info.LastTaskResult
  } catch { $report.brokerTaskState = 'unavailable' }
  try {
    $helperInfo = Get-ScheduledTaskInfo -TaskName $helperName -ErrorAction Stop
    $report.helperTaskState = (Get-ScheduledTask -TaskName $helperName -ErrorAction Stop).State.ToString(); $report.helperTaskResult = $helperInfo.LastTaskResult
  } catch { $report.helperTaskState = 'unavailable' }
  try {
    if (Test-Path -LiteralPath $lockPath -PathType Leaf) {
      $lock = Get-Content -LiteralPath $lockPath -Raw | ConvertFrom-Json -ErrorAction Stop
      $report.lockExists = $true; $report.lockPid = $lock.pid; $report.lockAction = $lock.action; $report.lockStartedAt = $lock.startedAt
    }
  } catch { $report.lockExists = $true; $report.lockAction = 'invalid' }
  try {
    $report.stderrBusyFlag = [bool]((Test-Path -LiteralPath $stderrPath -PathType Leaf) -and (Select-String -LiteralPath $stderrPath -Pattern 'Runner broker state is busy' -Quiet))
  } catch { $report.stderrBusyFlag = $false }
  try {
    $all = @(Get-CimInstance Win32_Process -ErrorAction Stop)
    $matched = [System.Collections.Generic.List[object]]::new()
    foreach ($candidate in $all) { if (Test-Broker $candidate $target) { $matched.Add($candidate) } }
    $report.processCount = $matched.Count
    $expectedPid = if ($report.receiptStatus -eq 'success' -and $report.receiptBrokerPid) { [int]$report.receiptBrokerPid } else { 0 }
    $current = @($matched | Where-Object { ($expectedPid -and [int]$_.ProcessId -eq $expectedPid) -or (-not $expectedPid -and [int]$_.ProcessId -ne $target.PreviousPid) })
    if ($current.Count -eq 1) {
      $report.processPid = [int]$current[0].ProcessId
      $report.processStartedAt = ([datetime]$current[0].CreationDate).ToUniversalTime().ToString('o')
      $report.lockOwnedByProcess = [bool]($report.lockExists -and $report.lockPid -eq $report.processPid -and $report.lockAction -eq 'serve')
    }
    $old = @($matched | Where-Object { [int]$_.ProcessId -eq $target.PreviousPid })
    $report.oldProcessStillPresent = ($old.Count -gt 0)
  } catch { $report.processCount = -1 }
  [Console]::WriteLine(($report | ConvertTo-Json -Compress -Depth 3))
}
