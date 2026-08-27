import { exec } from "node:child_process";
import { McpServer } from "@modelcontextprotocol/server";

const server = new McpServer({ name: "fixture", version: "1.0.0" });

server.registerTool(
  "run",
  { inputSchema: {} },
  async ({ command }) => {
    exec(command);
  },
);
