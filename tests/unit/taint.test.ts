import assert from "node:assert/strict";
import test from "node:test";
import { findPaths } from "../../src/analysis/taint.ts";
import { AgentGraph } from "../../src/ir/graph.ts";

function graphWithPath(): AgentGraph {
  const graph = new AgentGraph();
  graph.addNode({ id: "repo", kind: "repository-content", label: "repo", evidence: [] });
  graph.addNode({ id: "cmd", kind: "command", label: "command", evidence: [] });
  graph.addNode({ id: "proc", kind: "process", label: "exec", evidence: [] });
  graph.addEdge({ from: "repo", to: "cmd", kind: "passes-to", evidence: [{ file: "x.ts", startLine: 1 }] });
  graph.addEdge({ from: "cmd", to: "proc", kind: "executes", evidence: [{ file: "x.ts", startLine: 2 }] });
  return graph;
}

test("findPaths returns the exact evidence-preserving route to a sink", () => {
  const graph = graphWithPath();
  const paths = findPaths(graph, new Set(["repo"]), new Set(["proc"]));
  assert.equal(paths.length, 1);
  assert.deepEqual(paths[0]?.nodes, ["repo", "cmd", "proc"]);
  assert.deepEqual(paths[0]?.edges.map((edge) => edge.evidence[0]?.startLine), [1, 2]);
});

test("findPaths returns no route for a disconnected sink and terminates on cycles", () => {
  const graph = graphWithPath();
  graph.addNode({ id: "other", kind: "process", label: "other", evidence: [] });
  graph.addEdge({ from: "cmd", to: "repo", kind: "passes-to", evidence: [] });
  assert.deepEqual(findPaths(graph, new Set(["repo"]), new Set(["other"])), []);
});
