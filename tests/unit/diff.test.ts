import assert from "node:assert/strict";
import test from "node:test";
import { diffReports } from "../../src/analysis/diff.ts";

const capability = (
  id: string,
  kind: "process.spawn" | "shell.execute" | "network.connect" | "environment.expose",
  source: string,
  target: string,
) => ({
  id,
  kind,
  source,
  target,
  evidence: [],
});

const mcpTool = (id: string, name: string, capabilities: ReturnType<typeof capability>[]) => ({
  id,
  name,
  server: "server",
  sdkStyle: "v2" as const,
  inputs: ["command"],
  capabilities,
  evidence: [],
});

const report = (
  root: string,
  capabilities: ReturnType<typeof capability>[],
  findings: any[] = [],
  mcpTools: ReturnType<typeof mcpTool>[] = [],
) => ({
  root,
  filesAnalyzed: 0,
  mcpServers: 0,
  mcpTools,
  capabilities,
  findings,
  diagnostics: [],
});

test("diffReports compares capabilities semantically instead of by root-dependent ids", () => {
  const before = report("/tmp/before", [capability("id-before", "process.spawn", "workspace", "node")]);
  const after = report("/different/root", [capability("id-after", "process.spawn", "workspace", "node")]);

  const diff = diffReports(before, after);
  assert.deepEqual(diff.addedCapabilities, []);
  assert.deepEqual(diff.removedCapabilities, []);
});

test("diffReports reports added and removed authority deterministically", () => {
  const before = report("before", [
    capability("a", "environment.expose", "workspace", "GITHUB_TOKEN"),
    capability("b", "process.spawn", "workspace", "node"),
  ]);
  const after = report("after", [
    capability("c", "process.spawn", "workspace", "node"),
    capability("d", "network.connect", "docs", "https://mcp.example.com"),
  ]);

  const diff = diffReports(before, after);
  assert.deepEqual(
    diff.addedCapabilities.map(({ kind, source, target }) => ({ kind, source, target })),
    [{ kind: "network.connect", source: "docs", target: "https://mcp.example.com" }],
  );
  assert.deepEqual(
    diff.removedCapabilities.map(({ kind, source, target }) => ({ kind, source, target })),
    [{ kind: "environment.expose", source: "workspace", target: "GITHUB_TOKEN" }],
  );
});

test("diffReports compares findings by stable semantic signature", () => {
  const findingA = {
    ruleId: "SG1001",
    title: "Untrusted content reaches shell execution",
    severity: "critical",
    confidence: "PROVEN",
    signature: "SG1001\0input>exec",
    pathLabels: ["input", "exec"],
    path: { nodes: ["root-a-id", "sink-a-id"], edges: [] },
    evidence: [{ file: "/root-a/tool.ts", startLine: 1 }],
  };
  const findingB = {
    ...findingA,
    path: { nodes: ["root-b-id", "sink-b-id"], edges: [] },
    evidence: [{ file: "/root-b/tool.ts", startLine: 1 }],
  };

  assert.deepEqual(diffReports(report("a", [], [findingA]), report("b", [], [findingB])).addedFindings, []);
  assert.deepEqual(diffReports(report("a", [], []), report("b", [], [findingB])).addedFindings.map((f) => f.ruleId), ["SG1001"]);
});

test("diffReports reports an existing MCP tool gaining authority as changed", () => {
  const before = report("before", [], [], [mcpTool("before-run", "run", [])]);
  const afterCapability = capability(
    "after-shell",
    "shell.execute",
    "mcp-tool:run",
    "child_process.exec",
  );
  const after = report("after", [afterCapability], [], [mcpTool("after-run", "run", [afterCapability])]);

  const diff = diffReports(before, after);
  assert.deepEqual(diff.addedTools, []);
  assert.deepEqual(diff.removedTools, []);
  assert.equal(diff.changedTools.length, 1);
  assert.equal(diff.changedTools[0]?.name, "run");
  assert.deepEqual(
    diff.changedTools[0]?.addedCapabilities.map(({ kind }) => kind),
    ["shell.execute"],
  );
  assert.deepEqual(diff.changedTools[0]?.removedCapabilities, []);
});

test("diffReports reports newly exposed MCP tools without classifying them as changed", () => {
  const added = mcpTool("new-status", "status", []);
  const diff = diffReports(report("before", [], [], []), report("after", [], [], [added]));

  assert.deepEqual(diff.addedTools.map(({ name }) => name), ["status"]);
  assert.deepEqual(diff.removedTools, []);
  assert.deepEqual(diff.changedTools, []);
});
