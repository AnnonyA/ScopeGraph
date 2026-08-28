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

  if (diff.addedTools.length) {
    lines.push("", "Added MCP tools");
    for (const tool of diff.addedTools) {
      lines.push(`+ ${tool.name} (${tool.sdkStyle})`);
      for (const capability of tool.capabilities) {
        lines.push(`  + ${capability.kind} -> ${capability.target}`);
      }
    }
  }

  if (diff.removedTools.length) {
    lines.push("", "Removed MCP tools");
    for (const tool of diff.removedTools) {
      lines.push(`- ${tool.name} (${tool.sdkStyle})`);
    }
  }

  if (diff.changedTools.length) {
    lines.push("", "Changed MCP tools");
    for (const tool of diff.changedTools) {
      lines.push(`~ ${tool.name}`);
      for (const capability of tool.addedCapabilities) {
        lines.push(`  + ${capability.kind} -> ${capability.target}`);
      }
      for (const capability of tool.removedCapabilities) {
        lines.push(`  - ${capability.kind} -> ${capability.target}`);
      }
      for (const input of tool.addedInputs) lines.push(`  + input ${input}`);
      for (const input of tool.removedInputs) lines.push(`  - input ${input}`);
    }
  }

  if (diff.addedInstructions.length) {
    lines.push("", "Added agent instructions");
    for (const instruction of diff.addedInstructions) {
      lines.push(`+ ${instruction.kind}  ${instruction.file}  scope=${instruction.scope}`);
      if (instruction.imports.length) {
        lines.push(`  imports: ${instruction.imports.join(", ")}`);
      }
      if (instruction.skill?.allowedTools?.length) {
        lines.push(`  allowed tools: ${instruction.skill.allowedTools.join(", ")}`);
      }
    }
  }

  if (diff.removedInstructions.length) {
    lines.push("", "Removed agent instructions");
    for (const instruction of diff.removedInstructions) {
      lines.push(`- ${instruction.kind}  ${instruction.file}  scope=${instruction.scope}`);
    }
  }

  if (diff.changedInstructions.length) {
    lines.push("", "Changed agent instructions");
    for (const instruction of diff.changedInstructions) {
      lines.push(`~ ${instruction.kind}  ${instruction.file}`);
      if (instruction.contentChanged) lines.push("  content changed");
      for (const imported of instruction.addedImports) lines.push(`  + import ${imported}`);
      for (const imported of instruction.removedImports) lines.push(`  - import ${imported}`);
      for (const tool of instruction.addedAllowedTools) lines.push(`  + allowed tool ${tool}`);
      for (const tool of instruction.removedAllowedTools) lines.push(`  - allowed tool ${tool}`);
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
    && diff.addedTools.length === 0
    && diff.removedTools.length === 0
    && diff.changedTools.length === 0
    && diff.addedInstructions.length === 0
    && diff.removedInstructions.length === 0
    && diff.changedInstructions.length === 0
  ) {
    lines.push("", "No semantic authority changes detected.");
  }

  return `${lines.join("\n")}\n`;
}
