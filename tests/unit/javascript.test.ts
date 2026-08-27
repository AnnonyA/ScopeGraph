import assert from "node:assert/strict";
import test from "node:test";
import { findPaths } from "../../src/analysis/taint.ts";
import { analyzeModuleSource } from "../../src/frontends/javascript/analyzeModule.ts";

const direct = `
import { exec } from "node:child_process";
export function run(input: { command: string }) {
  const command = input.command;
  exec(command);
}
`;

const aliased = `
import { exec } from "node:child_process";
const runCommand = exec;
export function run(input: { command: string }) {
  runCommand(input.command);
}
`;

test("JS frontend proves direct and aliased untrusted command flows", () => {
  for (const source of [direct, aliased]) {
    const analysis = analyzeModuleSource("tool.ts", source);
    assert.equal(findPaths(analysis.graph, analysis.sources, analysis.sinks).length, 1);
    assert.equal(analysis.diagnostics.length, 0);
  }
});

test("JS frontend does not taint a static command literal", () => {
  const analysis = analyzeModuleSource("safe.ts", `import { exec } from "node:child_process"; exec("npm test");`);
  assert.equal(findPaths(analysis.graph, analysis.sources, analysis.sinks).length, 0);
});

test("JS frontend records unsupported computed calls as UNKNOWN instead of inventing a path", () => {
  const analysis = analyzeModuleSource("dynamic.ts", `const fn = globalThis[getName()]; fn(input.command);`);
  assert.equal(analysis.diagnostics.some((d) => d.confidence === "UNKNOWN"), true);
  assert.equal(findPaths(analysis.graph, analysis.sources, analysis.sinks).length, 0);
});
