import { appendFile, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const GITHUB_API = 'https://api.github.com';
const GITEDGE_ORIGIN = 'https://gitedge.voidcarve.com';
const SOURCE_REPOSITORY = 'stardust-fans/star-dust-fans_android';
const SOURCE_REPOSITORY_ID = '1423880436';
const SOURCE_WORKFLOW = '.github/workflows/ios-sign.yml';
const SOURCE_ARTIFACT = 'unsigned-ios-archive';
const PROFILE = 'stardust-ios';
const RECIPE_SHA = '70a52dfbe00bae1136f68186d4ad035f74f3cb1d';
const POLICY_DIGEST = 'sha256:518ffa7c0b89f7f717d47f58853400293744b3e678b520a6292812ab3292a846';
const TEAM_ID = '76DMUAK6J5';
const MAX_ARTIFACT_BYTES = 1_000_000_000;
const POLL_INTERVAL_MS = 15_000;
const MAX_WAIT_MS = 35 * 60_000;
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

function validateRequestId(requestId) {
  if (!UUID.test(requestId ?? '')) throw new Error('SIGNING_REQUEST_ID_INVALID');
}

export function validateRequestStatus(request, requestId, expected) {
  validateRequestId(requestId);
  validateSigningRequest(request, expected);
  if (request.id !== requestId) throw new Error('SIGNING_REQUEST_ID_MISMATCH');
  if (request.state === 'succeeded' && request.stage !== 'ios_sign') throw new Error('SIGNING_REQUEST_STAGE_MISMATCH');
  if (request.state === 'failed' || request.state === 'cancelled' || request.state === 'awaiting_source') {
    throw new Error(`SIGNING_REQUEST_${request.state.toUpperCase()}`);
  }
  if (request.state === 'succeeded' && (!DIGEST.test(request.outputDigest ?? '')
    || !Number.isSafeInteger(request.outputSize) || request.outputSize < 1 || request.outputSize > MAX_ARTIFACT_BYTES)) {
    throw new Error('SIGNING_OUTPUT_METADATA_INVALID');
  }
  return request;
}

async function readZipJson(zipPath, member) {
  const exec = promisify(execFile);
  let stdout;
  try {
    ({ stdout } = await exec('/usr/bin/unzip', ['-p', zipPath, member], { encoding: 'buffer', maxBuffer: 1_000_000 }));
  } catch { throw new Error('SIGNING_ARCHIVE_METADATA_INVALID'); }
  try {
    const value = JSON.parse(stdout.toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new Error('SIGNING_ARCHIVE_METADATA_INVALID'); }
}

export async function downloadToFile(response, destination, expectedSize, expectedDigest, code) {
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error(code);
  }
  const length = response.headers.get('content-length');
  if (!/^\d+$/.test(length ?? '') || Number(length) !== expectedSize) {
    await response.body.cancel();
    throw new Error(`${code}_SIZE_MISMATCH`);
  }
  const digest = createHash('sha256');
  let size = 0;
  const meter = new Transform({
    transform(chunk, _encoding, callback) {
      size += chunk.length;
      if (size > expectedSize) return callback(new Error(`${code}_SIZE_MISMATCH`));
      digest.update(chunk);
      callback(null, chunk);
    },
  });
  try {
    await pipeline(response.body, meter, createWriteStream(destination, { flags: 'wx' }));
  } catch { throw new Error(code); }
  const actualDigest = `sha256:${digest.digest('hex')}`;
  if (size !== expectedSize) throw new Error(`${code}_SIZE_MISMATCH`);
  if (actualDigest !== expectedDigest) throw new Error(`${code}_DIGEST_MISMATCH`);
  return { size, digest: actualDigest };
}

async function fetchRequest(requestId, apiToken, fetchImpl) {
  validateRequestId(requestId);
  const value = await gitedgeJson(signingUrl(requestId), apiToken, { fetchImpl });
  return value;
}

export async function waitForSigning({ requestId, apiToken, expected, fetchImpl = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), timeoutMs = MAX_WAIT_MS }) {
  validateRequestId(requestId);
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const request = validateRequestStatus(await fetchRequest(requestId, apiToken, fetchImpl), requestId, expected);
    if (request.state === 'succeeded') return request;
    if (Date.now() >= deadline) throw new Error('SIGNING_REQUEST_TIMEOUT');
    await sleep(Math.min(POLL_INTERVAL_MS, deadline - Date.now()));
  }
}

export function signingDownloadUrl(requestId) {
  validateRequestId(requestId);
  const url = new URL(signingUrl(requestId));
  url.pathname += '/download';
  return url;
}

async function downloadSourceArtifact({ artifactId, runId, sourceSha, githubToken, destination, expectedArtifact, fetchImpl }) {
  const url = `${GITHUB_API}/repos/${SOURCE_REPOSITORY}/actions/artifacts/${encodeURIComponent(artifactId)}/zip`;
  const response = await fetchImpl(url, {
    redirect: 'manual', signal: AbortSignal.timeout(120_000),
    headers: { authorization: `Bearer ${githubToken}`, accept: 'application/vnd.github+json' },
  });
  if (response.status !== 302) {
    await response.body?.cancel();
    throw new Error('SOURCE_ARCHIVE_DOWNLOAD_FAILED');
  }
  await response.body?.cancel();
  const location = response.headers.get('location');
  let downloadUrl;
  try {
    downloadUrl = new URL(location);
    if (downloadUrl.protocol !== 'https:' || downloadUrl.username || downloadUrl.password || downloadUrl.port
      || !/^productionresultssa\d+\.blob\.core\.windows\.net$/.test(downloadUrl.hostname)) throw new Error();
  } catch { throw new Error('SOURCE_ARCHIVE_REDIRECT_INVALID'); }
  const downloadResponse = await fetchImpl(downloadUrl, {
    redirect: 'error', signal: AbortSignal.timeout(120_000),
  });
  const result = await downloadToFile(downloadResponse, destination, expectedArtifact.size, expectedArtifact.digest,
    'SOURCE_ARCHIVE_DOWNLOAD');
  const source = await readZipJson(destination, 'source.json');
  if (source.platform !== 'ios' || source.architecture !== 'arm64' || source.bundle_id !== 'top.stardustinfinity.mobile'
    || source.source_sha !== sourceSha || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(source.version ?? '')) {
    throw new Error('SOURCE_METADATA_MISMATCH');
  }
  return { ...result, source };
}

