import type { GraphEdge, GraphNode } from "./types.ts";

export class AgentGraph {
  private readonly nodeMap = new Map<string, GraphNode>();
  private readonly edgeList: GraphEdge[] = [];

  addNode(node: GraphNode): void {
    if (!this.nodeMap.has(node.id)) this.nodeMap.set(node.id, node);
  }

  addEdge(edge: GraphEdge): void {
    this.edgeList.push(edge);
  }

  getNode(id: string): GraphNode | undefined {
    return this.nodeMap.get(id);
  }

  outgoing(id: string): GraphEdge[] {
    return this.edgeList
      .filter((edge) => edge.from === id)
      .sort((a, b) => `${a.to}:${a.kind}`.localeCompare(`${b.to}:${b.kind}`));
  }

  nodes(): GraphNode[] {
    return [...this.nodeMap.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  edges(): GraphEdge[] {
    return [...this.edgeList];
  }

  merge(other: AgentGraph): void {
    for (const node of other.nodes()) this.addNode(node);
    for (const edge of other.edges()) this.addEdge(edge);
  }
}
