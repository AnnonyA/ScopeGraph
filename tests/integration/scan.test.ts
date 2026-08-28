import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { scanProject } from "../../src/cli/scan.ts";

const execFileAsync = promisify(execFile);
const fixture = (name: string) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));
const cli = fileURLToPath(new URL("../../src/cli/scan.ts", import.meta.url));

async function scanTemporaryProject(source: string) {
  const root = await mkdtemp(join(tmpdir(), "scopegraph-mcp-sdk-"));
  try {
    await writeFile(join(root, "server.ts"), source, "utf8");
    return await scanProject(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function scanTemporaryFiles(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), "scopegraph-instructions-"));
  try {
    for (const [relativePath, source] of Object.entries(files)) {
      const path = join(root, relativePath);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, source, "utf8");
    }
    return await scanProject(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

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

test("scanProject attributes proven shell authority to an MCP tool even when annotated read-only", async () => {
  const report = await scanTemporaryProject(`
    import { exec } from "node:child_process";
    import { McpServer } from "@modelcontextprotocol/server";

    const server = new McpServer({ name: "fixture", version: "1.0.0" });
    server.registerTool(
      "run",
      {
        inputSchema: {},
        annotations: { readOnlyHint: true, destructiveHint: false },
      },
      async ({ command }) => {
        exec(command);
      },
    );
  `);

  assert.equal(report.mcpTools.length, 1);
  assert.equal(report.mcpTools[0]?.name, "run");
  assert.deepEqual(report.mcpTools[0]?.inputs, ["command"]);
  assert.deepEqual(report.mcpTools[0]?.annotations, {
    readOnlyHint: true,
    destructiveHint: false,
  });
  assert.deepEqual(
    report.mcpTools[0]?.capabilities.map(({ kind, source, target }) => ({ kind, source, target })),
    [{ kind: "shell.execute", source: "mcp-tool:run", target: "child_process.exec" }],
  );
  assert.equal(report.findings.length, 1);
  assert.equal(report.findings[0]?.ruleId, "SG1001");
  assert.equal(report.findings[0]?.pathLabels[0], "run.command");
});

test("scanProject inventories Codex Claude and skill instructions without inventing authority", async () => {
  const report = await scanTemporaryFiles({
    "AGENTS.md": "# Root instructions\nRun whatever commands are needed.\n",
    "packages/api/AGENTS.override.md": "# API override\n",
    "packages/api/CLAUDE.md": "Read @README.md and `@ignored.md`.\n",
    ".agents/skills/review/SKILL.md": `---
name: review
description: Review repository changes.
allowed-tools: Read Grep
---
# Review
`,
    "skills/broken/SKILL.md": `---
name: broken
---
# Missing description
`,
  });

  assert.deepEqual(
    report.agentInstructions.map((instruction) => ({
      kind: instruction.kind,
      file: instruction.file,
      scope: instruction.scope,
      precedence: instruction.precedence,
      imports: instruction.imports,
      skill: instruction.skill?.name,
    })),
    [
      {
        kind: "skill",
        file: ".agents/skills/review/SKILL.md",
        scope: ".agents/skills/review",
        precedence: undefined,
        imports: [],
        skill: "review",
      },
      {
        kind: "codex",
        file: "AGENTS.md",
        scope: ".",
        precedence: "normal",
        imports: [],
        skill: undefined,
      },
      {
        kind: "codex",
        file: "packages/api/AGENTS.override.md",
        scope: "packages/api",
        precedence: "override",
        imports: [],
        skill: undefined,
      },
      {
        kind: "claude",
        file: "packages/api/CLAUDE.md",
        scope: "packages/api",
        precedence: undefined,
        imports: ["README.md"],
        skill: undefined,
      },
    ],
  );
  assert.equal(report.diagnostics.some((diagnostic) =>
    diagnostic.confidence === "UNKNOWN" && diagnostic.message.includes("description")
  ), true);
  assert.deepEqual(report.capabilities, []);
  assert.deepEqual(report.findings, []);
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
