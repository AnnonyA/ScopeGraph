import { readdir } from "node:fs/promises";
import { extname, join } from "node:path";

const ignoredDirectories = new Set(["node_modules", ".git", "dist", "build", "coverage"]);
const sourceExtensions = new Set([".js", ".mjs", ".cjs", ".ts", ".mts", ".cts"]);
const agentNames = new Set(["AGENTS.md", "AGENTS.override.md", "CLAUDE.md", "SKILL.md"]);
const mcpNames = new Set([".mcp.json", "mcp.json"]);

export interface DiscoveredProject {
  root: string;
  sourceFiles: string[];
  agentFiles: string[];
  mcpFiles: string[];
}

export async function discoverProject(root: string): Promise<DiscoveredProject> {
  const sourceFiles: string[] = [];
  const agentFiles: string[] = [];
  const mcpFiles: string[] = [];

  const walk = async (directory: string): Promise<void> => {
    const entries = (await readdir(directory, { withFileTypes: true }))
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) await walk(path);
        continue;
      }
      if (!entry.isFile()) continue;
      if (sourceExtensions.has(extname(entry.name))) sourceFiles.push(path);
      if (agentNames.has(entry.name)) agentFiles.push(path);
      if (mcpNames.has(entry.name)) mcpFiles.push(path);
    }
  };

  await walk(root);
  return {
    root,
    sourceFiles: sourceFiles.sort(),
    agentFiles: agentFiles.sort(),
    mcpFiles: mcpFiles.sort(),
  };
}
