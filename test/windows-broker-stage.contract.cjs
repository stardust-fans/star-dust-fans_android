const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const audit = path.join(__dirname, '..', 'agents', '014_[Ops]_gitedge_maintenance_controller', 'host-update');
const scriptPath = path.join(audit, 'windows-broker-stage.ps1');
const workflowPath = path.join(audit, 'windows-broker-stage.yml');
const revision = 'f929b6164fe55c0c510485f9869816f482ee8560';

function fixture(mismatchSecondRoot = false) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'gitedge-stage-'));
  const roots = ['runner-broker', 'runner-broker-2'].map((name) => path.join(base, name));
  for (const root of roots) {
    fs.mkdirSync(path.join(root, '.git'), { recursive: true });
    fs.mkdirSync(path.join(root, 'work', 'ops'), { recursive: true });
    fs.writeFileSync(path.join(root, 'work', 'ops', 'update-idle-broker.mjs'), 'old helper');
  }
  return { base, roots, mismatchSecondRoot };
}

function runStage(fixtureData) {
  let script = fs.readFileSync(scriptPath, 'utf8');
  script = script
    .replace("'D:\\GitEdge\\runner-broker'", `'${fixtureData.roots[0].replaceAll('\\', '\\\\')}'`)
    .replace("'D:\\GitEdge\\runner-broker-2'", `'${fixtureData.roots[1].replaceAll('\\', '\\\\')}'`);
  const payload = Buffer.from(JSON.stringify(fixtureData)).toString('base64');
  const harness = String.raw`
$ErrorActionPreference = 'Stop'
$fixture = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payload}')) | ConvertFrom-Json
$script:tasks = @{}
$script:mutations = 0
$script:starts = 0
$script:stops = 0
$sid = 'S-1-5-21-100-200-300-1001'
function Get-Command { param([string]$Name, $ErrorAction); if ($Name -eq 'node.exe') { return [pscustomobject]@{ Source = 'C:\Tools\node.exe' } }; return [pscustomobject]@{ Source = 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' } }
function Get-ScheduledTask { param([string]$TaskName, $ErrorAction); return $script:tasks[$TaskName] }
function Get-ScheduledTaskInfo { param([string]$TaskName, $ErrorAction); return $script:tasks[$TaskName].Info }
function New-ScheduledTaskAction { param($Execute, $Argument, $WorkingDirectory); return [pscustomobject]@{ Execute = $Execute; Arguments = $Argument; WorkingDirectory = $WorkingDirectory } }
function New-ScheduledTaskSettingsSet { param($ExecutionTimeLimit, $MultipleInstances); return [pscustomobject]@{} }
function Set-ScheduledTask { param($TaskName, $Action, $Principal, $Settings); $script:mutations++; $task = $script:tasks[$TaskName]; $task.Actions = @($Action); $task.Principal = $Principal }
function Start-ScheduledTask { param([string]$TaskName); $script:starts++; $task = $script:tasks[$TaskName]; $task.State = 'Running'; $task.Info.LastRunTime = [datetime]::Now; $task.Info.LastTaskResult = 267009 }
function Start-Sleep { param($Milliseconds) }
function Stop-ScheduledTask { $script:stops++ }
function Get-PrincipalSid { param([string]$UserId); return [pscustomobject]@{ Value = $UserId } }
foreach ($index in 0..1) {
  $root = $fixture.roots[$index]
  $brokerName = if ($index -eq 0) { 'GitEdgeRunnerBroker' } else { 'GitEdgeRunnerBroker-2' }
  $helperName = 'GitEdgeBrokerUpdate-f929b6164fe5-' + ($index + 1)
  $principal = [pscustomobject]@{ UserId = $sid; LogonType = 'InteractiveToken'; RunLevel = 'Limited' }
  $helper = Join-Path $root 'work\ops\update-idle-broker.mjs'
  $args = '"' + $helper + '" "' + $root + '" "${revision}" "' + $brokerName + '"'
  if ($fixture.mismatchSecondRoot -and $index -eq 1) { $args += ' unexpected' }
  $script:tasks[$brokerName] = [pscustomobject]@{ State = 'Running'; Principal = $principal; Actions = @(); Info = [pscustomobject]@{} }
  $script:tasks[$helperName] = [pscustomobject]@{ State = 'Ready'; Principal = $principal; Actions = @([pscustomobject]@{ Execute = 'C:\Tools\node.exe'; Arguments = $args }); Info = [pscustomobject]@{ LastTaskResult = 1; LastRunTime = [datetime]::Now.AddMinutes(-4) } }
}
try {
${script}
} catch { $script:failure = $_.Exception.Message }
[pscustomobject]@{ failure = $script:failure; mutations = $script:mutations; starts = $script:starts; stops = $script:stops; taskStates = @($script:tasks['GitEdgeBrokerUpdate-f929b6164fe5-1'].State, $script:tasks['GitEdgeBrokerUpdate-f929b6164fe5-2'].State); principals = @($script:tasks['GitEdgeBrokerUpdate-f929b6164fe5-1'].Principal.UserId, $script:tasks['GitEdgeBrokerUpdate-f929b6164fe5-2'].Principal.UserId); actions = @($script:tasks['GitEdgeBrokerUpdate-f929b6164fe5-1'].Actions[0].Execute, $script:tasks['GitEdgeBrokerUpdate-f929b6164fe5-2'].Actions[0].Execute) } | ConvertTo-Json -Compress
`;
  const harnessPath = path.join(fixtureData.base, 'run-stage.ps1');
  fs.writeFileSync(harnessPath, harness, 'utf8');
  const output = execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', harnessPath], { encoding: 'utf8' });
  return JSON.parse(output.trim().split(/\r?\n/).at(-1));
}

