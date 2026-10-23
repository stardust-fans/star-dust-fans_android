const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { spawnSync } = require('node:child_process');

const taskPath = path.join(__dirname, '..', 'agents', '016_[Ops]_WindowsBrokerReadback', 'host-update');

test('fixed Windows diagnostics are read-only and redact host process arguments', () => {
  const source = fs.readFileSync(path.join(taskPath, 'windows-broker-state-diagnostics.ps1'), 'utf8');
  const workflow = fs.readFileSync(path.join(taskPath, 'windows-broker-state-diagnostics.yml'), 'utf8');
  const runLine = workflow.split(/\r?\n/).indexOf('        run: |');
  const embedded = workflow.split(/\r?\n/).slice(runLine + 1).map((line) => line.startsWith('          ') ? line.slice(10) : line).join('\n').trimEnd();
  assert.equal(embedded.replaceAll('\r\n', '\n').replaceAll(/\n +(?=\n)/g, '\n'), source.trimEnd().replaceAll('\r\n', '\n'));
  assert.match(source, /lastTaskResult = \$brokerInfo\.LastTaskResult/);
  assert.match(source, /currentUserMatchesPrincipal = \(\$currentSid -eq \$brokerSid\)/);
  assert.match(source, /commandCategoryCounts/);
  assert.match(source, /messageCategory = if \(\$receipt\.message/);
  assert.match(source, /token\|secret\|password\|authorization\|cookie\|credential/);
  assert.match(source, /\$redactNextArg = \$token -notmatch/);
  assert.match(source, /Get-LogFlags/);
  assert.match(source, /startRelationToUpdateReceipt/);
  assert.match(source, /\[datetimeoffset\]::Parse/);
  assert.match(source, /updaterLogs/);
  assert.match(source, /singleton_lock = 0/);
  assert.match(source, /port_conflict = 0/);
  assert.match(source, /unclassified = 0/);
  assert.match(source, /usesWaitSwitch/);
  assert.match(source, /usesPassThru/);
  assert.match(source, /envFileBasenames/);
  assert.match(source, /logBasenames/);
  assert.match(source, /scriptPathMatchesExpected/);
  assert.doesNotMatch(source, /brokerRuntimeProcess = .*argv/);
  assert.doesNotMatch(source, /Unregister-ScheduledTask|Stop-ScheduledTask|Start-ScheduledTask|Restart-Service|Stop-Process|Remove-Item|Set-ItemProperty/);
  assert.doesNotMatch(source, /Write-Output.*\$receipt\.message|Write-Output.*\$process\.CommandLine/);
});

test('only the previously observed exact broker process exposes its state directory', () => {
  const source = fs.readFileSync(path.join(taskPath, 'windows-broker-state-diagnostics.ps1'), 'utf8');
  assert.match(source, /processId = 97244; startedAtUtc = '2026-10-22T18:07:22\.2329430Z'/);
  assert.match(source, /processId = 98104; startedAtUtc = '2026-10-22T18:07:33\.1104330Z'/);
  assert.match(source, /stateDirectoryIdentityMatchesKnownProcess = \$exactIdentity -and \$validArgv/);
  assert.match(source, /stateDirectory = \$stateDirectory/);
  assert.match(source, /stateDirectoryUniqueAcrossRoots/);
  assert.match(source, /StartsWith\('D:\\GitEdge\\'/);
  assert.match(source, /scriptIndexes\.Count -eq 1/);
  assert.match(source, /stateIndexes\.Count -eq 1/);
  assert.match(source, /stateIndex \+ 1/);
  assert.match(source, /\$expectedNode = 'D:\\GitHubActions\\tools\\node-v24\.22\.0-win-x64\\node\.exe'/);
  assert.match(source, /\$unsafeEntryPoint/);
  assert.match(source, /--experimental-loader/);
  assert.match(source, /argvTokenCount = \$argv\.Count/);
  assert.match(source, /\$argv = Get-SafeArgv \(/);
  assert.doesNotMatch(source, /\$argv = @\(Get-SafeArgv/);
  assert.match(source, /nodeExecutableMatchesExpected = \$nodePathMatches/);
  assert.match(source, /brokerScriptMatchCount = \$scriptIndexes\.Count/);
  assert.match(source, /stateDirectoryFlagCount = \$stateIndexes\.Count/);
  assert.doesNotMatch(source, /argv\.Count -eq 5/);
  assert.doesNotMatch(source, /Write-Output.*CommandLine|argv = \$argv/);
});

test('PowerShell argument tokenizer returns a flat five-token broker argv', (context) => {
  const result = spawnSync('pwsh', ['-NoProfile', '-File', path.join(__dirname, 'windows-broker-state-argv.test.ps1')], { encoding: 'utf8' });
  if (result.error?.code === 'ENOENT') return context.skip('pwsh is unavailable');
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /five broker arguments/);
});
