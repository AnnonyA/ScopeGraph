import type { AgentGraph } from "../ir/graph.ts";
import type { GraphEdge } from "../ir/types.ts";

export interface ReachabilityPath {
  nodes: string[];
  edges: GraphEdge[];
}

export function findPaths(
  graph: AgentGraph,
  sources: ReadonlySet<string>,
  sinks: ReadonlySet<string>,
): ReachabilityPath[] {
  const paths: ReachabilityPath[] = [];

  const walk = (
    current: string,
    nodes: string[],
    edges: GraphEdge[],
    visited: ReadonlySet<string>,
  ): void => {
    if (sinks.has(current)) {
      paths.push({ nodes, edges });
      return;
    }

    for (const edge of graph.outgoing(current)) {
      if (visited.has(edge.to)) continue;
      const nextVisited = new Set(visited);
      nextVisited.add(edge.to);
      walk(edge.to, [...nodes, edge.to], [...edges, edge], nextVisited);
    }
  };

  for (const source of [...sources].sort()) {
    walk(source, [source], [], new Set([source]));
  }

  return paths;
}
