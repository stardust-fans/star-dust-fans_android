import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { downloadToFile, requestBody, run, signingDownloadUrl, sourceArtifactMetadata, validateRequestStatus, validateSigningReportBinding } from '../.github/scripts/ios-sign-api.mjs';

const requestId = '3e8a9c51-8d06-4e22-bcf7-c7464b05c2fd';
const repoId = '13814fa3-8580-4b5a-803e-a6b1206007ed';
const sourceSha = 'a'.repeat(40);
const digest = `sha256:${'b'.repeat(64)}`;
const version = '1.3.0';

function submitEnv(output, summary) {
  return {
    GITEDGE_SIGNING_TOKEN: 'test-token', GITEDGE_SIGNING_PROFILE: 'stardust-ios',
    GITHUB_TOKEN: 'github-test-token', GITHUB_REPOSITORY: 'stardust-fans/star-dust-fans_android',
    GITHUB_REPOSITORY_ID: '1423880436', GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_RUN_ID: '12345', GITHUB_RUN_ATTEMPT: '1', GITHUB_SHA: sourceSha,
    ARTIFACT_ID: '67890', APP_VERSION: version, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary,
    ACTIONS_ID_TOKEN_REQUEST_URL: 'https://pipelines.actions.githubusercontent.com/abc?foo=bar',
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'oidc-request-token',
  };
}

function githubRun() {
  return { id: 12345, path: '.github/workflows/ios-sign.yml@refs/heads/main', event: 'workflow_dispatch',
    status: 'in_progress', run_attempt: 1, head_branch: 'main', head_sha: sourceSha };
}

function githubArtifact() {
  return { id: 67890, name: 'unsigned-ios-archive', expired: false, digest, size_in_bytes: 777,
    workflow_run: { id: 12345, repository_id: 1423880436, head_sha: sourceSha } };
}

test('request body binds the profile, repository, run, source artifact, digest, and version', () => {
  assert.deepEqual(requestBody({ runId: '12345', runAttempt: '1', artifactId: '67890', version, sourceSha,
    sourceDigest: digest, sourceSize: 777, profile: 'stardust-ios' }), {
    profile: 'stardust-ios', platform: 'ios', sourceRepositoryId: '1423880436', sourceCommitOid: sourceSha,
    sourceRunId: '12345', sourceArtifactId: '67890', sourceDigest: digest, sourceSize: 777, version,
  });
  assert.throws(() => requestBody({ runId: '12345', runAttempt: '2', artifactId: '67890', version, sourceSha,
    sourceDigest: digest, sourceSize: 777, profile: 'stardust-ios' }), /INVALID_SOURCE_IDENTITY/);
  assert.throws(() => requestBody({ runId: '12345', runAttempt: '1', artifactId: '67890', version: '1.3.0+build', sourceSha,
    sourceDigest: digest, sourceSize: 777, profile: 'stardust-ios' }), /INVALID_SIGNING_REQUEST/);
});

