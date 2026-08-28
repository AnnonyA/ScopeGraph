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

const beforeInstruction = {
  id: "before-agents",
  kind: "codex" as const,
  file: "AGENTS.md",
  scope: ".",
  contentHash: "a".repeat(64),
  precedence: "normal" as const,
  imports: [],
  evidence: [],
};

const afterInstruction = {
  ...beforeInstruction,
  id: "after-agents",
  contentHash: "b".repeat(64),
};

const addedSkill = {
  id: "skill-review",
  kind: "skill" as const,
  file: ".agents/skills/review/SKILL.md",
  scope: ".agents/skills/review",
  contentHash: "c".repeat(64),
  imports: [],
  skill: {
    name: "review",
    description: "Review repository changes.",
    allowedTools: ["Read", "Grep"],
  },
  evidence: [],
};

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
  addedInstructions: [addedSkill],
  removedInstructions: [],
  changedInstructions: [{
    kind: "codex",
    file: "AGENTS.md",
    before: beforeInstruction,
    after: afterInstruction,
    contentChanged: true,
    addedImports: [],
    removedImports: [],
    addedAllowedTools: [],
    removedAllowedTools: [],
  }],
};

test("renderDiffTerminal shows semantic MCP tool changes", () => {
  const output = renderDiffTerminal(diff);

  assert.match(output, /Changed MCP tools/);
  assert.match(output, /~ run/);
  assert.match(output, /\+ shell\.execute -> child_process\.exec/);
  assert.doesNotMatch(output, /No semantic authority changes detected/);
});

test("renderDiffTerminal shows semantic agent instruction changes", () => {
  const output = renderDiffTerminal(diff);

  assert.match(output, /Added agent instructions/);
  assert.match(output, /\+ skill  \.agents\/skills\/review\/SKILL\.md  scope=\.agents\/skills\/review/);
  assert.match(output, /Changed agent instructions/);
  assert.match(output, /~ codex  AGENTS\.md/);
  assert.match(output, /content changed/);
});
