#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { detectFindings, type Finding } from "../analysis/findings.ts";
import { discoverProject } from "../discovery/discoverProject.ts";
import { analyzeModuleSource } from "../frontends/javascript/analyzeModule.ts";
import { analyzeMcpConfig } from "../frontends/mcp/analyzeMcpConfig.ts";
import { discoverMcpTools } from "../frontends/mcp-sdk/discoverTools.ts";
import { AgentGraph } from "../ir/graph.ts";
import type { Capability, Diagnostic, McpTool } from "../ir/types.ts";
import { renderJson } from "../reporters/json.ts";
import { renderSarif } from "../reporters/sarif.ts";
import { renderTerminal } from "../reporters/terminal.ts";

export interface ScanReport {
  root: string;
  filesAnalyzed: number;
  mcpServers: number;
  mcpTools: McpTool[];
  capabilities: Capability[];
  findings: Finding[];
  diagnostics: Diagnostic[];
}

function capabilityOrder(a: Capability, b: Capability): number {
  return `${a.source}:${a.kind}:${a.target}`.localeCompare(
    `${b.source}:${b.kind}:${b.target}`,
  );
}

function toolOrder(a: McpTool, b: McpTool): number {
  return `${a.server}:${a.name}`.localeCompare(`${b.server}:${b.name}`);
}

function evidencePath(root: string, file: string): string {
  return relative(root, file).split(sep).join("/");
}

export async function scanProject(root: string): Promise<ScanReport> {
  const project = await discoverProject(resolve(root));
  const graph = new AgentGraph();
  const sources = new Set<string>();
  const sinks = new Set<string>();
  const diagnostics: Diagnostic[] = [];
  const capabilities: Capability[] = [];
  const mcpTools: McpTool[] = [];
  const mcpServerIds = new Set<string>();

  for (const file of project.sourceFiles) {
    const source = await readFile(file, "utf8");
    const relativeFile = evidencePath(project.root, file);
    const discovery = discoverMcpTools(relativeFile, source);
    const analysis = analyzeModuleSource(relativeFile, source, { mcpTools: discovery.tools });
    graph.merge(analysis.graph);
    for (const id of analysis.sources) sources.add(id);
    for (const id of analysis.sinks) sinks.add(id);
    capabilities.push(...analysis.capabilities);
    diagnostics.push(...discovery.diagnostics, ...analysis.diagnostics);

    for (const discovered of discovery.tools) {
      const toolSource = `mcp-tool:${discovered.name}`;
      mcpTools.push({
        id: discovered.id,
        name: discovered.name,
        server: discovered.serverBinding,
        sdkStyle: discovered.sdkStyle,
        inputs: [...discovered.inputs],
        ...(discovered.annotations ? { annotations: { ...discovered.annotations } } : {}),
        capabilities: analysis.capabilities
          .filter((capability) => capability.source === toolSource)
          .sort(capabilityOrder),
        evidence: [...discovered.evidence],
      });
    }
  }

  for (const file of project.mcpFiles) {
    const source = await readFile(file, "utf8");
    const analysis = analyzeMcpConfig(evidencePath(project.root, file), source);
    graph.merge(analysis.graph);
    capabilities.push(...analysis.capabilities);
    for (const id of analysis.serverIds) mcpServerIds.add(id);
    diagnostics.push(...analysis.diagnostics);
  }

  capabilities.sort(capabilityOrder);
  mcpTools.sort(toolOrder);

  return {
    root: project.root,
    filesAnalyzed: project.sourceFiles.length,
    mcpServers: mcpServerIds.size,
    mcpTools,
    capabilities,
    findings: detectFindings(graph, sources, sinks),
    diagnostics,
  };
}

async function runScan(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const sarif = args.includes("--sarif");
  if (json && sarif) {
    throw new Error("Choose only one scan output format: --json or --sarif");
  }

  const root = args.find((arg, index) => index > 0 && !arg.startsWith("--")) ?? ".";
  const report = await scanProject(root);
  process.stdout.write(
    sarif
      ? renderSarif(report.findings)
      : json
        ? renderJson(report)
        : renderTerminal(report),
  );
  process.exitCode = report.findings.some(
    (finding) => finding.severity === "critical" || finding.severity === "high",
  ) ? 1 : 0;
}

async function runDiff(args: string[]): Promise<void> {
  const positional = args.slice(1).filter((arg) => !arg.startsWith("--"));
  const json = args.includes("--json");
  const markdown = args.includes("--markdown");
  const sarif = args.includes("--sarif");
  if ([json, markdown, sarif].filter(Boolean).length > 1) {
    throw new Error("Choose only one diff output format: --json, --markdown or --sarif");
  }

  const [{ renderDiffJson }, { renderDiffTerminal }, { renderDiffMarkdown }] = await Promise.all([
    import("../reporters/diffJson.ts"),
    import("../reporters/diffTerminal.ts"),
    import("../reporters/diffMarkdown.ts"),
  ]);

  let diff;
  if (positional.length === 1) {
    const { diffGitRange } = await import("../git/revisions.ts");
    diff = await diffGitRange(process.cwd(), positional[0]!);
  } else if (positional.length === 2) {
    const { diffProjects } = await import("./diff.ts");
    diff = await diffProjects(positional[0]!, positional[1]!);
  } else {
    throw new Error(
      "Usage: scopegraph diff <before-directory> <after-directory> [--json|--markdown|--sarif]\n" +
      "   or: scopegraph diff <before-ref>..<after-ref> [--json|--markdown|--sarif]",
    );
  }

  process.stdout.write(
    sarif
      ? renderSarif(diff.addedFindings)
      : markdown
        ? renderDiffMarkdown(diff)
        : json
          ? renderDiffJson(diff)
          : renderDiffTerminal(diff),
  );
  process.exitCode = diff.addedFindings.some(
    (finding) => finding.severity === "critical" || finding.severity === "high",
  ) ? 1 : 0;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  try {
    if (args[0] === "scan") {
      await runScan(args);
      return;
    }
    if (args[0] === "diff") {
      await runDiff(args);
      return;
    }
    console.error("Usage: scopegraph <scan|diff> ...");
    process.exitCode = 2;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) void main();
