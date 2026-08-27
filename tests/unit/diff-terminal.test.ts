import assert from "node:assert/strict";
import test from "node:test";
import { renderDiffTerminal } from "../../src/reporters/diffTerminal.ts";
import type { AuthorityDiff } from "../../src/analysis/diff.ts";

const shellCapability = {
  id: "shell",
  kind: "shell.execute" as const,
  source: "mcp-tool:run",
  target: "child_process.exec",
  evidence: [],
};

const before = {
  id: "before-run",
  name: "run",
  server: "server",
  sdkStyle: "v2" as const,
  inputs: ["command"],
  capabilities: [],
  evidence: [],
};

const after = { ...before, id: "after-run", capabilities: [shellCapability] };

const diff: AuthorityDiff = {
  beforeRoot: "base",
  afterRoot: "head",
  addedCapabilities: [],
  removedCapabilities: [],
  addedFindings: [],
  removedFindings: [],
  addedTools: [],
  removedTools: [],
  changedTools: [{
    name: "run",
    server: "server",
    before,
    after,
    addedCapabilities: [shellCapability],
    removedCapabilities: [],
    addedInputs: [],
    removedInputs: [],
  }],
};

test("renderDiffTerminal shows semantic MCP tool changes", () => {
  const output = renderDiffTerminal(diff);

  assert.match(output, /Changed MCP tools/);
  assert.match(output, /~ run/);
  assert.match(output, /\+ shell\.execute -> child_process\.exec/);
  assert.doesNotMatch(output, /No semantic authority changes detected/);
});
