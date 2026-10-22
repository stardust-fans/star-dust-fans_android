import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { open, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const exec = promisify(execFile);
const [requestedRoot, revision, taskName] = process.argv.slice(2);
let root;
let receiptPath;
let lock;
let lockPath;
try {
if (!/^[a-f0-9]{40}$/.test(revision ?? '')) throw new Error('Invalid revision');
root = await realpath(requestedRoot);
const allowed = process.platform === 'darwin'
  ? [path.join(os.homedir(), '.local/share/gitedge/runner-broker')]
  : ['D:\\GitEdge\\runner-broker', 'D:\\GitEdge\\runner-broker-2'];
const normalize = (value) => process.platform === 'win32' ? value.toLowerCase() : value;
if (!allowed.some((value) => normalize(path.resolve(value)) === normalize(root)))
  throw new Error('Unexpected broker root');
if (!['darwin', 'win32'].includes(process.platform)) throw new Error('Unsupported host');
receiptPath = path.join(root, 'work', 'broker-update-receipt.json');
if (process.platform === 'win32' && (!taskName || !/^[\w .()-]+$/.test(taskName)))
  throw new Error('Invalid scheduled task');
const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !/^(?:GH_|GITHUB_|GITEDGE_|ACTIONS_|RUNNER_TRACKING_ID$)/i.test(key)));
const command = async (file, args) => {
  const result = await exec(file, args, { cwd: root, env: environment, windowsHide: true, timeout: 120000, maxBuffer: 1024 * 1024 });
  if (result.stdout.trim()) console.log(result.stdout.trim());
  return result.stdout.trim();
};
const git = (args) => command('git', ['-c', `safe.directory=${root}`, '-c', 'credential.helper=', '-c', 'core.askPass=', ...args]);
const top = await git(['rev-parse', '--show-toplevel']);
if (normalize(path.resolve(top)) !== normalize(root)) throw new Error('Unexpected Git root');
if (await git(['status', '--porcelain', '--untracked-files=no'])) throw new Error('Broker checkout has tracked changes');
await git(['-c', 'http.maxRequests=1', 'fetch', 'https://github.com/lsy-404/gitedge.git', revision]);
const state = path.join(root, 'work', 'actions');
await mkdir(state, { recursive: true, mode: 0o700 });
lockPath = path.join(state, 'active.lock');
const deadline = Date.now() + 30 * 60_000;
while (!lock && Date.now() < deadline) {
  try { lock = await open(lockPath, 'wx', 0o600); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  if (!lock) await new Promise((resolve) => setTimeout(resolve, 1000));
}
if (!lock) throw new Error('Broker did not become idle');
await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  const previous = await git(['rev-parse', 'HEAD']);
  if (await git(['status', '--porcelain', '--untracked-files=no'])) throw new Error('Broker checkout changed while waiting');
  await git(['merge-base', '--is-ancestor', 'HEAD', revision]);
  await git(['-c', 'http.maxRequests=1', 'fetch', 'https://github.com/lsy-404/gitedge.git', 'refs/heads/main']);
  await git(['merge-base', '--is-ancestor', revision, 'FETCH_HEAD']);
  await git(['merge', '--ff-only', '--no-edit', revision]);
  await command(process.execPath, ['--check', 'scripts/runner-broker.mjs']);
  await command(process.execPath, ['--input-type=module', '-e', "await import('./scripts/runner-broker-signing-workflow.mjs')"]);
  if (process.platform === 'darwin') {
    await command('/bin/launchctl', ['kickstart', '-k', `gui/${process.getuid()}/com.gitedge.runner-broker`]);
    const serviceArgs = ['print', `gui/${process.getuid()}/com.gitedge.runner-broker`];
    const deadline = Date.now() + 45_000;
    let running = false;
    while (!running && Date.now() < deadline) {
      try {
        const service = await exec('/bin/launchctl', serviceArgs, { env: environment, timeout: 5000 });
        running = /state = running/i.test(service.stdout);
      } catch {}
      if (!running) await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!running) throw new Error('Broker service did not start');
    console.log('Broker service is running.');
  } else {
    const quotedTask = "'" + taskName.replaceAll("'", "''") + "'";
    await command('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', `$ErrorActionPreference='Stop'
$taskName=${quotedTask}
$task=Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
Stop-ScheduledTask -InputObject $task
$deadline=(Get-Date).AddSeconds(45)
do {
  Start-Sleep -Milliseconds 250
  $state=(Get-ScheduledTask -TaskName $taskName -ErrorAction Stop).State
} while ($state -eq 'Running' -and (Get-Date) -lt $deadline)
if ($state -ne 'Ready') { throw "Broker task did not stop cleanly (state: $state)." }
Start-ScheduledTask -TaskName $taskName
$deadline=(Get-Date).AddSeconds(45)
do {
  Start-Sleep -Milliseconds 250
  $state=(Get-ScheduledTask -TaskName $taskName -ErrorAction Stop).State
} while ($state -ne 'Running' -and (Get-Date) -lt $deadline)
if ($state -ne 'Running') { throw "Broker task did not start (state: $state)." }
Write-Output 'Broker task is running while execution slot is held.'`]);
  }
  await writeFile(receiptPath, JSON.stringify({ status: 'success', previous, revision, completedAt: new Date().toISOString() }) + '\n', { mode: 0o600 });
} catch (error) {
  try {
    if (!receiptPath) throw error;
    await writeFile(receiptPath, JSON.stringify({ status: 'failure', revision, message: error.message, completedAt: new Date().toISOString() }) + '\n', { mode: 0o600 });
  } catch {}
  throw error;
} finally {
  if (lock) {
    await lock.close();
    await rm(lockPath);
  }
}
