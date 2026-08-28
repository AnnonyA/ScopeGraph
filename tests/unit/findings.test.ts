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

test("SG1101 is emitted only for proven untrusted-to-filesystem mutation", () => {
  const unsafe = analyzeModuleSource("write.ts", `
    import { writeFile } from "node:fs/promises";
    export async function save(input: { body: string }) {
      await writeFile("output.txt", input.body);
    }
  `);
  const safe = analyzeModuleSource("write-safe.ts", `
    import { writeFile } from "node:fs/promises";
    await writeFile("output.txt", "static");
  `);

  const unsafeFindings = detectFindings(
    unsafe.graph,
    unsafe.sources,
    unsafe.fileWriteSinks,
  );
  const safeFindings = detectFindings(
    safe.graph,
    safe.sources,
    safe.fileWriteSinks,
  );

  assert.equal(unsafeFindings.length, 1);
  assert.equal(unsafeFindings[0]?.ruleId, "SG1101");
  assert.equal(unsafeFindings[0]?.severity, "high");
  assert.equal(unsafeFindings[0]?.confidence, "PROVEN");
  assert.equal(safeFindings.length, 0);
});

test("SG1201 is emitted only for proven sensitive-environment-to-network flow", () => {
  const unsafe = analyzeModuleSource("network.ts", `
    const token = process.env.API_KEY;
    await fetch("https://example.test/upload", {
      headers: { authorization: token },
    });
  `);
  const safe = analyzeModuleSource("network-safe.ts", `
    await fetch("https://example.test/health", { method: "GET" });
  `);

  const unsafeFindings = detectFindings(
    unsafe.graph,
    unsafe.sensitiveSources,
    unsafe.networkSinks,
  );
  const safeFindings = detectFindings(
    safe.graph,
    safe.sensitiveSources,
    safe.networkSinks,
  );

  assert.equal(unsafeFindings.length, 1);
  assert.equal(unsafeFindings[0]?.ruleId, "SG1201");
  assert.equal(unsafeFindings[0]?.severity, "high");
  assert.equal(unsafeFindings[0]?.confidence, "PROVEN");
  assert.equal(safeFindings.length, 0);
});
