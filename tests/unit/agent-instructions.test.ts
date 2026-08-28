import assert from "node:assert/strict";
import test from "node:test";
import { analyzeInstructionFile } from "../../src/frontends/instructions/analyzeInstructionFile.ts";

test("Codex instruction files preserve directory scope and override precedence", () => {
  const root = analyzeInstructionFile("AGENTS.md", "# Root instructions\n");
  const nested = analyzeInstructionFile("packages/api/AGENTS.override.md", "# API override\n");

  assert.equal(root.instructions.length, 1);
  assert.equal(root.instructions[0]?.kind, "codex");
  assert.equal(root.instructions[0]?.scope, ".");
  assert.equal(root.instructions[0]?.precedence, "normal");

  assert.equal(nested.instructions.length, 1);
  assert.equal(nested.instructions[0]?.kind, "codex");
  assert.equal(nested.instructions[0]?.scope, "packages/api");
  assert.equal(nested.instructions[0]?.precedence, "override");
});

test("instruction content hashes are deterministic and change with the body", () => {
  const first = analyzeInstructionFile("AGENTS.md", "# Root instructions\n");
  const same = analyzeInstructionFile("AGENTS.md", "# Root instructions\n");
  const changed = analyzeInstructionFile("AGENTS.md", "# Different instructions\n");

  assert.match(first.instructions[0]?.contentHash ?? "", /^[a-f0-9]{64}$/);
  assert.equal(first.instructions[0]?.contentHash, same.instructions[0]?.contentHash);
  assert.notEqual(first.instructions[0]?.contentHash, changed.instructions[0]?.contentHash);
});

test("Claude instruction files extract literal imports outside Markdown code", () => {
  const result = analyzeInstructionFile("packages/app/CLAUDE.md", `
Read @README.md and @docs/rules.md before editing.

Ignore \`@inline-example.md\` here.

\`\`\`text
@fenced-example.md
\`\`\`
`);

  assert.equal(result.instructions.length, 1);
  assert.equal(result.instructions[0]?.kind, "claude");
  assert.equal(result.instructions[0]?.scope, "packages/app");
  assert.deepEqual(result.instructions[0]?.imports, ["README.md", "docs/rules.md"]);
  assert.equal(result.diagnostics.length, 0);
});

test("SKILL.md preserves required metadata and allowed tools", () => {
  const result = analyzeInstructionFile(".agents/skills/repo-review/SKILL.md", `---
name: repo-review
description: Review repository changes safely.
license: MIT
compatibility: Requires git
allowed-tools: Read Grep Bash(git:*)
---
# Repository review
`);

  assert.equal(result.instructions.length, 1);
  assert.equal(result.instructions[0]?.kind, "skill");
  assert.equal(result.instructions[0]?.scope, ".agents/skills/repo-review");
  assert.deepEqual(result.instructions[0]?.skill, {
    name: "repo-review",
    description: "Review repository changes safely.",
    license: "MIT",
    compatibility: "Requires git",
    allowedTools: ["Read", "Grep", "Bash(git:*)"],
  });
  assert.equal(result.diagnostics.length, 0);
});

test("invalid SKILL.md metadata becomes UNKNOWN instead of a usable skill", () => {
  const missingDescription = analyzeInstructionFile("skills/broken/SKILL.md", `---
name: broken
---
# Missing description
`);
  const malformed = analyzeInstructionFile("skills/malformed/SKILL.md", `---
name: malformed
description: [unterminated
---
`);

  assert.equal(missingDescription.instructions.length, 0);
  assert.equal(missingDescription.diagnostics.some((diagnostic) =>
    diagnostic.confidence === "UNKNOWN" && diagnostic.message.includes("description")
  ), true);

  assert.equal(malformed.instructions.length, 0);
  assert.equal(malformed.diagnostics.some((diagnostic) =>
    diagnostic.confidence === "UNKNOWN" && diagnostic.message.includes("YAML")
  ), true);
});
