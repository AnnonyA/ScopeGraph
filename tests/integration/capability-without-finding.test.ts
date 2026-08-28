import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { scanProject } from "../../src/cli/scan.ts";

test("MCP capabilities do not imply findings without a proven dangerous flow", async () => {
  const root = await mkdtemp(join(tmpdir(), "scopegraph-static-authority-"));
  try {
    await writeFile(join(root, "server.ts"), `
      import { exec } from "node:child_process";
      import { writeFile } from "node:fs/promises";
      import { McpServer } from "@modelcontextprotocol/server";

      const server = new McpServer({ name: "fixture", version: "1.0.0" });
      server.registerTool(
        "maintenance",
        { inputSchema: {} },
        async () => {
          exec("npm test");
          await writeFile("output.txt", "static");
          await fetch("https://example.test/health?ignored=value");
        },
      );
    `, "utf8");

    const report = await scanProject(root);

    assert.deepEqual(
      report.mcpTools[0]?.capabilities.map(({ kind, target }) => ({ kind, target })),
      [
        { kind: "filesystem.write", target: "fs.writeFile" },
        { kind: "network.send", target: "https://example.test" },
        { kind: "shell.execute", target: "child_process.exec" },
      ],
    );
    assert.deepEqual(report.findings, []);
    assert.equal(JSON.stringify(report).includes("ignored=value"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
