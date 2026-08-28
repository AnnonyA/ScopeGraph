import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { discoverProject } from "../../src/discovery/discoverProject.ts";

test("discoverProject finds supported sources and agent files while ignoring generated directories", async () => {
  const root = await mkdtemp(join(tmpdir(), "scopegraph-discovery-"));
  try {
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(join(root, "packages", "api"), { recursive: true });
    await mkdir(join(root, "node_modules", "pkg"), { recursive: true });
    await mkdir(join(root, "dist"), { recursive: true });
    await writeFile(join(root, "src", "tool.ts"), "export const x = 1;\n");
    await writeFile(join(root, "CLAUDE.md"), "# instructions\n");
    await writeFile(join(root, "AGENTS.md"), "# root instructions\n");
    await writeFile(join(root, "packages", "api", "AGENTS.override.md"), "# override\n");
    await writeFile(join(root, "packages", "api", "SKILL.md"), "---\nname: api\ndescription: API skill\n---\n");
    await writeFile(join(root, ".mcp.json"), "{}\n");
    await writeFile(join(root, "node_modules", "pkg", "ignored.ts"), "");
    await writeFile(join(root, "dist", "ignored.js"), "");

    const result = await discoverProject(root);
    assert.deepEqual(result.sourceFiles.map((p) => p.slice(root.length + 1)), ["src/tool.ts"]);
    assert.deepEqual(result.agentFiles.map((p) => p.slice(root.length + 1)), [
      "AGENTS.md",
      "CLAUDE.md",
      "packages/api/AGENTS.override.md",
      "packages/api/SKILL.md",
    ]);
    assert.deepEqual(result.mcpFiles.map((p) => p.slice(root.length + 1)), [".mcp.json"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
