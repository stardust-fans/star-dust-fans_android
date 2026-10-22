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
  ".github/workflows/windows-broker-stage.yml",
  ".github/workflows/runner-jit-diagnostic.yml",
]);
const payloadBytes = files.map((file) => gunzipSync(Buffer.from(file.payload, "hex")));
assert.deepEqual(payloadBytes.map((bytes) => createHash("sha256").update(bytes).digest("hex")), [
  "da8cfe6f41942b21af5d25112f072d99c181294782ba6d0865dcde048ff55251",
  "2523091ab3c0632a74e1725e4b4076d41f8aa92769c5fe8c4363a8cec0dbba33",
]);
const windowsStage = payloadBytes[0].toString("utf8");
assert.match(windowsStage, /GitEdgeBrokerUpdate-' \+ \$shortRevision \+ '-/);
assert.match(windowsStage, /LastTaskResult -ne 1/);
assert.match(windowsStage, /Get-PrincipalSid/);
assert.match(windowsStage, /Updater task arguments do not match/);
assert.match(windowsStage, /run-broker-update-.*-logged-/);
assert.doesNotMatch(windowsStage, /Stop-ScheduledTask/);
const linuxDiagnostic = payloadBytes[1].toString("utf8");
assert.match(linuxDiagnostic, /runner_id='49a6d7d2-0008-45c7-8971-951c53c8070a'/);
assert.match(linuxDiagnostic, /internal_job_id='78fd32d3-b094-4b64-a9d1-8ed001d49194'/);
assert.match(linuxDiagnostic, /emit_flag jit_configuration/);
assert.match(linuxDiagnostic, /emit_flag runner_authentication/);
assert.match(linuxDiagnostic, /emit_flag network_failure/);
assert.match(linuxDiagnostic, /emit_flag job_assignment/);
assert.doesNotMatch(linuxDiagnostic, /secrets\.|GITHUB_TOKEN|GITEDGE_SIGNING_TOKEN/);
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
assert.equal(calls.length, 4);
assert.equal(output.filter((line) => line.startsWith("Queued ")).length, 2);
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
