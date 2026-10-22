$ErrorActionPreference = 'Continue'
$revision = 'f929b6164fe55c0c510485f9869816f482ee8560'
$shortRevision = $revision.Substring(0, 12)
$targets = @(
  @{ Root = 'D:\GitEdge\runner-broker'; BrokerTask = 'GitEdgeRunnerBroker'; Suffix = '1' },
  @{ Root = 'D:\GitEdge\runner-broker-2'; BrokerTask = 'GitEdgeRunnerBroker-2'; Suffix = '2' }
)

function Get-MessageCategory([string]$Text) {
  if ($Text -match '(?i)(dubious ownership|safe\.directory)') { return 'git_trust' }
  if ($Text -match '(?i)(cannot find module|module not found|err_module_not_found)') { return 'module_missing' }
  if ($Text -match '(?i)(process.*crash|application error|faulting application)') { return 'process_crash' }
  if ($Text -match '(?i)(active\.lock|lease|lock.*held|did not become idle)') { return 'lease_lock_error' }
  if ($Text -match '(?i)(enoent|no such file or directory)') { return 'enoent' }
  if ($Text -match '(?i)(access is denied|permission denied|unauthorizedaccess)') { return 'permission' }
  if ($Text -match '(?i)(service did not start|service.*not running)') { return 'service_start_failed' }
  if ([string]::IsNullOrWhiteSpace($Text)) { return 'none' }
  return 'other'
}

function Get-Sid([string]$Principal) {
  if ($Principal -match '^S-\d-') { return [System.Security.Principal.SecurityIdentifier]::new($Principal) }
  return ([System.Security.Principal.NTAccount]::new($Principal)).Translate([System.Security.Principal.SecurityIdentifier])
}

function Get-SafeArgv([string]$Arguments) {
  $tokens = @([regex]::Matches($Arguments, '"([^"]*)"|(\S+)') | ForEach-Object {
    if ($_.Groups[1].Success) { $_.Groups[1].Value } else { $_.Groups[2].Value }
  })
  $safe = @()
  $revealNextPath = $false
  $redactRemainder = $false
  $redactNextArg = $false
  foreach ($token in $tokens) {
    if ($redactRemainder) { $safe += '<redacted>'; continue }
    if ($redactNextArg) { $safe += '<redacted>'; $redactNextArg = $false; $revealNextPath = $false; continue }
    if ($token -match '(?i)(token|secret|password|authorization|cookie|credential|https?://)') {
      $safe += '<redacted>'
      $redactNextArg = $token -notmatch '=' -and $token -match '^(?:--?)(?:token|secret|password|authorization|cookie|credential)$'
      $revealNextPath = $false
      continue
    }
    if ($token -in @('-Command', '-EncodedCommand')) { $safe += $token; $redactRemainder = $true; continue }
    if ($revealNextPath) {
      $safe += if ([IO.Path]::IsPathRooted($token)) { $token } else { '<redacted>' }
      $revealNextPath = $false
      continue
    }
    if ($token -in @('-File', '--state-dir', '--config', '-WorkingDirectory', '-RedirectStandardOutput', '-RedirectStandardError')) {
      $safe += $token
      $revealNextPath = $true
    } elseif ($token -in @('-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', 'serve')) {
      $safe += $token
    } elseif ([IO.Path]::IsPathRooted($token)) {
      $safe += $token
    } elseif ($token -match '^(?:--[a-z-]+|-{1,2}[A-Za-z][A-Za-z0-9-]*)$') {
      $safe += $token
    } else {
      $safe += '<redacted>'
    }
  }
  return ,$safe
}

function Get-LogFlags([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return [ordered]@{ present = $false } }
  $counts = [ordered]@{ git_trust = 0; module_missing = 0; process_crash = 0; lease_lock_error = 0; enoent = 0; permission = 0; service_start_failed = 0 }
  foreach ($line in (Get-Content -LiteralPath $Path -Tail 200 -ErrorAction SilentlyContinue)) {
    $category = Get-MessageCategory ([string]$line)
    if ($counts.Contains($category)) { $counts[$category]++ }
  }
  return [ordered]@{ present = $true; categoryCounts = $counts }
}

