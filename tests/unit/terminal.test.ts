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
