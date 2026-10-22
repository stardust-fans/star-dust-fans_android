import { appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const GITHUB_API = 'https://api.github.com';
const GITEDGE_ORIGIN = 'https://gitedge.voidcarve.com';
const SOURCE_REPOSITORY = 'stardust-fans/star-dust-fans_android';
const SOURCE_REPOSITORY_ID = '1423880436';
const SOURCE_WORKFLOW = '.github/workflows/ios-sign.yml';
const SOURCE_ARTIFACT = 'unsigned-ios-archive';
const PROFILE = 'stardust-ios';
const MAX_ARTIFACT_BYTES = 1_000_000_000;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REQUEST_STATES = new Set(['accepted', 'queued', 'running', 'awaiting_source', 'succeeded', 'failed', 'cancelled']);

function required(env, key) {
  if (!env[key]) throw new Error(`${key}_UNAVAILABLE`);
  return env[key];
}

export function requestBody({ runId, runAttempt, artifactId, version, sourceSha, sourceDigest, sourceSize, profile }) {
  if (!/^[1-9]\d*$/.test(runId ?? '') || !Number.isSafeInteger(Number(runId))
    || runAttempt !== '1' || !/^[1-9]\d*$/.test(artifactId ?? '') || !Number.isSafeInteger(Number(artifactId))) {
    throw new Error('INVALID_SOURCE_IDENTITY');
  }
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version ?? '') || !/^[0-9a-f]{40}$/.test(sourceSha ?? '')
    || !DIGEST.test(sourceDigest ?? '') || !Number.isSafeInteger(sourceSize) || sourceSize < 1 || sourceSize > MAX_ARTIFACT_BYTES
    || profile !== PROFILE) throw new Error('INVALID_SIGNING_REQUEST');
  return {
    profile,
    platform: 'ios',
    sourceRepositoryId: SOURCE_REPOSITORY_ID,
    sourceCommitOid: sourceSha,
    sourceRunId: runId,
    sourceArtifactId: artifactId,
    sourceDigest,
    sourceSize,
    version,
  };
}

async function jsonResponse(response, code) {
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > 1_000_000)) {
    await response.body?.cancel();
    throw new Error(`${code}_INVALID`);
  }
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error(code);
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > 1_000_000) throw new Error(`${code}_INVALID`);
    chunks.push(Buffer.from(chunk));
  }
  try { return JSON.parse(Buffer.concat(chunks, size).toString('utf8')); }
  catch { throw new Error(`${code}_INVALID`); }
}

async function githubJson(path, token, fetchImpl) {
  const response = await fetchImpl(`${GITHUB_API}/repos/${SOURCE_REPOSITORY}${path}`, {
    redirect: 'error', signal: AbortSignal.timeout(30_000),
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' },
  });
  return jsonResponse(response, 'GITHUB_API_FAILED');
}

export async function sourceArtifactMetadata({ artifactId, runId, sourceSha, githubToken, fetchImpl = fetch }) {
  if (!/^[1-9]\d*$/.test(artifactId ?? '') || !/^[1-9]\d*$/.test(runId ?? '') || !/^[0-9a-f]{40}$/.test(sourceSha ?? '')) {
    throw new Error('INVALID_SOURCE_IDENTITY');
  }
  const run = await githubJson(`/actions/runs/${runId}`, githubToken, fetchImpl);
  if (String(run.id) !== runId || run.path?.split('@')[0] !== SOURCE_WORKFLOW || run.event !== 'workflow_dispatch'
    || run.status !== 'in_progress' || run.run_attempt !== 1 || run.head_branch !== 'main' || run.head_sha !== sourceSha) {
    throw new Error('SOURCE_RUN_NOT_ALLOWED');
  }
  const artifact = await githubJson(`/actions/artifacts/${artifactId}`, githubToken, fetchImpl);
  if (artifact.id !== Number(artifactId) || artifact.name !== SOURCE_ARTIFACT || artifact.expired !== false
    || String(artifact.workflow_run?.id) !== runId || artifact.workflow_run?.repository_id !== Number(SOURCE_REPOSITORY_ID)
    || artifact.workflow_run?.head_sha !== sourceSha || !DIGEST.test(artifact.digest ?? '')
    || !Number.isSafeInteger(artifact.size_in_bytes) || artifact.size_in_bytes < 1 || artifact.size_in_bytes > MAX_ARTIFACT_BYTES) {
    throw new Error('SOURCE_ARTIFACT_NOT_ALLOWED');
  }
  return { digest: artifact.digest, size: artifact.size_in_bytes };
}

