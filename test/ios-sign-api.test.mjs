import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { requestBody, run, validateReport } from '../.github/scripts/ios-sign-api.mjs';

const requestId = '3e8a9c51-8d06-4e22-bcf7-c7464b05c2fd';
const sourceSha = 'a'.repeat(40);
const version = '1.3.0';
const inputDigest = `sha256:${'b'.repeat(64)}`;
const teamId = '76DMUAK6J5';
const ipa = Buffer.from('signed ipa fixture');
const ipaSha = createHash('sha256').update(ipa).digest('hex');

function report(overrides = {}) {
  return {
    schema_version: 1, request_id: requestId, generation: 1, stage: 'ios_sign', input_digest: inputDigest,
    recipe_sha: sourceSha, policy_digest: `sha256:${'c'.repeat(64)}`, source_sha: sourceSha, version,
    architecture: 'arm64', team_id: teamId, bundle_id: 'top.stardustinfinity.mobile', codesign_verified: true,
    identity_class: 'Apple Development', certificate_expiration: '2027-10-20T00:00:00.000Z',
    profile_uuid: '5aebc61a-938e-4cb1-ad2c-26d0e87f37bd', profile_expiration: '2027-10-20T00:00:00.000Z',
    profile_type: 'development', authorized_device_count: 1,
    files: [{ path: 'signed.ipa', size: ipa.length, sha256: ipaSha }],
    ...overrides,
  };
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function storedZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, contents] of entries) {
    const filename = Buffer.from(name);
    const data = Buffer.from(contents);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(filename.length, 26);
    locals.push(local, filename, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(filename.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, filename);
    offset += local.length + filename.length + data.length;
  }
  const centralData = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralData.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralData, end]);
}

function statusPayload(signingReport, archive) {
  return {
    request_id: requestId, project_id: 'stardust-ios', platform: 'ios', state: 'succeeded',
    source_sha: sourceSha, version, input_digest: inputDigest,
    output: {
      archive_digest: `sha256:${createHash('sha256').update(archive).digest('hex')}`,
      archive_size: archive.length, report: signingReport,
    },
  };
}

function envForDownload(dir, archive, signingReport, options = {}) {
  const digest = `sha256:${createHash('sha256').update(archive).digest('hex')}`;
  const status = statusPayload(signingReport, archive);
  if (options.status) Object.assign(status, options.status);
  if (options.output) Object.assign(status.output, options.output);
  const fetchMock = async url => {
    if (url.endsWith(`/v1/requests/${requestId}`)) return Response.json(status);
    if (url.endsWith(`/v1/requests/${requestId}/download`)) {
      return new Response(archive, {
        status: 200,
        headers: {
          'content-type': options.contentType ?? 'application/zip',
          'content-disposition': `attachment; filename="signed-${requestId}.zip"`,
          'x-signing-archive-digest': options.headerDigest ?? digest,
        },
      });
    }
    throw new Error('Unexpected signing API route.');
  };
  return {
    env: {
      OPERATION: 'download', SIGNING_URL: 'https://sign.invalid', SIGNING_API_KEY: 'test-token',
      SIGNING_REQUEST_ID: requestId, SIGNED_IPA_PATH: join(dir, 'out', 'signed.ipa'),
      VERIFICATION_PATH: join(dir, 'out', 'verification.json'),
    },
    fetchMock,
  };
}

test('request body uses the signing service project and source contract', () => {
  assert.deepEqual(requestBody({ runId: '12345', runAttempt: 1, artifactId: '67890', version, sourceSha }), {
    project_id: 'stardust-ios', platform: 'ios', run_id: 12345, run_attempt: 1,
    artifact_id: 67890, version, source_sha: sourceSha, execution_visibility: 'auto',
  });
  assert.throws(() => requestBody({ runId: '12345', runAttempt: 2, artifactId: '67890', version, sourceSha }), /first attempt/);
  assert.throws(() => requestBody({ runId: '12345', runAttempt: 1, artifactId: '67890', version: '1.3.0+build', sourceSha }), /version/);
});

test('submission uses bearer auth, idempotency, and the uploaded artifact ID', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ios-sign-submit-'));
  const output = join(dir, 'output');
  const summary = join(dir, 'summary');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://sign.invalid/v1/requests');
    assert.equal(init.headers.Authorization, 'Bearer test-token');
    assert.equal(init.headers['Idempotency-Key'], 'ios-sign-request-12345-1');
    assert.deepEqual(JSON.parse(init.body), {
      project_id: 'stardust-ios', platform: 'ios', run_id: 12345, run_attempt: 1,
      artifact_id: 67890, version, source_sha: sourceSha, execution_visibility: 'auto',
    });
    return Response.json({ request_id: requestId }, { status: 202 });
  };
  try {
    await run({
      OPERATION: 'submit', SIGNING_URL: 'https://sign.invalid/', SIGNING_API_KEY: 'test-token',
      GITHUB_RUN_ID: '12345', GITHUB_RUN_ATTEMPT: '1', ARTIFACT_ID: '67890', APP_VERSION: version,
      GITHUB_SHA: sourceSha, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary,
    });
    assert.match(await readFile(output, 'utf8'), new RegExp(`request_id=${requestId}`));
    assert.match(await readFile(summary, 'utf8'), new RegExp(requestId));
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { recursive: true, force: true });
  }
});

