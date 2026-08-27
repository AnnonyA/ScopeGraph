import assert from "node:assert/strict";
import test from "node:test";
import { discoverMcpTools } from "../../src/frontends/mcp-sdk/discoverTools.ts";

const v2 = `
import { McpServer } from "@modelcontextprotocol/server";
const server = new McpServer({ name: "demo", version: "1.0.0" });
const app = server;
app.registerTool("run", { inputSchema: {} }, async ({ command }) => command);
`;

const v1 = `
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
const server = new McpServer({ name: "demo", version: "1.0.0" });
server.tool("legacy-run", {}, async (input) => input.command);
`;

test("discovers MCP v2 registerTool through a simple server alias", () => {
  const result = discoverMcpTools("server.ts", v2);
  assert.equal(result.tools.length, 1);
  assert.equal(result.tools[0]?.name, "run");
  assert.equal(result.tools[0]?.serverBinding, "server");
  assert.equal(result.tools[0]?.sdkStyle, "v2");
  assert.deepEqual(result.tools[0]?.inputs, ["command"]);
  assert.equal(result.diagnostics.length, 0);
});

test("discovers legacy MCP v1 .tool registrations", () => {
  const result = discoverMcpTools("legacy.ts", v1);
  assert.equal(result.tools.length, 1);
  assert.equal(result.tools[0]?.name, "legacy-run");
  assert.equal(result.tools[0]?.sdkStyle, "v1");
  assert.deepEqual(result.tools[0]?.inputs, ["command"]);
});

test("ignores unrelated registerTool methods when MCP receiver identity is not proven", () => {
  const result = discoverMcpTools("custom.ts", `
    class CustomRegistry { registerTool(..._args: unknown[]) {} }
    const registry = new CustomRegistry();
    registry.registerTool("run", {}, async ({ command }: { command: string }) => command);
  `);
  assert.equal(result.tools.length, 0);
  assert.equal(result.diagnostics.length, 0);
});

test("preserves static MCP annotations as metadata only", () => {
  const result = discoverMcpTools("annotated.ts", `
    import { McpServer } from "@modelcontextprotocol/server";
    const server = new McpServer({ name: "demo", version: "1.0.0" });
    server.registerTool("run", {
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false }
    }, async ({ command }) => command);
  `);

  assert.deepEqual(result.tools[0]?.annotations, {
    readOnlyHint: true,
    destructiveHint: false,
  });
});

test("keeps a proven tool and handler when its registration config is dynamic", () => {
  const result = discoverMcpTools("dynamic-config.ts", `
    import { McpServer } from "@modelcontextprotocol/server";
    const server = new McpServer({ name: "demo", version: "1.0.0" });
    server.registerTool("run", runtimeConfig(), async (input) => input.command);
  `);

  assert.equal(result.tools.length, 1);
  assert.equal(result.tools[0]?.name, "run");
  assert.deepEqual(result.tools[0]?.inputs, ["command"]);
  assert.equal(result.diagnostics.some((diagnostic) =>
    diagnostic.confidence === "UNKNOWN"
    && diagnostic.message === "MCP input schema could not be resolved; handler analysis continued"
  ), true);
});

test("reports malformed MCP source as UNKNOWN instead of silently accepting it", () => {
  const result = discoverMcpTools("broken.ts", `
    import { McpServer } from "@modelcontextprotocol/server";
    const server = new McpServer({ name: "demo", version: "1.0.0" });
    server.registerTool("run", { inputSchema: {} }, async ({ command }) => {
      return command;
  `);

  assert.equal(result.diagnostics.some((diagnostic) =>
    diagnostic.confidence === "UNKNOWN"
    && diagnostic.message.includes("syntax")
  ), true);
});
