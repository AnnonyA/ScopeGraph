import type { AuthorityDiff } from "../analysis/diff.ts";

export function renderDiffJson(diff: AuthorityDiff): string {
  return `${JSON.stringify(diff, null, 2)}\n`;
}
