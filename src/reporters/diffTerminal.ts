import type { AuthorityDiff } from "../analysis/diff.ts";

export function renderDiffTerminal(diff: AuthorityDiff): string {
  const lines = [
    "ScopeGraph Authority Diff",
    "",
    `Before: ${diff.beforeRoot}`,
    `After:  ${diff.afterRoot}`,
  ];

  if (diff.addedCapabilities.length) {
    lines.push("", "Added authority");
    for (const capability of diff.addedCapabilities) {
      lines.push(`+ ${capability.kind}  ${capability.source} -> ${capability.target}`);
    }
  }

  if (diff.removedCapabilities.length) {
    lines.push("", "Removed authority");
    for (const capability of diff.removedCapabilities) {
      lines.push(`- ${capability.kind}  ${capability.source} -> ${capability.target}`);
    }
  }

  if (diff.addedFindings.length) {
    lines.push("", "New findings");
    for (const finding of diff.addedFindings) {
      lines.push(`+ ${finding.severity.toUpperCase()} ${finding.ruleId}  ${finding.title}`);
    }
  }

  if (diff.removedFindings.length) {
    lines.push("", "Resolved findings");
    for (const finding of diff.removedFindings) {
      lines.push(`- ${finding.severity.toUpperCase()} ${finding.ruleId}  ${finding.title}`);
    }
  }

  if (
    diff.addedCapabilities.length === 0
    && diff.removedCapabilities.length === 0
    && diff.addedFindings.length === 0
    && diff.removedFindings.length === 0
  ) {
    lines.push("", "No semantic authority changes detected.");
  }

  return `${lines.join("\n")}\n`;
}
