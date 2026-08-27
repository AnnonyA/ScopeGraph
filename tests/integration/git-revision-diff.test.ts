import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { diffGitRange } from "../../src/git/revisions.ts";

const execFileAsync = promisify(execFile);

async function git(root: string, args: string[]): Promise<string> {
  const result = await execFileAsync("git", ["-C", root, ...args], { encoding: "utf8" });
  return String(result.stdout).trim();
}

test("diffGitRange compares detached revisions, keeps evidence relative, and cleans temporary worktrees", async () => {
  const root = await mkdtemp(join(tmpdir(), "scopegraph-git-fixture-"));
  try {
    await git(root, ["init", "-b", "main"]);
    await git(root, ["config", "user.email", "scopegraph@example.test"]);
    await git(root, ["config", "user.name", "ScopeGraph Tests"]);

    await writeFile(join(root, ".mcp.json"), JSON.stringify({
      mcpServers: {
        workspace: { command: "node", args: ["server.js"] },
      },
    }, null, 2));
    await git(root, ["add", "."]);
    await git(root, ["commit", "-m", "baseline"]);

    await git(root, ["switch", "-c", "feature"]);
    await writeFile(join(root, ".mcp.json"), JSON.stringify({
      mcpServers: {
        workspace: { command: "node", args: ["server.js"] },
        docs: { url: "https://mcp.example.com/mcp?token=git-fixture-secret" },
      },
    }, null, 2));
    await writeFile(join(root, "tool.ts"), [
      'import { exec } from "node:child_process";',
      "export function run(input: { command: string }) {",
      "  exec(input.command);",
      "}",
      "",
    ].join("\n"));
    await git(root, ["add", "."]);
    await git(root, ["commit", "-m", "candidate"]);
    await git(root, ["switch", "main"]);

    const diff = await diffGitRange(root, "main..feature");

    assert.equal(diff.beforeRoot, "main");
    assert.equal(diff.afterRoot, "feature");
    assert.deepEqual(
      diff.addedCapabilities.map(({ kind, source, target }) => ({ kind, source, target })),
      [{ kind: "network.connect", source: "docs", target: "https://mcp.example.com" }],
    );
    assert.deepEqual(diff.addedFindings.map((finding) => finding.ruleId), ["SG1001"]);
    assert.deepEqual(
      [...new Set(diff.addedFindings[0]?.evidence.map((item) => item.file))],
      ["tool.ts"],
    );
    assert.deepEqual(
      [...new Set(diff.addedCapabilities[0]?.evidence.map((item) => item.file))],
      [".mcp.json"],
    );
    assert.equal(JSON.stringify(diff).includes("git-fixture-secret"), false);

    const worktrees = await git(root, ["worktree", "list", "--porcelain"]);
    assert.equal(worktrees.split("\n").filter((line) => line.startsWith("worktree ")).length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Git diff CLI emits GitHub Markdown when --markdown is requested", async () => {
  const root = await mkdtemp(join(tmpdir(), "scopegraph-git-cli-"));
  try {
    await git(root, ["init", "-b", "main"]);
    await git(root, ["config", "user.email", "scopegraph@example.test"]);
    await git(root, ["config", "user.name", "ScopeGraph Tests"]);
    await writeFile(join(root, "README.md"), "fixture\n");
    await git(root, ["add", "."]);
    await git(root, ["commit", "-m", "baseline"]);

    const cli = resolve("src/cli/scan.ts");
    const result = await execFileAsync(
      process.execPath,
      ["--experimental-strip-types", cli, "diff", "main..main", "--markdown"],
      { cwd: root, encoding: "utf8" },
    );

    const stdout = String(result.stdout);
    assert.match(stdout, /^## ScopeGraph Authority Diff/m);
    assert.match(stdout, /Result: ✅ no new high\/critical findings/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Git diff CLI SARIF excludes findings that already existed in the baseline", async () => {
  const root = await mkdtemp(join(tmpdir(), "scopegraph-git-sarif-"));
  try {
    await git(root, ["init", "-b", "main"]);
    await git(root, ["config", "user.email", "scopegraph@example.test"]);
    await git(root, ["config", "user.name", "ScopeGraph Tests"]);
    await writeFile(join(root, "tool.ts"), [
      'import { exec } from "node:child_process";',
      "export function run(input: { command: string }) {",
      "  exec(input.command);",
      "}",
      "",
    ].join("\n"));
    await git(root, ["add", "."]);
    await git(root, ["commit", "-m", "baseline with finding"]);

    await git(root, ["switch", "-c", "feature"]);
    await writeFile(join(root, "README.md"), "unrelated change\n");
    await git(root, ["add", "."]);
    await git(root, ["commit", "-m", "unrelated change"]);
    await git(root, ["switch", "main"]);

    const cli = resolve("src/cli/scan.ts");
    const result = await execFileAsync(
      process.execPath,
      ["--experimental-strip-types", cli, "diff", "main..feature", "--sarif"],
      { cwd: root, encoding: "utf8" },
    );
    const sarif = JSON.parse(String(result.stdout));

    assert.equal(sarif.version, "2.1.0");
    assert.deepEqual(sarif.runs[0].results, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
