import type { ScanReport } from "../cli/scan.ts";

export function renderTerminal(report: ScanReport): string {
  const lines = [
    "ScopeGraph",
    "",
    `Analyzed: ${report.filesAnalyzed} JavaScript / TypeScript file${report.filesAnalyzed === 1 ? "" : "s"}`,
    `MCP servers: ${report.mcpServers}`,
    `Capabilities: ${report.capabilities.length}`,
    `Findings: ${report.findings.length}`,
  ];

  if (report.capabilities.length) {
    lines.push("", "Authority");
    for (const capability of report.capabilities) {
      lines.push(`${capability.kind}  ${capability.source} -> ${capability.target}`);
    }
  }

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
