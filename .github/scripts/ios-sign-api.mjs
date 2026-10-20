import { appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const signingOrigin = 'https://sign.voidcarve.com';
const maxJsonBytes = 1_048_576;

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

function requireEnv(env, key) {
  if (!env[key]) throw new Error(`Missing required environment setting: ${key}`);
  return env[key];
}

function validRequestId(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
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

async function submit(env) {
  const body = requestBody({
    runId: requireEnv(env, 'GITHUB_RUN_ID'), runAttempt: requireEnv(env, 'GITHUB_RUN_ATTEMPT'),
    artifactId: requireEnv(env, 'ARTIFACT_ID'), version: requireEnv(env, 'APP_VERSION'), sourceSha: requireEnv(env, 'GITHUB_SHA'),
  });
  const response = await fetch(`${signingOrigin}/v1/requests`, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
    headers: {
      Authorization: `Bearer ${requireEnv(env, 'SIGNING_API_KEY')}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `ios-sign-request-${body.run_id}-${body.run_attempt}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Signing service request failed with HTTP ${response.status}.`);
  if (response.headers.get('content-type')?.split(';', 1)[0].toLowerCase() !== 'application/json') {
    throw new Error('Signing service returned an unexpected content type.');
  }
  const result = await readJson(response);
  if (!result || !validRequestId(result.request_id)) throw new Error('Signing service returned an invalid request ID.');
  await appendFile(requireEnv(env, 'GITHUB_OUTPUT'), `request_id=${result.request_id}\n`);
  if (env.GITHUB_STEP_SUMMARY) {
    await appendFile(env.GITHUB_STEP_SUMMARY,
      `Signing request submitted: \`${result.request_id}\`\n\nAfter signing completes, use this request ID in the central administrator interface to retrieve the IPA.\n`);
  }
  return result;
}

export async function run(env = process.env) {
  if (env.OPERATION !== 'build') throw new Error('OPERATION must be build.');
  return submit(env);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  run().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
