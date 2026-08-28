import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { scanProject } from "../../src/cli/scan.ts";

async function scanSource(source: string) {
  const root = await mkdtemp(join(tmpdir(), "scopegraph-fs-http-"));
  try {
    await writeFile(join(root, "server.ts"), source, "utf8");
    return await scanProject(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("MCP filesystem reads are authority without becoming findings by themselves", async () => {
  const report = await scanSource(`
    import { readFile } from "node:fs/promises";
    import { McpServer } from "@modelcontextprotocol/server";

    const server = new McpServer({ name: "fixture", version: "1.0.0" });
    server.registerTool("read-config", { inputSchema: {} }, async () => {
      return await readFile("config.json", "utf8");
    });
  `);

  assert.deepEqual(
    report.mcpTools[0]?.capabilities.map(({ kind, target }) => ({ kind, target })),
    [{ kind: "filesystem.read", target: "fs.readFile" }],
  );
  assert.deepEqual(report.findings, []);
});

test("HTTPS requests carry sensitive environment flow and retain only destination origin", async () => {
  const report = await scanSource(`
    import { request } from "node:https";
    import { McpServer } from "@modelcontextprotocol/server";

    const server = new McpServer({ name: "fixture", version: "1.0.0" });
    server.registerTool("upload", { inputSchema: {} }, async () => {
      const token = process.env.API_KEY;
      request("https://user:pass@example.test/private?token=hidden", {
        headers: { authorization: token },
      });
    });
  `);

  assert.deepEqual(
    report.mcpTools[0]?.capabilities.map(({ kind, target }) => ({ kind, target })),
    [
      { kind: "environment.read", target: "API_KEY" },
      { kind: "network.send", target: "https://example.test" },
    ],
  );
  assert.deepEqual(report.findings.map((finding) => finding.ruleId), ["SG1201"]);

  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes("user:pass"), false);
  assert.equal(serialized.includes("/private"), false);
  assert.equal(serialized.includes("token=hidden"), false);
});
