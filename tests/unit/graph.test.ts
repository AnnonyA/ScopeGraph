import assert from "node:assert/strict";
import test from "node:test";
import { AgentGraph } from "../../src/ir/graph.ts";
import { createNodeId } from "../../src/ir/ids.ts";

test("createNodeId is deterministic for the same semantic identity", () => {
  const a = createNodeId("function", "src/a.ts", "run");
  const b = createNodeId("function", "src/a.ts", "run");
  assert.equal(a, b);
});

test("AgentGraph stores nodes and outgoing evidence edges", () => {
  const graph = new AgentGraph();
  graph.addNode({ id: "source", kind: "repository-content", label: "source", evidence: [] });
  graph.addNode({ id: "sink", kind: "process", label: "sink", evidence: [] });
  graph.addEdge({ from: "source", to: "sink", kind: "executes", evidence: [{ file: "src/a.ts", startLine: 2 }] });

  assert.equal(graph.getNode("sink")?.label, "sink");
  assert.equal(graph.outgoing("source").length, 1);
  assert.equal(graph.outgoing("source")[0]?.evidence[0]?.startLine, 2);
});
