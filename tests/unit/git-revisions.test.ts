import assert from "node:assert/strict";
import test from "node:test";
import { parseRevisionRange } from "../../src/git/revisions.ts";

test("parseRevisionRange accepts exactly one two-dot Git range", () => {
  assert.deepEqual(parseRevisionRange("main..feature"), {
    before: "main",
    after: "feature",
  });
  assert.deepEqual(parseRevisionRange("  HEAD~1..HEAD  "), {
    before: "HEAD~1",
    after: "HEAD",
  });
});

test("parseRevisionRange rejects triple-dot and incomplete ranges", () => {
  for (const input of ["main...feature", "..feature", "main..", "main", "a..b..c"]) {
    assert.throws(() => parseRevisionRange(input));
  }
});
