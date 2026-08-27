import type { ScanReport } from "../cli/scan.ts";

export function renderTerminal(report: ScanReport): string {
  const lines = [
    "ScopeGraph",
    "",
    `Analyzed: ${report.filesAnalyzed} JavaScript / TypeScript file${report.filesAnalyzed === 1 ? "" : "s"}`,
    `MCP servers: ${report.mcpServers}`,
    `MCP tools: ${report.mcpTools.length}`,
    `Capabilities: ${report.capabilities.length}`,
    `Findings: ${report.findings.length}`,
  ];

  if (report.mcpTools.length) {
    lines.push("", "MCP tools");
    for (const tool of report.mcpTools) {
      lines.push(`${tool.name} (${tool.sdkStyle})`);
      for (const input of tool.inputs) lines.push(`  input: ${input}`);
      if (tool.capabilities.length === 0) {
        lines.push("  no dangerous capability proven");
      } else {
        for (const capability of tool.capabilities) {
          lines.push(`  ${capability.kind} -> ${capability.target}`);
        }
      }
    }
  }

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