export async function requestSourceIdentity({ endpoint, token, fetchImpl = fetch }) {
  if (!endpoint || !token) throw new Error('SOURCE_IDENTITY_UNAVAILABLE');
  let url;
  try {
    url = new URL(endpoint);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash
      || !url.hostname.endsWith('.actions.githubusercontent.com')) throw new Error();
    url.searchParams.set('audience', GITEDGE_ORIGIN);
  } catch { throw new Error('SOURCE_IDENTITY_INVALID'); }
  const response = await fetchImpl(url, {
    redirect: 'error', signal: AbortSignal.timeout(30_000), headers: { authorization: `Bearer ${token}` },
  });
  const body = await jsonResponse(response, 'SOURCE_IDENTITY_FAILED');
  if (typeof body.value !== 'string' || !body.value || body.value.length > 16_384 || /\s/.test(body.value)) {
    throw new Error('SOURCE_IDENTITY_INVALID');
  }
  return body.value;
}

function signingUrl(requestId = '') {
  const url = new URL(`/api/actions/signing/requests${requestId ? `/${requestId}` : ''}`, GITEDGE_ORIGIN);
  url.searchParams.set('repositoryId', '13814fa3-8580-4b5a-803e-a6b1206007ed');
  return url;
}

async function gitedgeJson(url, apiToken, options = {}) {
  const response = await options.fetchImpl(url, {
    method: options.method ?? 'GET', redirect: 'error', signal: AbortSignal.timeout(120_000),
    headers: {
      authorization: `Bearer ${apiToken}`, accept: 'application/json',
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.idempotencyKey ? { 'idempotency-key': options.idempotencyKey } : {}),
      ...(options.identity ? { 'x-run-identity': options.identity } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const data = await jsonResponse(response, `GITEDGE_HTTP_${response.status}`);
  if (!data.data || typeof data.data !== 'object') throw new Error('GITEDGE_RESPONSE_INVALID');
  return data.data;
}

export function validateSigningRequest(request, expected) {
  if (!request || !UUID.test(request.id ?? '') || request.repositoryId !== '13814fa3-8580-4b5a-803e-a6b1206007ed'
    || request.profile !== expected.profile || request.platform !== 'ios'
    || request.sourceDigest !== expected.sourceDigest || request.sourceSize !== expected.sourceSize
    || !REQUEST_STATES.has(request.state)) throw new Error('SIGNING_REQUEST_MISMATCH');
  return request;
}

export async function run(env = process.env, fetchImpl = fetch) {
  const githubToken = required(env, 'GITHUB_TOKEN');
  const apiToken = required(env, 'GITEDGE_SIGNING_TOKEN');
  const profile = required(env, 'GITEDGE_SIGNING_PROFILE');
  const runId = required(env, 'GITHUB_RUN_ID');
  const sourceSha = required(env, 'GITHUB_SHA');
  const version = required(env, 'APP_VERSION');
  const artifactId = required(env, 'ARTIFACT_ID');
  if (env.GITHUB_REPOSITORY !== SOURCE_REPOSITORY || env.GITHUB_REF !== 'refs/heads/main'
    || env.GITHUB_EVENT_NAME !== 'workflow_dispatch') throw new Error('SOURCE_WORKFLOW_NOT_ALLOWED');
  const artifact = await sourceArtifactMetadata({ artifactId, runId, sourceSha, githubToken, fetchImpl });
  const body = requestBody({ runId, runAttempt: env.GITHUB_RUN_ATTEMPT, artifactId, version, sourceSha,
    sourceDigest: artifact.digest, sourceSize: artifact.size, profile });
  const identity = await requestSourceIdentity({
    endpoint: env.ACTIONS_ID_TOKEN_REQUEST_URL, token: env.ACTIONS_ID_TOKEN_REQUEST_TOKEN, fetchImpl,
  });
  const result = await gitedgeJson(signingUrl(), apiToken, {
    method: 'POST', body, identity, fetchImpl, idempotencyKey: `stardust-ios-${runId}-1`,
  });
  const request = validateSigningRequest(result.request, body);
  await appendFile(required(env, 'GITHUB_OUTPUT'), `request_id=${request.id}\n`);
  if (env.GITHUB_STEP_SUMMARY) {
    await appendFile(env.GITHUB_STEP_SUMMARY,
      `GitEdge signing request submitted: \`${request.id}\`\n\nAfter signing completes, retrieve the IPA through the central administrator interface and validate it with the repository's signed IPA verifier.\n`);
  }
  return request;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  run().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
