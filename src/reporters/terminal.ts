import type { ScanReport } from "../cli/scan.ts";

export function renderTerminal(report: ScanReport): string {
  const lines = [
    "ScopeGraph",
    "",
    `Analyzed: ${report.filesAnalyzed} JavaScript / TypeScript file${report.filesAnalyzed === 1 ? "" : "s"}`,
    `Findings: ${report.findings.length}`,
  ];

  for (const finding of report.findings) {
    lines.push(
      "",
      `${finding.severity.toUpperCase()} ${finding.ruleId}`,
      finding.title,
      `Confidence: ${finding.confidence}`,
    );
  }

  if (report.diagnostics.length) {
    lines.push("", `Unresolved: ${report.diagnostics.length}`);
  }

  return `${lines.join("\n")}\n`;
}