test('stage validates both prior tasks before writing or refreshing either task', () => {
  const data = fixture(true);
  try {
    const result = runStage(data);
    assert.match(result.failure, /arguments do not match/);
    assert.equal(result.mutations, 0);
    assert.equal(result.starts, 0);
    assert.equal(result.stops, 0);
    for (const root of data.roots) {
      assert.equal(fs.readFileSync(path.join(root, 'work', 'ops', 'update-idle-broker.mjs'), 'utf8'), 'old helper');
      assert.deepEqual(fs.readdirSync(path.join(root, 'work', 'ops')).sort(), ['update-idle-broker.mjs']);
    }
  } finally { fs.rmSync(data.base, { recursive: true, force: true }); }
});

test('stage refreshes only the two verified idle helpers and starts the idle-safe updater tasks', () => {
  const data = fixture(false);
  try {
    const result = runStage(data);
    assert.equal(result.failure, null);
    assert.equal(result.mutations, 2);
    assert.equal(result.starts, 2);
    assert.equal(result.stops, 0);
    assert.deepEqual(result.taskStates, ['Running', 'Running']);
    assert.deepEqual(result.principals, ['S-1-5-21-100-200-300-1001', 'S-1-5-21-100-200-300-1001']);
    assert.deepEqual(result.actions, ['C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe']);
    for (let index = 0; index < data.roots.length; index++) {
      const ops = path.join(data.roots[index], 'work', 'ops');
      assert.match(fs.readFileSync(path.join(ops, 'update-idle-broker.mjs'), 'utf8'), /active\.lock/);
      assert.ok(fs.existsSync(path.join(ops, `run-broker-update-f929b6164fe5-logged-${index + 1}.ps1`)));
    }
  } finally { fs.rmSync(data.base, { recursive: true, force: true }); }
});

test('stage workflow is fixed-dispatch only and has no secret or cancellation surface', () => {
  const workflow = fs.readFileSync(workflowPath, 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /inputs:|secrets\.|Stop-ScheduledTask|cancel-in-progress/i);
  assert.match(workflow, /self-hosted, Windows, need-tool-node, need-time-5m/);
  assert.match(fs.readFileSync(scriptPath, 'utf8'), /Get-PrincipalSid/);
});