test('submission validates GitHub source identity and sends native GitEdge request with OIDC binding', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ios-sign-submit-'));
  const output = join(dir, 'output');
  const summary = join(dir, 'summary');
  const calls = [];
  const fetchImpl = async (url, init) => {
    const target = new URL(url);
    calls.push({ url: String(url), init });
    if (target.hostname === 'api.github.com' && target.pathname.endsWith('/actions/runs/12345')) return Response.json(githubRun());
    if (target.hostname === 'api.github.com' && target.pathname.endsWith('/actions/artifacts/67890')) return Response.json(githubArtifact());
    if (target.hostname === 'pipelines.actions.githubusercontent.com') {
      assert.equal(target.searchParams.get('audience'), 'https://gitedge.voidcarve.com');
      assert.equal(init.headers.authorization, 'Bearer oidc-request-token');
      return Response.json({ value: 'jwt-test' });
    }
    assert.equal(String(url), `https://gitedge.voidcarve.com/api/actions/signing/requests?repositoryId=${repoId}`);
    assert.equal(init.headers.authorization, 'Bearer test-token');
    assert.equal(init.headers['idempotency-key'], 'stardust-ios-12345-1');
    assert.equal(init.headers['x-run-identity'], 'jwt-test');
    assert.equal(init.redirect, 'error');
    const body = JSON.parse(init.body);
    assert.equal(body.sourceArtifactId, '67890');
    assert.equal(body.sourceDigest, digest);
    assert.equal(body.sourceSize, 777);
    return Response.json({ data: { request: { id: requestId, repositoryId: repoId, profile: 'stardust-ios', platform: 'ios',
      sourceDigest: digest, sourceSize: 777, state: 'accepted' } } }, { status: 202 });
  };
  try {
    const request = await run(submitEnv(output, summary), fetchImpl);
    assert.equal(request.id, requestId);
    assert.equal(calls.length, 4);
    assert.equal((await readFile(output, 'utf8')).trim(), `request_id=${requestId}\nsource_digest=${digest}\nsource_size=777`);
    const text = await readFile(summary, 'utf8');
    assert.match(text, new RegExp(requestId));
    assert.match(text, /wait for completion and verify/);
    assert.doesNotMatch(text, /central administrator interface/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('request polling binds the exact request and stops on failed terminal state', () => {
  const expected = { profile: 'stardust-ios', platform: 'ios', sourceDigest: digest, sourceSize: 777 };
  const request = { id: requestId, repositoryId: repoId, profile: expected.profile, platform: 'ios',
    sourceDigest: digest, sourceSize: 777, state: 'running' };
  assert.equal(validateRequestStatus(request, requestId, expected).state, 'running');
  assert.throws(() => validateRequestStatus(request, '6b91ace2-0021-4d70-b7a3-ac06009d56a9', expected), /SIGNING_REQUEST_ID_MISMATCH/);
  assert.throws(() => validateRequestStatus({ ...request, state: 'failed' }, requestId, expected), /SIGNING_REQUEST_FAILED/);
  assert.throws(() => validateRequestStatus({ ...request, state: 'succeeded', stage: 'finalize', outputDigest: digest, outputSize: 1 }, requestId, expected), /SIGNING_REQUEST_STAGE_MISMATCH/);
});

test('signing download URL keeps request path, suffix, and repository query separate', () => {
  const url = signingDownloadUrl(requestId);
  assert.equal(url.pathname, `/api/actions/signing/requests/${requestId}/download`);
  assert.equal(url.searchParams.get('repositoryId'), repoId);
  assert.deepEqual([...url.searchParams.keys()], ['repositoryId']);
});

test('verification report binds source digest and approved signing policy', () => {
  const source = { source_sha: sourceSha, version, bundle_id: 'top.stardustinfinity.mobile' };
  const request = { id: requestId, stage: 'ios_sign', sourceDigest: digest };
  const report = { request_id: requestId, source_sha: sourceSha, version, recipe_sha: '70a52dfbe00bae1136f68186d4ad035f74f3cb1d',
    policy_digest: 'sha256:518ffa7c0b89f7f717d47f58853400293744b3e678b520a6292812ab3292a846',
    team_id: '76DMUAK6J5', bundle_id: source.bundle_id, stage: 'ios_sign', input_digest: digest };
  assert.equal(validateSigningReportBinding(report, { request, requestId, source, sourceDigest: digest }), report);
  assert.throws(() => validateSigningReportBinding({ ...report, input_digest: `sha256:${'0'.repeat(64)}` },
    { request, requestId, source, sourceDigest: digest }), /SIGNING_REPORT_BINDING_MISMATCH/);
  assert.throws(() => validateSigningReportBinding({ ...report, policy_digest: `sha256:${'0'.repeat(64)}` },
    { request, requestId, source, sourceDigest: digest }), /SIGNING_REPORT_BINDING_MISMATCH/);
});

test('download rejects bytes that disagree with the status digest or size', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ios-sign-download-'));
  const bytes = Buffer.from('signed archive');
  const correct = `sha256:${(await import('node:crypto')).createHash('sha256').update(bytes).digest('hex')}`;
  try {
    await assert.rejects(downloadToFile(new Response(bytes, { headers: { 'content-length': String(bytes.length) } }),
      join(dir, 'tampered.zip'), bytes.length, `sha256:${'0'.repeat(64)}`, 'SIGNING_OUTPUT_DOWNLOAD'), /DIGEST_MISMATCH/);
    const valid = await downloadToFile(new Response(bytes, { headers: { 'content-length': String(bytes.length) } }),
      join(dir, 'valid.zip'), bytes.length, correct, 'SIGNING_OUTPUT_DOWNLOAD');
    assert.deepEqual(valid, { size: bytes.length, digest: correct });
    await assert.rejects(downloadToFile(new Response(bytes, { headers: { 'content-length': String(bytes.length) } }),
      join(dir, 'wrong-size.zip'), bytes.length + 1, correct, 'SIGNING_OUTPUT_DOWNLOAD'), /SIZE_MISMATCH/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('source run and artifact mismatches fail before signing submission', async () => {
  await assert.rejects(sourceArtifactMetadata({ artifactId: '67890', runId: '12345', sourceSha, githubToken: 'x', fetchImpl: async url => {
    if (String(url).includes('/actions/runs/')) return Response.json({ ...githubRun(), path: '.github/workflows/other.yml' });
    return Response.json(githubArtifact());
  } }), /SOURCE_RUN_NOT_ALLOWED/);
  await assert.rejects(sourceArtifactMetadata({ artifactId: '67890', runId: '12345', sourceSha, githubToken: 'x', fetchImpl: async url =>
    String(url).includes('/actions/runs/') ? Response.json(githubRun()) : Response.json({ ...githubArtifact(), expired: true })
  }), /SOURCE_ARTIFACT_NOT_ALLOWED/);
});

test('submission rejects mismatched GitEdge responses and does not reveal response bodies', async () => {
  const fetchImpl = async url => {
    const target = new URL(url);
    if (target.hostname === 'api.github.com' && target.pathname.endsWith('/actions/runs/12345')) return Response.json(githubRun());
    if (target.hostname === 'api.github.com') return Response.json(githubArtifact());
    if (target.hostname === 'pipelines.actions.githubusercontent.com') return Response.json({ value: 'jwt-test' });
    return Response.json({ data: { request: { id: requestId, repositoryId: repoId, profile: 'other', platform: 'ios',
      sourceDigest: digest, sourceSize: 777, state: 'accepted' } } }, { status: 202 });
  };
  await assert.rejects(run(submitEnv('unused-output', 'unused-summary'), fetchImpl), /SIGNING_REQUEST_MISMATCH/);
});

test('public workflow submits, waits, verifies, and publishes only a sanitized receipt', async () => {
  const workflow = await readFile(new URL('../.github/workflows/ios-sign.yml', import.meta.url), 'utf8');
  assert.match(workflow, /name: unsigned-ios-archive/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /actions: read/);
  assert.match(workflow, /GITEDGE_SIGNING_TOKEN:/);
  assert.match(workflow, /GITEDGE_SIGNING_PROFILE:/);
  assert.match(workflow, /node \.github\/scripts\/ios-sign-api\.mjs retrieve/);
  assert.match(workflow, /test\/verify-signed-ipa\.py/);
  assert.match(workflow, /--receipt-output/);
  assert.equal((workflow.match(/uses: actions\/upload-artifact@/g) ?? []).length, 1);
  assert.match(workflow, /name: unsigned-ios-archive/);
  assert.doesNotMatch(workflow, /verified-signed-ios-ipa|Upload verified signed iOS IPA|actions\/upload-artifact.*signed/i);
  assert.doesNotMatch(workflow, /SIGNING_API_KEY|sign\.voidcarve\.com|OPERATION:/i);
});
