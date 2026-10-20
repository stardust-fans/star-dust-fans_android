import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { execFile } from 'node:child_process';
import { appendFile, copyFile, lstat, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { isDeepStrictEqual, promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

const execFileAsync = promisify(execFile);
const bundleId = 'top.stardustinfinity.mobile';
const teamId = '76DMUAK6J5';
const signingOrigin = 'https://sign.voidcarve.com';
const maxJsonBytes = 1_048_576;
const maxArchiveBytes = 2_000_000_000;

export function requestBody({ runId, runAttempt, artifactId, version, sourceSha }) {
  if (!/^\d+$/.test(String(runId)) || Number(runId) < 1 || String(runAttempt) !== '1' ||
      !/^\d+$/.test(String(artifactId)) || Number(artifactId) < 1) {
    throw new Error('GitHub IDs must be numeric and the source run attempt must be the first attempt.');
  }
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error('Invalid app version.');
  if (!/^[0-9a-f]{40}$/.test(sourceSha)) throw new Error('Invalid source commit.');
  return {
    project_id: 'stardust-ios', platform: 'ios', run_id: Number(runId), run_attempt: Number(runAttempt),
    artifact_id: Number(artifactId), version, source_sha: sourceSha, execution_visibility: 'auto',
  };
}

export function validateReport(report, expected) {
  const certificateExpiry = Date.parse(report?.certificate_expiration ?? '');
  const profileExpiry = Date.parse(report?.profile_expiration ?? '');
  if (!report || report.schema_version !== 1 || report.stage !== 'ios_sign' || report.bundle_id !== bundleId ||
      report.team_id !== teamId || report.source_sha !== expected.sourceSha || report.version !== expected.version ||
      report.architecture !== 'arm64' || report.codesign_verified !== true || report.identity_class !== 'Apple Development' ||
      report.request_id !== expected.requestId || !Number.isSafeInteger(report.generation) || report.generation < 1 ||
      !/^sha256:[0-9a-f]{64}$/.test(report.input_digest ?? '') ||
      !/^[0-9a-f]{40}$/.test(report.recipe_sha ?? '') || !/^sha256:[0-9a-f]{64}$/.test(report.policy_digest ?? '') ||
      !Number.isFinite(certificateExpiry) || certificateExpiry <= Date.now() ||
      !Number.isFinite(profileExpiry) || profileExpiry <= Date.now() ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(report.profile_uuid ?? '') || report.profile_type !== 'development' ||
      !Number.isSafeInteger(report.authorized_device_count) || report.authorized_device_count < 1) {
    throw new Error('Signing verification report does not match the requested app.');
  }
  if (!Array.isArray(report.files) || report.files.length !== 1 || report.files[0].path !== 'signed.ipa' ||
      !Number.isSafeInteger(report.files[0].size) || report.files[0].size <= 0 ||
      !/^[0-9a-f]{64}$/.test(report.files[0].sha256 ?? '')) {
    throw new Error('Signing verification report has an invalid IPA record.');
  }
  return report.files[0];
}

function requireEnv(env, key) {
  if (!env[key]) throw new Error(`Missing required environment setting: ${key}`);
  return env[key];
}

function validRequestId(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

async function api(env, route, { timeoutMs = 30_000, expectedContentType = 'application/json', ...options } = {}) {
  const response = await fetch(`${signingOrigin}${route}`, {
    ...options,
    redirect: 'error',
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      Authorization: `Bearer ${requireEnv(env, 'SIGNING_API_KEY')}`,
      ...(options.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error(`Signing service request failed with HTTP ${response.status}.`);
  if (response.headers.get('content-type')?.split(';', 1)[0].toLowerCase() !== expectedContentType) {
    throw new Error('Signing service returned an unexpected content type.');
  }
  return response;
}

async function submit(env) {
  const body = requestBody({
    runId: requireEnv(env, 'GITHUB_RUN_ID'), runAttempt: requireEnv(env, 'GITHUB_RUN_ATTEMPT'),
    artifactId: requireEnv(env, 'ARTIFACT_ID'), version: requireEnv(env, 'APP_VERSION'), sourceSha: requireEnv(env, 'GITHUB_SHA'),
  });
  const response = await api(env, '/v1/requests', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': `ios-sign-request-${body.run_id}-${body.run_attempt}`,
    },
    body: JSON.stringify(body),
  });
  const result = await readJson(response);
  if (!result || !validRequestId(result.request_id)) {
    throw new Error('Signing service returned an invalid request ID.');
  }
  await appendFile(requireEnv(env, 'GITHUB_OUTPUT'), `request_id=${result.request_id}\n`);
  if (env.GITHUB_STEP_SUMMARY) {
    await appendFile(env.GITHUB_STEP_SUMMARY, `Signing request submitted: \`${result.request_id}\`\n\nRun the workflow again with operation \`download\` and this request ID after the build run completes.\n`);
  }
}

async function readStatus(env, requestId) {
  if (!validRequestId(requestId)) {
    throw new Error('Invalid signing request ID.');
  }
  const response = await api(env, `/v1/requests/${encodeURIComponent(requestId)}`);
  const status = await readJson(response);
  if (!status || status.request_id !== requestId || status.project_id !== 'stardust-ios' || status.platform !== 'ios' ||
      !/^[0-9a-f]{40}$/.test(status.source_sha ?? '') ||
      !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(status.version ?? '') ||
      !['accepted_waiting_source', 'ingesting', 'queued', 'running', 'verifying', 'succeeded', 'failed', 'cancelled'].includes(status.state)) {
    throw new Error('Signing service returned an invalid request status.');
  }
  if (status.state === 'failed' || status.state === 'cancelled') throw new Error('Central signing request failed.');
  return status;
}

async function waitForStatus(env, requestId) {
  const deadline = Date.now() + 20 * 60 * 1000;
  while (Date.now() < deadline) {
    const status = await readStatus(env, requestId);
    if (status.state === 'succeeded') return status;
    await new Promise(resolve => setTimeout(resolve, 15000));
  }
  throw new Error('Central signing request did not finish within 20 minutes.');
}

async function readJson(response) {
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) > maxJsonBytes)) {
    await response.body?.cancel();
    throw new Error('Signing service JSON response exceeds its size limit.');
  }
  if (!response.body) throw new Error('Signing service returned an empty response.');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxJsonBytes) {
        await reader.cancel();
        throw new Error('Signing service JSON response exceeds its size limit.');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, size)));
  } catch {
    throw new Error('Signing service returned invalid JSON.');
  }
}

