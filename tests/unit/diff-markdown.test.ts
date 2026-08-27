import assert from "node:assert/strict";
import test from "node:test";
import { renderDiffMarkdown } from "../../src/reporters/diffMarkdown.ts";
import type { AuthorityDiff } from "../../src/analysis/diff.ts";

const diff: AuthorityDiff = {
  beforeRoot: "base-sha",
  afterRoot: "head-sha",
  addedCapabilities: [
    {
      id: "cap-network",
      kind: "network.connect",
      source: "docs",
      target: "https://mcp.example.com",
      evidence: [{ file: ".mcp.json" }],
    },
  ],
  removedCapabilities: [],
  addedFindings: [
    {
      ruleId: "SG1001",
      title: "Untrusted content reaches shell execution",
      severity: "critical",
      confidence: "PROVEN",
      signature: "SG1001\0input.command>child_process.exec",
      pathLabels: ["input.command", "child_process.exec"],
      path: { nodes: ["source", "sink"], edges: [] },
      evidence: [{ file: "src/tool.ts", startLine: 3 }],
    },
  ],
  removedFindings: [],
};

test("renderDiffMarkdown creates a GitHub-friendly authority summary", () => {
  const markdown = renderDiffMarkdown(diff);

  assert.match(markdown, /^## ScopeGraph Authority Diff/m);
  assert.match(markdown, /### Added authority/);
  assert.match(markdown, /`network\.connect`/);
  assert.match(markdown, /docs → `https:\/\/mcp\.example\.com`/);
  assert.match(markdown, /### New findings/);
  assert.match(markdown, /CRITICAL `SG1001`/);
  assert.match(markdown, /src\/tool\.ts:3/);
  assert.match(markdown, /Result: ❌ new high\/critical finding detected/);
});

test("renderDiffMarkdown reports a clean semantic diff without pretending nothing ran", () => {
  const markdown = renderDiffMarkdown({
    beforeRoot: "base",
    afterRoot: "head",
    addedCapabilities: [],
    removedCapabilities: [],
    addedFindings: [],
    removedFindings: [],
  });

  assert.match(markdown, /No semantic authority changes detected\./);
  assert.match(markdown, /Result: ✅ no new high\/critical findings/);
});