async function downloadSigningOutput({ request, requestId, apiToken, destination, fetchImpl }) {
  const response = await fetchImpl(signingDownloadUrl(requestId), {
    redirect: 'error', signal: AbortSignal.timeout(120_000),
    headers: { authorization: `Bearer ${apiToken}`, accept: 'application/zip' },
  });
  if (response.headers.get('x-signing-digest') !== request.outputDigest) {
    await response.body?.cancel();
    throw new Error('SIGNING_OUTPUT_DIGEST_MISMATCH');
  }
  return downloadToFile(response, destination, request.outputSize, request.outputDigest, 'SIGNING_OUTPUT_DOWNLOAD');
}

export function validateSigningReportBinding(report, { request, requestId, source, sourceDigest }) {
  if (report.request_id !== requestId || report.source_sha !== source.source_sha || report.version !== source.version
    || report.recipe_sha !== RECIPE_SHA || report.policy_digest !== POLICY_DIGEST || report.team_id !== TEAM_ID
    || report.bundle_id !== source.bundle_id || report.stage !== 'ios_sign'
    || report.input_digest !== sourceDigest || sourceDigest !== request.sourceDigest || request.stage !== 'ios_sign') {
    throw new Error('SIGNING_REPORT_BINDING_MISMATCH');
  }
  return report;
}

async function writeVerifierStatus({ outputPath, request, requestId, source, sourceDigest, archive }) {
  const report = validateSigningReportBinding(await readZipJson(outputPath, 'verification.json'),
    { request, requestId, source, sourceDigest });
  const status = {
    request_id: requestId,
    state: request.state,
    platform: request.platform,
    source_sha: source.source_sha,
    version: source.version,
    input_digest: sourceDigest,
    output: { archive_size: archive.size, archive_digest: archive.digest, report },
  };
  const path = join(dirname(outputPath), 'signing-status.json');
  await writeFile(path, `${JSON.stringify(status)}\n`, { flag: 'wx' });
  return path;
}

export async function retrieveAndVerify({ env = process.env, requestId, fetchImpl = fetch }) {
  const githubToken = required(env, 'GITHUB_TOKEN');
  const apiToken = required(env, 'GITEDGE_SIGNING_TOKEN');
  const profile = required(env, 'GITEDGE_SIGNING_PROFILE');
  const expected = { profile, platform: 'ios', sourceDigest: required(env, 'SOURCE_DIGEST'), sourceSize: Number(required(env, 'SOURCE_SIZE')) };
  const request = await waitForSigning({ requestId, apiToken, expected, fetchImpl });
  const temp = required(env, 'RUNNER_TEMP');
  const sourceArchive = join(temp, 'unsigned-ios-archive.zip');
  const signedArchive = join(temp, 'signed-ios-output.zip');
  const expectedArtifact = await sourceArtifactMetadata({ artifactId: required(env, 'ARTIFACT_ID'), runId: required(env, 'GITHUB_RUN_ID'),
    sourceSha: required(env, 'GITHUB_SHA'), githubToken, fetchImpl });
  if (expectedArtifact.digest !== expected.sourceDigest || expectedArtifact.size !== expected.sourceSize) {
    throw new Error('SOURCE_ARTIFACT_METADATA_CHANGED');
  }
  const downloadedSource = await downloadSourceArtifact({ artifactId: env.ARTIFACT_ID, runId: env.GITHUB_RUN_ID,
    sourceSha: env.GITHUB_SHA, githubToken, destination: sourceArchive, expectedArtifact, fetchImpl });
  const downloadedOutput = await downloadSigningOutput({ request, requestId, apiToken, destination: signedArchive, fetchImpl });
  const statusPath = await writeVerifierStatus({ outputPath: signedArchive, request, requestId, source: downloadedSource.source,
    sourceDigest: downloadedSource.digest, archive: downloadedOutput });
  const summary = required(env, 'GITHUB_STEP_SUMMARY');
  await appendFile(summary, `GitEdge signing request succeeded: \`${requestId}\`.\n`);
  await appendFile(required(env, 'GITHUB_OUTPUT'), `status_path=${statusPath}\nsource_archive=${sourceArchive}\nsigned_archive=${signedArchive}\nrecipe_sha=${RECIPE_SHA}\nteam_id=${TEAM_ID}\n`);
  return { request, sourceArchive, signedArchive, statusPath };
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
  await appendFile(required(env, 'GITHUB_OUTPUT'), `request_id=${request.id}\nsource_digest=${body.sourceDigest}\nsource_size=${body.sourceSize}\n`);
  if (env.GITHUB_STEP_SUMMARY) {
    await appendFile(env.GITHUB_STEP_SUMMARY,
      `GitEdge signing request submitted: \`${request.id}\`; this workflow will wait for completion and verify the returned IPA.\n`);
  }
  return request;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const operation = process.argv[2] === 'retrieve'
    ? retrieveAndVerify({ requestId: process.env.REQUEST_ID })
    : run();
  operation.catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
