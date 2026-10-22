import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { gunzipSync } from "node:zlib";

const workflowPath = new URL("../.github/workflows/gitedge-runner-maintenance-controller.yml", import.meta.url);
const workflow = (await readFile(workflowPath, "utf8")).replaceAll("\n", "\n");
assert.match(workflow, /on:\n  workflow_dispatch:\n/);
assert.doesNotMatch(workflow, /workflow_dispatch:\n\s+inputs:/);
assert.match(workflow, /runs-on: ubuntu-latest/);
assert.match(workflow, /GITEDGE_SIGNING_TOKEN: \$\{\{ secrets\.GITEDGE_SIGNING_TOKEN \}\}/);
assert.doesNotMatch(workflow, /\/api\/auth\/|\/credentials?(?:\/|')/i);

const lines = workflow.split(/\r?\n/);
const runLine = lines.indexOf("        run: |");
assert.notEqual(runLine, -1);
const scriptLines = [];
for (const line of lines.slice(runLine + 1)) {
  if (!line.startsWith("          ")) break;
  scriptLines.push(line.slice(10));
}
assert.equal(scriptLines[0], "node <<'NODE'");
assert.equal(scriptLines.at(-1), "NODE");
const source = scriptLines.slice(1, -1).join("\n");
new vm.Script(source);
const filesMatch = source.match(/const files = (\[[^\n]+\]);/);
assert.ok(filesMatch, "fixed payload list must be inline JSON");
const files = JSON.parse(filesMatch[1]);
assert.deepEqual(files.map((file) => file.path), [
  ".github/workflows/windows-broker-verify-cleanup.yml",
]);
const payloadBytes = files.map((file) => gunzipSync(Buffer.from(file.payload, "hex")));
assert.deepEqual(payloadBytes.map((bytes) => createHash("sha256").update(bytes).digest("hex")), [
  "d17de46990ed908cd9cbfe4ddac477d7160e9b81e7fedc25a3936b5928282052",
]);
const windowsReadback = payloadBytes[0].toString("utf8");
assert.match(windowsReadback, /safe\.directory=\$\(\$target\.Root\)/);
assert.match(windowsReadback, /messageCategory/);
assert.match(windowsReadback, /StderrCategory/);
assert.match(windowsReadback, /Unregister-ScheduledTask -TaskName \$entry\.HelperTask/);
assert.doesNotMatch(windowsReadback, /Stop-ScheduledTask/);
assert.doesNotMatch(windowsReadback, /Write-Output.*\$stderr/);
assert.doesNotMatch(windowsReadback, /secrets\.|GITHUB_TOKEN|GITEDGE_SIGNING_TOKEN/);
const initialOid = "a".repeat(40);
const commitOid = "b".repeat(40);
const calls = [];
const output = [];
const token = "test-only-token";
const context = {
  Buffer,
  Blob,
  AbortSignal,
  FormData,
  require: (name) => {
    assert.equal(name, "node:zlib");
    return { gunzipSync };
  },
  process: { env: { GITEDGE_SIGNING_TOKEN: token }, exitCode: 0 },
  console: { log: (line) => output.push(String(line)), error: (line) => output.push(String(line)) },
  fetch: async (url, options = {}) => {
    calls.push({ url: String(url), options });
    assert.equal(options.redirect, "error");
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.signal.aborted, false);
    assert.equal(options.headers?.Authorization, `Bearer ${token}`);
    if (String(url).endsWith("/files?ref=main"))
      return { ok: true, status: 200, json: async () => ({ data: { oid: initialOid, paths: [], truncated: false } }) };
    if (String(url).endsWith("/commit")) {
      assert.equal(options.method, "POST");
      assert.ok(options.body instanceof FormData);
      const manifest = JSON.parse(options.body.get("manifest"));
      assert.equal(manifest.branch, "main");
      assert.equal(manifest.expectedOid, initialOid);
      assert.equal(manifest.changes.length, files.length);
      for (let index = 0; index < files.length; index++) {
        assert.equal(manifest.changes[index].op, "put");
        assert.equal(manifest.changes[index].path, files[index].path);
        assert.equal(await options.body.get(`file${index}`).text(), payloadBytes[index].toString("utf8"));
      }
      return { ok: true, status: 201, json: async () => ({ data: { branch: "main", oid: commitOid } }) };
    }
    if (String(url).endsWith("/runs")) {
      assert.equal(options.method, "POST");
      const body = JSON.parse(options.body);
      assert.equal(body.ref, "main");
      assert.equal(body.expectedOid, commitOid);
      assert.equal(Object.hasOwn(body, "inputs"), false);
      return { ok: true, status: 202, json: async () => ({ data: { id: `run-${calls.length}` } }) };
    }
    throw new Error("Unexpected API path in controller test.");
  },
};
await vm.runInNewContext(source, context);
assert.equal(context.process.exitCode, 0);
assert.equal(calls.length, 3);
assert.equal(output.filter((line) => line.startsWith("Queued ")).length, 1);
assert.equal(output.some((line) => line.includes(token)), false);

const failureOutput = [];
const failureContext = {
  Buffer,
  Blob,
  FormData,
  AbortSignal,
  require: context.require,
  process: { env: { GITEDGE_SIGNING_TOKEN: token }, exitCode: 0 },
  console: { log: (line) => failureOutput.push(String(line)), error: (line) => failureOutput.push(String(line)) },
  fetch: async (_url, options = {}) => {
    assert.equal(options.redirect, "error");
    assert.ok(options.signal instanceof AbortSignal);
    return { ok: false, status: 403, json: async () => ({ error: { code: "unauthorized", message: token } }) };
  },
};
await vm.runInNewContext(source, failureContext);
assert.equal(failureContext.process.exitCode, 1);
assert.deepEqual(failureOutput, ["Read main revision failed (HTTP 403 unauthorized)."]);
assert.equal(failureOutput.some((line) => line.includes(token)), false);
console.log("Fixed maintenance payload, CAS commit, API paths, and workflow dispatch contract passed.");
