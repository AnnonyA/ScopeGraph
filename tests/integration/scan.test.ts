import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { scanProject } from "../../src/cli/scan.ts";

const execFileAsync = promisify(execFile);
const fixture = (name: string) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));
const cli = fileURLToPath(new URL("../../src/cli/scan.ts", import.meta.url));

test("scanProject distinguishes proven, safe and unknown execution cases", async () => {
  const unsafe = await scanProject(fixture("unsafe-exec"));
  const safe = await scanProject(fixture("safe-exec"));
  const dynamic = await scanProject(fixture("dynamic-exec"));

  assert.deepEqual(unsafe.findings.map((f) => f.ruleId), ["SG1001"]);
  assert.equal(safe.findings.length, 0);
  assert.equal(dynamic.findings.length, 0);
  assert.equal(dynamic.diagnostics.some((d) => d.confidence === "UNKNOWN"), true);
});

test("scanProject aggregates MCP runtime authority without leaking configured values", async () => {
  const report = await scanProject(fixture("mcp-authority"));

  assert.equal(report.mcpServers, 2);
  assert.deepEqual(
    report.capabilities.map(({ kind, source, target }) => ({ kind, source, target })),
    [
      { kind: "network.connect", source: "docs", target: "https://mcp.example.com" },
      { kind: "environment.expose", source: "workspace", target: "GITHUB_TOKEN" },
      { kind: "process.spawn", source: "workspace", target: "node" },
    ],
  );
  assert.equal(JSON.stringify(report).includes("fixture-secret-value"), false);
  assert.equal(JSON.stringify(report).includes("fixture-url-secret"), false);
});

test("scan CLI emits SARIF when --sarif is requested", async () => {
  const { stdout } = await execFileAsync(
    process.execPath,
    ["--experimental-strip-types", cli, "scan", fixture("safe-exec"), "--sarif"],
    { encoding: "utf8" },
  );
  const sarif = JSON.parse(String(stdout));

  assert.equal(sarif.version, "2.1.0");
  assert.equal(sarif.runs[0].tool.driver.name, "ScopeGraph");
  assert.deepEqual(sarif.runs[0].results, []);
});
