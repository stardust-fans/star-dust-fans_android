import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { isDeepStrictEqual, promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const bundleId = 'top.stardustinfinity.mobile';
const teamId = '76DMUAK6J5';

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
  if (!report || report.schema_version !== 1 || report.stage !== 'ios_sign' || report.bundle_id !== bundleId ||
      report.team_id !== teamId || report.source_sha !== expected.sourceSha || report.version !== expected.version ||
      report.architecture !== 'arm64' || report.codesign_verified !== true || report.identity_class !== 'Apple Development' ||
      report.request_id !== expected.requestId || !Number.isSafeInteger(report.generation) || report.generation < 1 ||
      !/^sha256:[0-9a-f]{64}$/.test(report.input_digest ?? '') ||
      !/^[0-9a-f]{40}$/.test(report.recipe_sha ?? '') || !/^sha256:[0-9a-f]{64}$/.test(report.policy_digest ?? '') ||
      !/^\d{4}-\d\d-\d\dT/.test(report.certificate_expiration ?? '') ||
      !/^\d{4}-\d\d-\d\dT/.test(report.profile_expiration ?? '') ||
      typeof report.profile_uuid !== 'string' || !report.profile_uuid || report.profile_type !== 'development' ||
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

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function requireEnv(env, key) {
  if (!env[key]) throw new Error(`Missing required environment setting: ${key}`);
  return env[key];
}

function signingBase(env) {
  let url;
  try {
    url = new URL(requireEnv(env, 'SIGNING_URL'));
  } catch {
    throw new Error('SIGNING_URL must be a valid HTTPS origin.');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('SIGNING_URL must be an HTTPS origin without credentials or a path.');
  }
  return url.origin;
}

function validRequestId(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

async function api(env, route, options = {}) {
  const base = signingBase(env);
  const response = await fetch(`${base}${route}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${requireEnv(env, 'SIGNING_API_KEY')}`,
      ...(options.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error(`Signing service request failed with HTTP ${response.status}.`);
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
  const result = await response.json();
  if (!validRequestId(result.request_id)) {
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
  const status = await response.json();
  if (status.request_id !== requestId || status.project_id !== 'stardust-ios' || status.platform !== 'ios' ||
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

async function download(env) {
  const requestId = requireEnv(env, 'SIGNING_REQUEST_ID');
  const status = await waitForStatus(env, requestId);
  const report = status.output?.report;
  if (!report) throw new Error('Signing service did not return its verification report.');

  const response = await api(env, `/v1/requests/${encodeURIComponent(requestId)}/download`);
  if (response.status !== 200) throw new Error('Signing service returned an unexpected download status.');
  const zipBytes = Buffer.from(await response.arrayBuffer());
  const expectedArchiveDigest = status.output.archive_digest;
  const headerDigest = response.headers.get('X-Signing-Archive-Digest');
  if (!/^sha256:[0-9a-f]{64}$/.test(expectedArchiveDigest ?? '') || headerDigest !== expectedArchiveDigest ||
      `sha256:${sha256(zipBytes)}` !== expectedArchiveDigest ||
      !Number.isSafeInteger(status.output.archive_size) || zipBytes.length !== status.output.archive_size) {
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
    await writeFile(archive, zipBytes);
    const listing = (await execFileAsync('unzip', ['-Z1', archive])).stdout.trim().split(/\r?\n/).sort();
    if (listing.length !== 2 || listing[0] !== 'signed.ipa' || listing[1] !== 'verification.json') {
      throw new Error('Signed archive must contain exactly signed.ipa and verification.json.');
    }
    await execFileAsync('unzip', ['-q', archive, '-d', extracted]);
    const embedded = JSON.parse(await readFile(join(extracted, 'verification.json'), 'utf8'));
    if (!isDeepStrictEqual(embedded, report)) throw new Error('Embedded verification report differs from the service status.');
    const ipa = await readFile(join(extracted, 'signed.ipa'));
    if (ipa.length !== ipaRecord.size || sha256(ipa) !== ipaRecord.sha256) {
      throw new Error('Signed IPA digest or size does not match the verification report.');
    }
    const ipaPath = requireEnv(env, 'SIGNED_IPA_PATH');
    const reportPath = requireEnv(env, 'VERIFICATION_PATH');
    await mkdir(dirname(ipaPath), { recursive: true });
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(ipaPath, ipa);
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

export async function run(env = process.env) {
  if (env.OPERATION === 'submit') return submit(env);
  if (env.OPERATION === 'download') return download(env);
  throw new Error('OPERATION must be submit or download.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  run().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