$reports = @()
foreach ($target in $targets) {
  $helperName = 'GitEdgeBrokerUpdate-' + $shortRevision + '-' + $target.Suffix
  $report = [ordered]@{
    root = $target.Root
    expectedRevision = $revision
    receipt = $null
    git = $null
    brokerTask = $null
    updaterTask = $null
    brokerProcesses = $null
    serviceLogs = $null
  }
  $receiptPath = Join-Path $target.Root 'work\broker-update-receipt.json'
  if (Test-Path -LiteralPath $receiptPath -PathType Leaf) {
    try {
      $receipt = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json -ErrorAction Stop
      $report.receipt = [ordered]@{
        exists = $true
        status = $receipt.status
        revision = $receipt.revision
        previous = $receipt.previous
        completedAt = $receipt.completedAt
        messageCategory = if ($receipt.message -is [string]) { Get-MessageCategory $receipt.message } else { 'none' }
      }
    } catch { $report.receipt = [ordered]@{ exists = $true; parseError = 'invalid_json' } }
  } else { $report.receipt = [ordered]@{ exists = $false } }

  $headOutput = @(& git -c "safe.directory=$($target.Root)" -C $target.Root rev-parse HEAD 2>$null)
  $headExitCode = $LASTEXITCODE
  $statusOutput = @(& git -c "safe.directory=$($target.Root)" -C $target.Root status --porcelain --untracked-files=no 2>$null)
  $statusExitCode = $LASTEXITCODE
  $report.git = [ordered]@{
    headExitCode = $headExitCode
    head = if ($headExitCode -eq 0) { ($headOutput | Out-String).Trim() } else { $null }
    statusExitCode = $statusExitCode
    trackedChangedFileCount = if ($statusExitCode -eq 0) { @($statusOutput).Count } else { $null }
  }

  try {
    $broker = Get-ScheduledTask -TaskName $target.BrokerTask -ErrorAction Stop
    $brokerInfo = Get-ScheduledTaskInfo -TaskName $target.BrokerTask -ErrorAction Stop
    $currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $brokerSid = Get-Sid ([string]$broker.Principal.UserId)
    $actions = @($broker.Actions | ForEach-Object {
      [ordered]@{ executePath = $_.Execute; argv = Get-SafeArgv ([string]$_.Arguments) }
    })
    $report.brokerTask = [ordered]@{
      state = $broker.State.ToString()
      lastTaskResult = $brokerInfo.LastTaskResult
      lastRunTime = $brokerInfo.LastRunTime
      currentUserMatchesPrincipal = ($currentSid -eq $brokerSid)
      actions = $actions
    }
  } catch { $report.brokerTask = [ordered]@{ available = $false; category = 'task_query_failed' } }

  try {
    $helper = Get-ScheduledTask -TaskName $helperName -ErrorAction Stop
    $helperInfo = Get-ScheduledTaskInfo -TaskName $helperName -ErrorAction Stop
    $report.updaterTask = [ordered]@{
      state = $helper.State.ToString()
      lastTaskResult = $helperInfo.LastTaskResult
      lastRunTime = $helperInfo.LastRunTime
      actions = @($helper.Actions | ForEach-Object { [ordered]@{ executePath = $_.Execute; argv = Get-SafeArgv ([string]$_.Arguments) } })
    }
  } catch { $report.updaterTask = [ordered]@{ available = $false; category = 'task_query_failed' } }

  try {
    $categoryCounts = [ordered]@{ broker_runtime = 0; node_other = 0; powershell = 0; git = 0; other = 0 }
    $rootPattern = [regex]::Escape($target.Root.TrimEnd('\')) + '(?:\\|"|\s|$)'
    $processes = @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {
      ([string]$_.ExecutablePath).Equals($target.Root, [StringComparison]::OrdinalIgnoreCase) -or
      ([string]$_.ExecutablePath).StartsWith(($target.Root.TrimEnd('\') + '\'), [StringComparison]::OrdinalIgnoreCase) -or
      ([string]$_.CommandLine) -match $rootPattern
    })
    $counts = [ordered]@{}
    foreach ($process in $processes) {
      $name = [IO.Path]::GetFileName([string]$process.ExecutablePath)
      if (-not $name) { $name = [string]$process.Name }
      if (-not $counts.Contains($name)) { $counts[$name] = 0 }
      $counts[$name]++
      $category = if ([string]$process.CommandLine -match '(?i)runner-broker\.mjs') { 'broker_runtime' }
        elseif ($name -match '(?i)^node(?:\.exe)?$') { 'node_other' }
        elseif ($name -match '(?i)^pwsh(?:\.exe)?$|^powershell(?:\.exe)?$') { 'powershell' }
        elseif ($name -match '(?i)^git(?:\.exe)?$') { 'git' }
        else { 'other' }
      $categoryCounts[$category]++
    }
    $report.brokerProcesses = [ordered]@{ count = $processes.Count; imageCounts = $counts; commandCategoryCounts = $categoryCounts }
  } catch { $report.brokerProcesses = [ordered]@{ available = $false; category = 'process_query_failed' } }

  $logDir = Join-Path $target.Root 'work\logs'
  $report.serviceLogs = [ordered]@{
    stdout = Get-LogFlags (Join-Path $logDir 'runner-broker.out.log')
    stderr = Get-LogFlags (Join-Path $logDir 'runner-broker.err.log')
  }
  $reports += [pscustomobject]$report
}
$reports | ConvertTo-Json -Depth 8
