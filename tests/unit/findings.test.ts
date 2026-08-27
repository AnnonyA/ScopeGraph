import assert from "node:assert/strict";
import test from "node:test";
import { detectFindings } from "../../src/analysis/findings.ts";
import { analyzeModuleSource } from "../../src/frontends/javascript/analyzeModule.ts";

test("SG1001 is emitted only for a proven untrusted-to-shell path", () => {
  const unsafe = analyzeModuleSource("unsafe.ts", `import { exec } from "node:child_process"; export function run(input: { command: string }) { exec(input.command); }`);
  const safe = analyzeModuleSource("safe.ts", `import { exec } from "node:child_process"; exec("npm test");`);

  const unsafeFindings = detectFindings(unsafe.graph, unsafe.sources, unsafe.sinks);
  const safeFindings = detectFindings(safe.graph, safe.sources, safe.sinks);

  assert.equal(unsafeFindings.length, 1);
  assert.equal(unsafeFindings[0]?.ruleId, "SG1001");
  assert.equal(unsafeFindings[0]?.confidence, "PROVEN");
  assert.equal(unsafeFindings[0]?.evidence.length > 0, true);
  assert.equal(safeFindings.length, 0);
});
