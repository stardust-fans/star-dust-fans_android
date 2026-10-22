const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');

test('helper scopes Git trust to the validated root and records pre-lock failures', async () => {
  const helperPath = path.join(__dirname, '..', 'agents', '014_[Ops]_gitedge_maintenance_controller', 'host-update', 'update-idle-broker.mjs');
  const source = fs.readFileSync(helperPath, 'utf8').replace(/^import .*?;\r?\n/gm, '');
  const root = 'D:\\GitEdge\\runner-broker';
  const revision = 'f929b6164fe55c0c510485f9869816f482ee8560';
  let receipt;
  const mockProcess = { argv: ['node', 'helper', root, revision, 'GitEdgeRunnerBroker'], platform: 'win32', env: {}, pid: 7, execPath: 'node.exe' };
  const execFile = async (file, args) => {
    if (file !== 'git' || args[0] !== '-c' || args[1] !== `safe.directory=${root}`)
      throw new Error('Git trust was not scoped to the validated root');
    throw new Error('tracked checkout preflight failed');
  };
  const wrapped = `(async (process, os, path, open, mkdir, realpath, rm, writeFile, promisify, execFile) => { ${source}\n})(...args)`;
  const run = vm.runInNewContext(wrapped, {
    args: [mockProcess, { homedir: () => 'C:\\Users\\runner' }, path.win32, async () => { throw new Error('lock must not be opened'); }, async () => {}, async (value) => value, async () => {}, async (_path, data) => { receipt = JSON.parse(data); }, () => execFile, execFile],
    console: { log() {} }, Date, setTimeout, Promise, Object, String, RegExp, Error, JSON, process: mockProcess,
  });

  await assert.rejects(run, /tracked checkout preflight failed/);
  assert.equal(receipt?.status, 'failure');
  assert.equal(receipt?.message, 'tracked checkout preflight failed');
});
