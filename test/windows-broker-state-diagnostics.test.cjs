const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const taskPath = path.join(__dirname, '..', 'agents', '016_[Ops]_WindowsBrokerReadback', 'host-update');

test('fixed Windows diagnostics are read-only and redact host process arguments', () => {
  const source = fs.readFileSync(path.join(taskPath, 'windows-broker-state-diagnostics.ps1'), 'utf8');
  const workflow = fs.readFileSync(path.join(taskPath, 'windows-broker-state-diagnostics.yml'), 'utf8');
  const runLine = workflow.split(/\r?\n/).indexOf('        run: |');
  const embedded = workflow.split(/\r?\n/).slice(runLine + 1).map((line) => line.startsWith('          ') ? line.slice(10) : line).join('\n').trimEnd();
  assert.equal(embedded.replaceAll('\r\n', '\n'), source.trimEnd().replaceAll('\r\n', '\n'));
  assert.match(source, /lastTaskResult = \$brokerInfo\.LastTaskResult/);
  assert.match(source, /currentUserMatchesPrincipal = \(\$currentSid -eq \$brokerSid\)/);
  assert.match(source, /commandCategoryCounts/);
  assert.match(source, /messageCategory = if \(\$receipt\.message/);
  assert.match(source, /token\|secret\|password\|authorization\|cookie\|credential/);
  assert.match(source, /\$redactNextArg = \$token -notmatch/);
  assert.match(source, /Get-LogFlags/);
  assert.match(source, /startRelationToUpdateReceipt/);
  assert.match(source, /updaterLogs/);
  assert.match(source, /usesWaitSwitch/);
  assert.match(source, /usesPassThru/);
  assert.match(source, /envFileBasenames/);
  assert.match(source, /logBasenames/);
  assert.match(source, /scriptPathMatchesExpected/);
  assert.doesNotMatch(source, /brokerRuntimeProcess = .*argv/);
  assert.doesNotMatch(source, /Unregister-ScheduledTask|Stop-ScheduledTask|Start-ScheduledTask|Restart-Service|Stop-Process|Remove-Item|Set-ItemProperty/);
  assert.doesNotMatch(source, /Write-Output.*\$receipt\.message|Write-Output.*\$process\.CommandLine/);
});
