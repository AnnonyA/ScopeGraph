#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { detectFindings, type Finding } from "../analysis/findings.ts";
import { discoverProject } from "../discovery/discoverProject.ts";
import { analyzeModuleSource } from "../frontends/javascript/analyzeModule.ts";
import { analyzeMcpConfig } from "../frontends/mcp/analyzeMcpConfig.ts";
import { AgentGraph } from "../ir/graph.ts";
import type { Capability, Diagnostic } from "../ir/types.ts";
import { renderJson } from "../reporters/json.ts";
import { renderTerminal } from "../reporters/terminal.ts";

export interface ScanReport {
  root: string;
  filesAnalyzed: number;
  mcpServers: number;
  capabilities: Capability[];
  findings: Finding[];
  diagnostics: Diagnostic[];
}

function capabilityOrder(a: Capability, b: Capability): number {
  return `${a.source}:${a.kind}:${a.target}`.localeCompare(
    `${b.source}:${b.kind}:${b.target}`,
  );
}

export async function scanProject(root: string): Promise<ScanReport> {
  const project = await discoverProject(resolve(root));
  const graph = new AgentGraph();
  const sources = new Set<string>();
  const sinks = new Set<string>();
  const diagnostics: Diagnostic[] = [];
  const capabilities: Capability[] = [];
  const mcpServerIds = new Set<string>();

  for (const file of project.sourceFiles) {
    const source = await readFile(file, "utf8");
    const analysis = analyzeModuleSource(file, source);
    graph.merge(analysis.graph);
    for (const id of analysis.sources) sources.add(id);
    for (const id of analysis.sinks) sinks.add(id);
    diagnostics.push(...analysis.diagnostics);
  }

  for (const file of project.mcpFiles) {
    const source = await readFile(file, "utf8");
    const analysis = analyzeMcpConfig(file, source);
    graph.merge(analysis.graph);
    capabilities.push(...analysis.capabilities);
    for (const id of analysis.serverIds) mcpServerIds.add(id);
    diagnostics.push(...analysis.diagnostics);
  }

  capabilities.sort(capabilityOrder);

  return {
    root: project.root,
    filesAnalyzed: project.sourceFiles.length,
    mcpServers: mcpServerIds.size,
    capabilities,
    findings: detectFindings(graph, sources, sinks),
    diagnostics,
  };
}

async function runScan(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const root = args.find((arg, index) => index > 0 && !arg.startsWith("--")) ?? ".";
  const report = await scanProject(root);
  process.stdout.write(json ? renderJson(report) : renderTerminal(report));
  process.exitCode = report.findings.some(
    (finding) => finding.severity === "critical" || finding.severity === "high",
  ) ? 1 : 0;
}

async function runDiff(args: string[]): Promise<void> {
  const roots = args.slice(1).filter((arg) => !arg.startsWith("--"));
  if (roots.length !== 2) {
    throw new Error("Usage: scopegraph diff <before-directory> <after-directory> [--json]");
  }

  const [{ diffProjects }, { renderDiffJson }, { renderDiffTerminal }] = await Promise.all([
    import("./diff.ts"),
    import("../reporters/diffJson.ts"),
    import("../reporters/diffTerminal.ts"),
  ]);
  const diff = await diffProjects(roots[0]!, roots[1]!);
  process.stdout.write(args.includes("--json") ? renderDiffJson(diff) : renderDiffTerminal(diff));
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
