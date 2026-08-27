import assert from "node:assert/strict";
import test from "node:test";
import { analyzeMcpConfig } from "../../src/frontends/mcp/analyzeMcpConfig.ts";

test("MCP config exposes stdio process and environment capabilities without retaining secret values", () => {
  const analysis = analyzeMcpConfig(".mcp.json", JSON.stringify({
    mcpServers: {
      workspace: {
        command: "node",
        args: ["server.js"],
        env: {
          GITHUB_TOKEN: "literal-secret-value",
        },
      },
    },
  }));

  assert.deepEqual(
    analysis.capabilities.map(({ kind, source, target }) => ({ kind, source, target })),
    [
      { kind: "environment.expose", source: "workspace", target: "GITHUB_TOKEN" },
      { kind: "process.spawn", source: "workspace", target: "node" },
    ],
  );
  assert.equal(analysis.serverIds.size, 1);
  assert.equal(JSON.stringify(analysis).includes("literal-secret-value"), false);
});

test("MCP config reduces remote URLs to origins so credentials and query strings are not retained", () => {
  const analysis = analyzeMcpConfig(".mcp.json", JSON.stringify({
    mcpServers: {
      docs: {
        url: "https://mcp.example.com/mcp?token=should-not-leak",
      },
    },
  }));

  assert.deepEqual(
    analysis.capabilities.map(({ kind, source, target }) => ({ kind, source, target })),
    [{ kind: "network.connect", source: "docs", target: "https://mcp.example.com" }],
  );
  assert.equal(JSON.stringify(analysis).includes("should-not-leak"), false);
});

test("malformed MCP configuration becomes UNKNOWN instead of throwing or inventing authority", () => {
  const analysis = analyzeMcpConfig(".mcp.json", "{ definitely not json");
  assert.equal(analysis.capabilities.length, 0);
  assert.equal(analysis.serverIds.size, 0);
  assert.equal(analysis.diagnostics.length, 1);
  assert.equal(analysis.diagnostics[0]?.confidence, "UNKNOWN");
});
