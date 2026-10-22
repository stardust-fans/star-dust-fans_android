const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const revision = 'f929b6164fe55c0c510485f9869816f482ee8560';
const shortRevision = revision.slice(0, 12);
const workflowPath = path.join(__dirname, '..', 'agents', '016_[Ops]_WindowsBrokerReadback', 'host-update', 'windows-broker-verify-cleanup.yml');

function makeFixture({ missingSecondReceipt = false, receiptStatus = 'success', stderr = '' } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'gitedge-readback-'));
  const roots = ['runner-broker', 'runner-broker-2'].map((name) => path.join(base, name));
  for (let index = 0; index < roots.length; index++) {
    const root = roots[index];
    const ops = path.join(root, 'work', 'ops');
    fs.mkdirSync(ops, { recursive: true });
    if (!(missingSecondReceipt && index === 1)) {
      fs.writeFileSync(path.join(root, 'work', 'broker-update-receipt.json'), JSON.stringify({ status: index === 0 ? receiptStatus : 'success', revision, previous: 'a'.repeat(40), completedAt: '2026-10-22T00:00:00.000Z', message: receiptStatus === 'success' ? undefined : 'secret-marker https://example.invalid/path' }));
    }
    fs.writeFileSync(path.join(ops, `run-broker-update-${shortRevision}-logged-${index + 1}.ps1`), '');
    fs.writeFileSync(path.join(ops, `broker-update-${shortRevision}-logged-${index + 1}.out.log`), 'helper output');
    fs.writeFileSync(path.join(ops, `broker-update-${shortRevision}-logged-${index + 1}.err.log`), stderr);
  }
  return { base, roots };
}

function runReadback(data) {
  const workflow = fs.readFileSync(workflowPath, 'utf8');
  const lines = workflow.split(/\r?\n/);
  const runLine = lines.indexOf('        run: |');
  assert.notEqual(runLine, -1);
  let script = lines.slice(runLine + 1).filter((line) => line.startsWith('          ')).map((line) => line.slice(10)).join('\n');
  script = script
    .replace("'D:\\GitEdge\\runner-broker'", `'${data.roots[0]}'`)
    .replace("'D:\\GitEdge\\runner-broker-2'", `'${data.roots[1]}'`);
  const payload = Buffer.from(JSON.stringify(data)).toString('base64');
  const harness = String.raw`
$ErrorActionPreference = 'Stop'
$fixture = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payload}')) | ConvertFrom-Json
$script:tasks = @{}
$script:unregistered = @()
$script:gitSafeCalls = 0
$script:output = [System.Collections.Generic.List[string]]::new()
$sid = 'S-1-5-21-100-200-300-1001'
function Get-Command { param([string]$Name, $ErrorAction); return [pscustomobject]@{ Source = 'C:\Tools\pwsh.exe' } }
function Get-ScheduledTask { param([string]$TaskName, $ErrorAction); return $script:tasks[$TaskName] }
function Get-ScheduledTaskInfo { param([string]$TaskName, $ErrorAction); return [pscustomobject]@{ LastTaskResult = 0 } }
function Unregister-ScheduledTask { param([string]$TaskName, $Confirm); $script:unregistered += $TaskName }
function git { if ($args[0] -ne '-c' -or $args[1] -notlike 'safe.directory=*') { throw 'Git trust scope missing.' }; $script:gitSafeCalls++; $global:LASTEXITCODE = 0; return '${revision}' }
foreach ($index in 0..1) {
  $root = $fixture.roots[$index]
  $brokerName = if ($index -eq 0) { 'GitEdgeRunnerBroker' } else { 'GitEdgeRunnerBroker-2' }
  $helperName = 'GitEdgeBrokerUpdate-${shortRevision}-' + ($index + 1)
  $wrapper = Join-Path (Join-Path $root 'work\ops') ('run-broker-update-${shortRevision}-logged-' + ($index + 1) + '.ps1')
  $principal = [pscustomobject]@{ UserId = $sid }
  $arguments = '-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $wrapper + '"'
  $script:tasks[$brokerName] = [pscustomobject]@{ State = 'Running'; Principal = $principal; Actions = @() }
  $script:tasks[$helperName] = [pscustomobject]@{ State = 'Ready'; Principal = $principal; Actions = @([pscustomobject]@{ Execute = 'C:\Tools\pwsh.exe'; Arguments = $arguments }) }
}
try {
  & {
${script}
  } 2>&1 | ForEach-Object { $script:output.Add([string]$_) }
} catch { $script:failure = $_.Exception.Message }
[pscustomobject]@{ failure = $script:failure; unregistered = @($script:unregistered); gitSafeCalls = $script:gitSafeCalls; output = @($script:output) } | ConvertTo-Json -Compress -Depth 6
`;
  const harnessPath = path.join(data.base, 'run-readback.ps1');
  fs.writeFileSync(harnessPath, harness, 'utf8');
  const output = execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', harnessPath], { encoding: 'utf8' });
  return JSON.parse(output.trim().split(/\r?\n/).at(-1));
}

test('readback requires both successful receipts before removing either owned task', () => {
  const fixture = makeFixture({ missingSecondReceipt: true });
  try {
    const result = runReadback(fixture);
    assert.match(result.failure, /receipt is missing/);
    assert.deepEqual(result.unregistered, []);
    assert.equal(result.gitSafeCalls, 1);
  } finally { fs.rmSync(fixture.base, { recursive: true, force: true }); }
});

test('readback uses root-scoped Git trust, validates only owned wrappers, and prints sanitized log categories', () => {
  const fixture = makeFixture({ stderr: 'fatal: detected dubious ownership at secret-marker path' });
  try {
    const result = runReadback(fixture);
    assert.equal(result.failure, null);
    assert.equal(result.gitSafeCalls, 2);
    assert.deepEqual(result.unregistered, ['GitEdgeBrokerUpdate-f929b6164fe5-1', 'GitEdgeBrokerUpdate-f929b6164fe5-2']);
    const output = result.output.join('\n');
    assert.match(output, /"BrokerRunning":true/);
    assert.match(output, /"ActualHead":"f929b6164fe55c0c510485f9869816f482ee8560"/);
    assert.match(output, /"StderrCategory":"git_trust"/);
    assert.doesNotMatch(output, /secret-marker|example\.invalid|dubious ownership/);
  } finally { fs.rmSync(fixture.base, { recursive: true, force: true }); }
});

test('failed receipts emit a fixed message category and leave helper tasks intact', () => {
  const fixture = makeFixture({ receiptStatus: 'failure' });
  try {
    const result = runReadback(fixture);
    assert.match(result.failure, /expected successful update/);
    assert.deepEqual(result.unregistered, []);
    const output = result.output.join('\n');
    assert.match(output, /"messageCategory":"other"/);
    assert.doesNotMatch(output, /secret-marker|example\.invalid/);
  } finally { fs.rmSync(fixture.base, { recursive: true, force: true }); }
});
