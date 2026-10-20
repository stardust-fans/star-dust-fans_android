import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { requestBody, run } from '../.github/scripts/ios-sign-api.mjs';

const requestId = '3e8a9c51-8d06-4e22-bcf7-c7464b05c2fd';
const sourceSha = 'a'.repeat(40);
const version = '1.3.0';

function submitEnv(output, summary) {
  return {
    OPERATION: 'build', SIGNING_API_KEY: 'test-token', SIGNING_URL: 'https://attacker.invalid',
    GITHUB_RUN_ID: '12345', GITHUB_RUN_ATTEMPT: '1', ARTIFACT_ID: '67890', APP_VERSION: version,
    GITHUB_SHA: sourceSha, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary,
  };
}

test('request body binds the approved project, source run, and artifact', () => {
  assert.deepEqual(requestBody({ runId: '12345', runAttempt: 1, artifactId: '67890', version, sourceSha }), {
    project_id: 'stardust-ios', platform: 'ios', run_id: 12345, run_attempt: 1,
    artifact_id: 67890, version, source_sha: sourceSha, execution_visibility: 'auto',
  });
  assert.throws(() => requestBody({ runId: '12345', runAttempt: 2, artifactId: '67890', version, sourceSha }), /first attempt/);
  assert.throws(() => requestBody({ runId: '12345', runAttempt: 1, artifactId: '67890', version: '1.3.0+build', sourceSha }), /version/);
  assert.throws(() => requestBody({ runId: '12345', runAttempt: 1, artifactId: '67890', version, sourceSha: 'bad' }), /source commit/);
});

test('submission uses the fixed origin, bearer auth, idempotency, and unsigned artifact ID', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ios-sign-submit-'));
  const output = join(dir, 'output');
  const summary = join(dir, 'summary');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://sign.voidcarve.com/v1/requests');
    assert.equal(init.headers.Authorization, 'Bearer test-token');
    assert.equal(init.headers['Idempotency-Key'], 'ios-sign-request-12345-1');
    assert.equal(init.redirect, 'error');
    assert.ok(init.signal);
    assert.deepEqual(JSON.parse(init.body), {
      project_id: 'stardust-ios', platform: 'ios', run_id: 12345, run_attempt: 1,
      artifact_id: 67890, version, source_sha: sourceSha, execution_visibility: 'auto',
    });
    return Response.json({ request_id: requestId }, { status: 202 });
  };
  try {
    await run(submitEnv(output, summary));
    assert.equal((await readFile(output, 'utf8')).trim(), `request_id=${requestId}`);
    const text = await readFile(summary, 'utf8');
    assert.match(text, new RegExp(requestId));
    assert.match(text, /central administrator interface/);
    assert.doesNotMatch(text, /download operation|signed-ipa artifact/i);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { recursive: true, force: true });
  }
});

test('submission rejects bad service responses without echoing body or credentials', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('secret response body', { status: 403 });
  try {
    await assert.rejects(run(submitEnv('unused-output', 'unused-summary')), error => {
      assert.match(error.message, /HTTP 403/);
      assert.doesNotMatch(error.message, /test-token|secret response body/);
      return true;
    });
    globalThis.fetch = async () => Response.json({ request_id: 'not-a-uuid' }, { status: 202 });
    await assert.rejects(run(submitEnv('unused-output', 'unused-summary')), /invalid request ID/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('submission rejects oversized and malformed JSON responses', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('{}', {
      status: 202, headers: { 'content-type': 'application/json', 'content-length': '1048577' },
    });
    await assert.rejects(run(submitEnv('unused-output', 'unused-summary')), /JSON response exceeds its size limit/);
    globalThis.fetch = async () => new Response('{', { status: 202, headers: { 'content-type': 'application/json' } });
    await assert.rejects(run(submitEnv('unused-output', 'unused-summary')), /invalid JSON/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('the public helper has no repository-key download operation', async () => {
  await assert.rejects(run({ OPERATION: 'download' }), /OPERATION must be build/);
  await assert.rejects(run({ OPERATION: 'submit' }), /OPERATION must be build/);
});

test('public workflow only uploads unsigned source and submits once', async () => {
  const workflow = await readFile(new URL('../.github/workflows/ios-sign.yml', import.meta.url), 'utf8');
  assert.match(workflow, /OPERATION: build/);
  assert.match(workflow, /name: unsigned-ios-archive/);
  assert.doesNotMatch(workflow, /signed-ipa|SIGNED_IPA_PATH|SIGNING_REQUEST_ID|inputs\.operation|download/i);
});
