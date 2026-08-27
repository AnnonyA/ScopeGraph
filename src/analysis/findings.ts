import type { AgentGraph } from "../ir/graph.ts";
import type { Evidence } from "../ir/types.ts";
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

export function detectFindings(
  graph: AgentGraph,
  sources: ReadonlySet<string>,
  sinks: ReadonlySet<string>,
): Finding[] {
  return findPaths(graph, sources, sinks).map((path) => {
    const ruleId = "SG1001";
    const pathLabels = semanticPathLabels(graph, path);
    return {
      ruleId,
      title: "Untrusted content reaches shell execution",
      severity: "critical" as const,
      confidence: "PROVEN" as const,
      signature: `${ruleId}\0${pathLabels.join(">")}`,
      pathLabels,
      path,
      evidence: pathEvidence(graph, path),
    };
  });
}
