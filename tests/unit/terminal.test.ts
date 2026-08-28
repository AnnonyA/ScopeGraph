import assert from "node:assert/strict";
import test from "node:test";
import { renderTerminal } from "../../src/reporters/terminal.ts";
import type { ScanReport } from "../../src/cli/scan.ts";

const shellCapability = {
  id: "cap-shell",
  kind: "shell.execute" as const,
  source: "mcp-tool:run",
  target: "child_process.exec",
  evidence: [{ file: "src/server.ts", startLine: 12 }],
};

const report: ScanReport = {
  root: "/repo",
  filesAnalyzed: 1,
  mcpServers: 0,
  mcpTools: [
    {
      id: "tool-run",
      name: "run",
      server: "server",
      sdkStyle: "v2",
      inputs: ["command"],
      annotations: { readOnlyHint: true },
      capabilities: [shellCapability],
      evidence: [{ file: "src/server.ts", startLine: 6 }],
    },
  ],
  agentInstructions: [
    {
      id: "instruction-codex",
      kind: "codex",
      file: "AGENTS.md",
      scope: ".",
      precedence: "normal",
      imports: [],
      evidence: [{ file: "AGENTS.md", startLine: 1 }],
    },
    {
      id: "instruction-claude",
      kind: "claude",
      file: "packages/api/CLAUDE.md",
      scope: "packages/api",
      imports: ["README.md"],
      evidence: [{ file: "packages/api/CLAUDE.md", startLine: 1 }],
    },
    {
      id: "skill-review",
      kind: "skill",
      file: ".agents/skills/review/SKILL.md",
      scope: ".agents/skills/review",
      imports: [],
      skill: {
        name: "review",
        description: "Review repository changes.",
        allowedTools: ["Read", "Grep"],
      },
      evidence: [{ file: ".agents/skills/review/SKILL.md", startLine: 1 }],
    },
  ],
  capabilities: [shellCapability],
  findings: [],
  diagnostics: [],
};

test("renderTerminal shows discovered MCP tools, inputs and proven authority", () => {
  const output = renderTerminal(report);

  assert.match(output, /MCP tools: 1/);
  assert.match(output, /MCP tools\n/);
  assert.match(output, /run \(v2\)/);
  assert.match(output, /input: command/);
  assert.match(output, /shell\.execute -> child_process\.exec/);
});

test("renderTerminal shows agent instruction scope imports and skill metadata", () => {
  const output = renderTerminal(report);

  assert.match(output, /Agent instructions: 3/);
  assert.match(output, /Agent instructions\n/);
  assert.match(output, /codex  AGENTS\.md  scope=\.  precedence=normal/);
  assert.match(output, /claude  packages\/api\/CLAUDE\.md  scope=packages\/api/);
  assert.match(output, /imports: README\.md/);
  assert.match(output, /skill  \.agents\/skills\/review\/SKILL\.md  scope=\.agents\/skills\/review/);
  assert.match(output, /name: review/);
  assert.match(output, /allowed tools: Read, Grep/);
});