async function writeBoundedResponse(response, destination, expectedSize) {
  const digest = createHash('sha256');
  let size = 0;
  if (!response.body) throw new Error('Signing service returned an empty archive.');
  const meter = new Transform({
    transform(chunk, encoding, callback) {
      size += chunk.length;
      if (size > expectedSize || size > maxArchiveBytes) return callback(new Error('Signing archive exceeds its declared size.'));
      digest.update(chunk);
      callback(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(response.body), meter, createWriteStream(destination, { flags: 'wx' }));
  if (size !== expectedSize) throw new Error('Downloaded signing archive size does not match the status record.');
  return `sha256:${digest.digest('hex')}`;
}

async function hashFile(path) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest('hex');
}

async function download(env) {
  const requestId = requireEnv(env, 'SIGNING_REQUEST_ID');
  const status = await waitForStatus(env, requestId);
  if (!status.output || typeof status.output !== 'object') throw new Error('Signing service did not return its output record.');
  const report = status.output.report;
  if (!report) throw new Error('Signing service did not return its verification report.');

  const expectedArchiveDigest = status.output.archive_digest;
  const expectedArchiveSize = status.output.archive_size;
  if (!Number.isSafeInteger(expectedArchiveSize) || expectedArchiveSize < 1 || expectedArchiveSize > maxArchiveBytes ||
      !/^sha256:[0-9a-f]{64}$/.test(expectedArchiveDigest ?? '')) {
    throw new Error('Signing status has an invalid archive size or digest.');
  }

  const response = await api(env, `/v1/requests/${encodeURIComponent(requestId)}/download`, {
    timeoutMs: 10 * 60_000, expectedContentType: 'application/zip',
  });
  if (response.status !== 200) throw new Error('Signing service returned an unexpected download status.');
  const contentLength = response.headers.get('content-length');
  const headerDigest = response.headers.get('X-Signing-Archive-Digest');
  if (headerDigest !== expectedArchiveDigest || contentLength !== String(expectedArchiveSize)) {
    throw new Error('Downloaded signing archive digest or size does not match the status record.');
  }
  if (response.headers.get('content-type')?.split(';', 1)[0].toLowerCase() !== 'application/zip') {
    throw new Error('Signing service returned an unexpected archive content type.');
  }
  if (response.headers.get('content-disposition') !== `attachment; filename="signed-${requestId}.zip"`) {
    throw new Error('Signing service returned an unexpected archive filename.');
  }

  const expected = { sourceSha: status.source_sha, version: status.version, requestId };
  if (report.input_digest !== status.input_digest) throw new Error('Verification report does not match the submitted source archive.');
  const ipaRecord = validateReport(report, expected);
  const work = await mkdtemp(join(tmpdir(), 'ios-sign-'));
  try {
    const archive = join(work, 'signed.zip');
    const extracted = join(work, 'extracted');
    const actualArchiveDigest = await writeBoundedResponse(response, archive, expectedArchiveSize);
    if (actualArchiveDigest !== expectedArchiveDigest) throw new Error('Downloaded signing archive digest does not match the status record.');
    const listing = (await execFileAsync('unzip', ['-Z1', archive], { maxBuffer: 16_384 })).stdout.trim().split(/\r?\n/).sort();
    if (listing.length !== 2 || listing[0] !== 'signed.ipa' || listing[1] !== 'verification.json') {
      throw new Error('Signed archive must contain exactly signed.ipa and verification.json.');
    }
    await execFileAsync('unzip', ['-q', archive, '-d', extracted]);
    const ipaPath = join(extracted, 'signed.ipa');
    const reportPath = join(extracted, 'verification.json');
    const [ipaStat, reportStat] = await Promise.all([lstat(ipaPath), lstat(reportPath)]);
    if (!ipaStat.isFile() || !reportStat.isFile() || ipaStat.size !== ipaRecord.size || ipaStat.size > maxArchiveBytes ||
        reportStat.size < 1 || reportStat.size > maxJsonBytes) {
      throw new Error('Signed archive entries must be regular files within size limits.');
    }
    const embedded = JSON.parse(await readFile(reportPath, 'utf8'));
    if (!isDeepStrictEqual(embedded, report)) throw new Error('Embedded verification report differs from the service status.');
    if (await hashFile(ipaPath) !== ipaRecord.sha256) {
      throw new Error('Signed IPA digest or size does not match the verification report.');
    }
    const outputIpa = requireEnv(env, 'SIGNED_IPA_PATH');
    const outputReport = requireEnv(env, 'VERIFICATION_PATH');
    await mkdir(dirname(outputIpa), { recursive: true });
    await mkdir(dirname(outputReport), { recursive: true });
    await copyFile(ipaPath, outputIpa);
    await writeFile(outputReport, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

export async function run(env = process.env) {
  if (env.OPERATION === 'build') return submit(env);
  if (env.OPERATION === 'download') return download(env);
  throw new Error('OPERATION must be build or download.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  run().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
