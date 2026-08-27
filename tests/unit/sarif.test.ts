import assert from "node:assert/strict";
import test from "node:test";
import type { Finding } from "../../src/analysis/findings.ts";
import { renderSarif } from "../../src/reporters/sarif.ts";

const finding: Finding = {
  ruleId: "SG1001",
  title: "Untrusted content reaches shell execution",
  severity: "critical",
  confidence: "PROVEN",
  signature: "SG1001\0input.command>child_process.exec",
  pathLabels: ["input.command", "child_process.exec"],
  path: { nodes: ["source", "sink"], edges: [] },
  evidence: [{ file: "src/tool.ts", startLine: 3, endLine: 3 }],
};

test("renderSarif emits a GitHub-compatible SARIF result with the finding location", () => {
  const sarif = JSON.parse(renderSarif([finding]));

  assert.equal(sarif.version, "2.1.0");
  assert.equal(sarif.runs.length, 1);
  assert.equal(sarif.runs[0].tool.driver.name, "ScopeGraph");
  assert.equal(sarif.runs[0].tool.driver.rules[0].id, "SG1001");
  assert.equal(sarif.runs[0].results[0].ruleId, "SG1001");
  assert.equal(sarif.runs[0].results[0].level, "error");
  assert.equal(
    sarif.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri,
    "src/tool.ts",
  );
  assert.equal(
    sarif.runs[0].results[0].locations[0].physicalLocation.region.startLine,
    3,
  );
});

test("renderSarif defines each rule once while preserving every result", () => {
  const second: Finding = {
    ...finding,
    signature: "SG1001\0request.command>child_process.exec",
    pathLabels: ["request.command", "child_process.exec"],
    evidence: [{ file: "src/other.ts", startLine: 8 }],
  };
  const sarif = JSON.parse(renderSarif([finding, second]));

  assert.equal(sarif.runs[0].tool.driver.rules.length, 1);
  assert.equal(sarif.runs[0].tool.driver.rules[0].id, "SG1001");
  assert.equal(sarif.runs[0].results.length, 2);
});
