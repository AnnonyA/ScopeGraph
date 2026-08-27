import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { diffProjects } from "../../src/cli/diff.ts";

const fixture = (name: string) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

test("diffProjects surfaces new MCP authority and newly proven findings", async () => {
  const result = await diffProjects(fixture("diff-before"), fixture("diff-after"));

  assert.deepEqual(
    result.addedCapabilities.map(({ kind, source, target }) => ({ kind, source, target })),
    [{ kind: "network.connect", source: "docs", target: "https://mcp.example.com" }],
  );
  assert.deepEqual(result.removedCapabilities, []);
  assert.deepEqual(result.addedFindings.map((finding) => finding.ruleId), ["SG1001"]);
  assert.equal(JSON.stringify(result).includes("must-not-leak"), false);
});
