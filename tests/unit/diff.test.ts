import assert from "node:assert/strict";
import test from "node:test";
import { diffReports } from "../../src/analysis/diff.ts";

const capability = (id: string, kind: "process.spawn" | "network.connect" | "environment.expose", source: string, target: string) => ({
  id,
  kind,
  source,
  target,
  evidence: [],
});

const report = (root: string, capabilities: ReturnType<typeof capability>[], findings: any[] = []) => ({
  root,
  filesAnalyzed: 0,
  mcpServers: 0,
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