test('verification report binds the expected request and installable IPA', () => {
  const valid = report();
  assert.equal(validateReport(valid, { sourceSha, version, requestId }).sha256, ipaSha);
  assert.throws(() => validateReport({ ...valid, team_id: 'AAAAAAAAAA' }, { sourceSha, version, requestId }), /does not match/);
  assert.throws(() => validateReport({ ...valid, files: [{ ...valid.files[0], size: 0 }] }, { sourceSha, version, requestId }), /invalid IPA record/);
});

test('download validates status, archive digest, embedded report, and IPA bytes', { skip: process.platform === 'win32' }, async () => {
  execFileSync('unzip', ['-v'], { stdio: 'ignore' });
  const signingReport = report();
  const archive = storedZip([
    ['signed.ipa', ipa], ['verification.json', JSON.stringify(signingReport)],
  ]);
  const dir = await mkdtemp(join(tmpdir(), 'ios-sign-test-'));
  try {
    const { env, fetchMock } = envForDownload(dir, archive, signingReport);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock;
    try {
      await run(env);
    } finally {
      globalThis.fetch = originalFetch;
    }
    assert.deepEqual(await readFile(env.SIGNED_IPA_PATH), ipa);
    assert.deepEqual(JSON.parse(await readFile(env.VERIFICATION_PATH, 'utf8')), signingReport);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('download rejects mismatched header digest before extracting', async () => {
  const signingReport = report();
  const archive = storedZip([['signed.ipa', ipa], ['verification.json', JSON.stringify(signingReport)]]);
  const dir = await mkdtemp(join(tmpdir(), 'ios-sign-test-'));
  const { env, fetchMock } = envForDownload(dir, archive, signingReport, { headerDigest: `sha256:${'f'.repeat(64)}` });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchMock;
  try {
    await assert.rejects(run(env), /digest or size/);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { recursive: true, force: true });
  }
});

test('download rejects output archives with extra files', { skip: process.platform === 'win32' }, async () => {
  execFileSync('unzip', ['-v'], { stdio: 'ignore' });
  const signingReport = report();
  const archive = storedZip([
    ['signed.ipa', ipa], ['verification.json', JSON.stringify(signingReport)], ['extra.txt', 'unexpected'],
  ]);
  const dir = await mkdtemp(join(tmpdir(), 'ios-sign-test-'));
  const { env, fetchMock } = envForDownload(dir, archive, signingReport);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchMock;
  try {
    await assert.rejects(run(env), /exactly signed\.ipa and verification\.json/);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { recursive: true, force: true });
  }
});

test('download rejects a sidecar or IPA that differs from the service report', { skip: process.platform === 'win32' }, async () => {
  execFileSync('unzip', ['-v'], { stdio: 'ignore' });
  const dir = await mkdtemp(join(tmpdir(), 'ios-sign-test-'));
  const originalFetch = globalThis.fetch;
  try {
    const expected = report();
    const altered = { ...expected, version: '9.9.9' };
    const archive = storedZip([['signed.ipa', ipa], ['verification.json', JSON.stringify(altered)]]);
    const { env, fetchMock } = envForDownload(dir, archive, expected);
    globalThis.fetch = fetchMock;
    await assert.rejects(run(env), /differs from the service status/);

    const badRecord = { ...expected, files: [{ ...expected.files[0], sha256: 'f'.repeat(64) }] };
    const second = storedZip([['signed.ipa', ipa], ['verification.json', JSON.stringify(badRecord)]]);
    const other = envForDownload(dir, second, badRecord);
    globalThis.fetch = other.fetchMock;
    await assert.rejects(run(other.env), /digest or size does not match/);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { recursive: true, force: true });
  }
});

test('signing API failure does not echo response content or credentials', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('secret response body', { status: 403 });
  const env = {
    OPERATION: 'download', SIGNING_URL: 'https://sign.invalid', SIGNING_API_KEY: 'never-print-this',
    SIGNING_REQUEST_ID: requestId,
  };
  try {
    await assert.rejects(run(env), error => {
      assert.match(error.message, /HTTP 403/);
      assert.doesNotMatch(error.message, /never-print-this|secret response body/);
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('signing API rejects non-HTTPS and non-origin endpoints before sending credentials', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => { called = true; throw new Error('unexpected request'); };
  try {
    await assert.rejects(run({
      OPERATION: 'download', SIGNING_URL: 'http://sign.invalid/path', SIGNING_API_KEY: 'test-token',
      SIGNING_REQUEST_ID: requestId,
    }), /HTTPS origin/);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
