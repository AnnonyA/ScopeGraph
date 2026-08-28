import type { AuthorityDiff } from "../analysis/diff.ts";
import type { Evidence } from "../ir/types.ts";

function inlineCode(value: string): string {
  return `\`${value.replace(/`/g, "\\`")}\``;
}

function evidenceLocation(evidence: readonly Evidence[]): string | undefined {
  const first = evidence[0];
  if (!first) return undefined;
  return first.startLine ? `${first.file}:${first.startLine}` : first.file;
}

function hasBlockingFinding(diff: AuthorityDiff): boolean {
  return diff.addedFindings.some(
    (finding) => finding.severity === "critical" || finding.severity === "high",
  );
}

export function renderDiffMarkdown(diff: AuthorityDiff): string {
  const lines = [
    "## ScopeGraph Authority Diff",
    "",
    `**Before:** ${inlineCode(diff.beforeRoot)}`,
    `**After:** ${inlineCode(diff.afterRoot)}`,
  ];

  if (diff.addedCapabilities.length) {
    lines.push("", "### Added authority");
    for (const capability of diff.addedCapabilities) {
      const location = evidenceLocation(capability.evidence);
      const suffix = location ? ` — ${inlineCode(location)}` : "";
      lines.push(
        `- ${inlineCode(capability.kind)} — ${capability.source} → ${inlineCode(capability.target)}${suffix}`,
      );
    }
  }

  if (diff.removedCapabilities.length) {
    lines.push("", "### Removed authority");
    for (const capability of diff.removedCapabilities) {
      lines.push(`- ${inlineCode(capability.kind)} — ${capability.source} → ${inlineCode(capability.target)}`);
    }
  }

  if (diff.addedTools.length) {
    lines.push("", "### Added MCP tools");
    for (const tool of diff.addedTools) {
      lines.push(`- ${inlineCode(tool.name)} (${tool.sdkStyle})`);
      for (const capability of tool.capabilities) {
        lines.push(`  - ${inlineCode(capability.kind)} → ${inlineCode(capability.target)}`);
      }
    }
  }

  if (diff.removedTools.length) {
    lines.push("", "### Removed MCP tools");
    for (const tool of diff.removedTools) {
      lines.push(`- ${inlineCode(tool.name)} (${tool.sdkStyle})`);
    }
  }

  if (diff.changedTools.length) {
    lines.push("", "### Changed MCP tools");
    for (const tool of diff.changedTools) {
      lines.push("", `#### ${inlineCode(tool.name)}`);
      if (tool.addedCapabilities.length) {
        lines.push("", "Added authority:");
        for (const capability of tool.addedCapabilities) {
          lines.push(`- + ${inlineCode(capability.kind)} → ${inlineCode(capability.target)}`);
        }
      }
      if (tool.removedCapabilities.length) {
        lines.push("", "Removed authority:");
        for (const capability of tool.removedCapabilities) {
          lines.push(`- - ${inlineCode(capability.kind)} → ${inlineCode(capability.target)}`);
        }
      }
      if (tool.addedInputs.length) {
        lines.push("", "Added inputs:");
        for (const input of tool.addedInputs) lines.push(`- + ${inlineCode(input)}`);
      }
      if (tool.removedInputs.length) {
        lines.push("", "Removed inputs:");
        for (const input of tool.removedInputs) lines.push(`- - ${inlineCode(input)}`);
      }
    }
  }

  if (diff.addedInstructions.length) {
    lines.push("", "### Added agent instructions");
    for (const instruction of diff.addedInstructions) {
      lines.push(
        `- ${inlineCode(instruction.kind)} ${inlineCode(instruction.file)} — scope ${inlineCode(instruction.scope)}`,
      );
      if (instruction.imports.length) {
        lines.push(`  - imports: ${instruction.imports.map(inlineCode).join(", ")}`);
      }
      if (instruction.skill?.allowedTools?.length) {
        lines.push(`  - allowed tools: ${instruction.skill.allowedTools.map(inlineCode).join(", ")}`);
      }
    }
  }

  if (diff.removedInstructions.length) {
    lines.push("", "### Removed agent instructions");
    for (const instruction of diff.removedInstructions) {
      lines.push(
        `- ${inlineCode(instruction.kind)} ${inlineCode(instruction.file)} — scope ${inlineCode(instruction.scope)}`,
      );
    }
  }

  if (diff.changedInstructions.length) {
    lines.push("", "### Changed agent instructions");
    for (const instruction of diff.changedInstructions) {
      lines.push("", `#### ${inlineCode(instruction.file)}`);
      lines.push(`- kind: ${inlineCode(instruction.kind)}`);
      if (instruction.contentChanged) lines.push("- content changed");
      for (const imported of instruction.addedImports) {
        lines.push(`- + import ${inlineCode(imported)}`);
      }
      for (const imported of instruction.removedImports) {
        lines.push(`- - import ${inlineCode(imported)}`);
      }
      for (const tool of instruction.addedAllowedTools) {
        lines.push(`- + allowed tool ${inlineCode(tool)}`);
      }
      for (const tool of instruction.removedAllowedTools) {
        lines.push(`- - allowed tool ${inlineCode(tool)}`);
      }
    }
  }

  if (diff.addedFindings.length) {
    lines.push("", "### New findings");
    for (const finding of diff.addedFindings) {
      const location = evidenceLocation(finding.evidence);
      const suffix = location ? ` — ${inlineCode(location)}` : "";
      lines.push(
        `- ${finding.severity.toUpperCase()} ${inlineCode(finding.ruleId)} — ${finding.title}${suffix}`,
      );
    }
  }

  if (diff.removedFindings.length) {
    lines.push("", "### Resolved findings");
    for (const finding of diff.removedFindings) {
      lines.push(`- ${finding.severity.toUpperCase()} ${inlineCode(finding.ruleId)} — ${finding.title}`);
    }
  }

  const changed =
    diff.addedCapabilities.length > 0
    || diff.removedCapabilities.length > 0
    || diff.addedFindings.length > 0
    || diff.removedFindings.length > 0
    || diff.addedTools.length > 0
    || diff.removedTools.length > 0
    || diff.changedTools.length > 0
    || diff.addedInstructions.length > 0
    || diff.removedInstructions.length > 0
    || diff.changedInstructions.length > 0;

  if (!changed) {
    lines.push("", "No semantic authority changes detected.");
  }

  lines.push(
    "",
    hasBlockingFinding(diff)
      ? "**Result: ❌ new high/critical finding detected**"
      : "**Result: ✅ no new high/critical findings**",
  );

  return `${lines.join("\n")}\n`;
}
