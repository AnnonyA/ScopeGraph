import type { AgentGraph } from "../ir/graph.ts";
import type { Evidence, NodeKind } from "../ir/types.ts";
import { findPaths, type ReachabilityPath } from "./taint.ts";

export interface Finding {
  ruleId: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  confidence: "PROVEN" | "UNKNOWN";
  signature: string;
  pathLabels: string[];
  path: ReachabilityPath;
  evidence: Evidence[];
}

interface FindingRule {
  ruleId: string;
  title: string;
  severity: Finding["severity"];
}

function pathEvidence(graph: AgentGraph, path: ReachabilityPath): Evidence[] {
  const evidence = [
    ...path.nodes.flatMap((id) => graph.getNode(id)?.evidence ?? []),
    ...path.edges.flatMap((edge) => edge.evidence),
  ];
  const seen = new Set<string>();
  return evidence.filter((item) => {
    const key = `${item.file}:${item.startLine ?? ""}:${item.endLine ?? ""}:${item.symbol ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function semanticPathLabels(graph: AgentGraph, path: ReachabilityPath): string[] {
  return path.nodes.map((id) => graph.getNode(id)?.label ?? "<unknown>");
}

function findingRule(sourceKind: NodeKind | undefined, sinkKind: NodeKind | undefined): FindingRule | undefined {
  const untrusted = sourceKind === "user-input" || sourceKind === "mcp-tool-input";

  if (untrusted && sinkKind === "process") {
    return {
      ruleId: "SG1001",
      title: "Untrusted content reaches shell execution",
      severity: "critical",
    };
  }

  if (untrusted && sinkKind === "file") {
    return {
      ruleId: "SG1101",
      title: "Untrusted content reaches filesystem mutation",
      severity: "high",
    };
  }

  if (sourceKind === "environment" && sinkKind === "network") {
    return {
      ruleId: "SG1201",
      title: "Sensitive environment data reaches network",
      severity: "high",
    };
  }

  return undefined;
}

export function detectFindings(
  graph: AgentGraph,
  sources: ReadonlySet<string>,
  sinks: ReadonlySet<string>,
): Finding[] {
  const findings: Finding[] = [];

  for (const path of findPaths(graph, sources, sinks)) {
    const sourceKind = graph.getNode(path.nodes[0] ?? "")?.kind;
    const sinkKind = graph.getNode(path.nodes.at(-1) ?? "")?.kind;
    const rule = findingRule(sourceKind, sinkKind);
    if (!rule) continue;

    const pathLabels = semanticPathLabels(graph, path);
    findings.push({
      ruleId: rule.ruleId,
      title: rule.title,
      severity: rule.severity,
      confidence: "PROVEN",
      signature: `${rule.ruleId}\0${pathLabels.join(">")}`,
      pathLabels,
      path,
      evidence: pathEvidence(graph, path),
    });
  }

  return findings;
}
