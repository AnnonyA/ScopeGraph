import type { AgentGraph } from "../ir/graph.ts";
import type { Evidence } from "../ir/types.ts";
import { findPaths, type ReachabilityPath } from "./taint.ts";

export interface Finding {
  ruleId: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  confidence: "PROVEN" | "UNKNOWN";
  path: ReachabilityPath;
  evidence: Evidence[];
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

export function detectFindings(
  graph: AgentGraph,
  sources: ReadonlySet<string>,
  sinks: ReadonlySet<string>,
): Finding[] {
  return findPaths(graph, sources, sinks).map((path) => ({
    ruleId: "SG1001",
    title: "Untrusted content reaches shell execution",
    severity: "critical",
    confidence: "PROVEN",
    path,
    evidence: pathEvidence(graph, path),
  }));
}
