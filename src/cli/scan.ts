#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { detectFindings, type Finding } from "../analysis/findings.ts";
import { discoverProject } from "../discovery/discoverProject.ts";
import { analyzeModuleSource } from "../frontends/javascript/analyzeModule.ts";
import { AgentGraph } from "../ir/graph.ts";
import type { Diagnostic } from "../ir/types.ts";
import { renderJson } from "../reporters/json.ts";
import { renderTerminal } from "../reporters/terminal.ts";

export interface ScanReport {
  root: string;
  filesAnalyzed: number;
  findings: Finding[];
  diagnostics: Diagnostic[];
}

export async function scanProject(root: string): Promise<ScanReport> {
  const project = await discoverProject(resolve(root));
  const graph = new AgentGraph();
  const sources = new Set<string>();
  const sinks = new Set<string>();
  const diagnostics: Diagnostic[] = [];

  for (const file of project.sourceFiles) {
    const source = await readFile(file, "utf8");
    const analysis = analyzeModuleSource(file, source);
    graph.merge(analysis.graph);
    for (const id of analysis.sources) sources.add(id);
    for (const id of analysis.sinks) sinks.add(id);
    diagnostics.push(...analysis.diagnostics);
  }

  return {
    root: project.root,
    filesAnalyzed: project.sourceFiles.length,
    findings: detectFindings(graph, sources, sinks),
    diagnostics,
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] !== "scan") {
    console.error("Usage: scopegraph scan [directory] [--json]");
    process.exitCode = 2;
    return;
  }

  const json = args.includes("--json");
  const root = args.find((arg, index) => index > 0 && !arg.startsWith("--")) ?? ".";
  try {
    const report = await scanProject(root);
    process.stdout.write(json ? renderJson(report) : renderTerminal(report));
    process.exitCode = report.findings.some((finding) => finding.severity === "critical" || finding.severity === "high") ? 1 : 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) void main();
