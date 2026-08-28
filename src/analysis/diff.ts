import type { Finding } from "./findings.ts";
import type { ScanReport } from "../cli/scan.ts";
import type { AgentInstruction, Capability, McpTool } from "../ir/types.ts";

export interface ChangedTool {
  name: string;
  server: string;
  before: McpTool;
  after: McpTool;
  addedCapabilities: Capability[];
  removedCapabilities: Capability[];
  addedInputs: string[];
  removedInputs: string[];
}

export interface ChangedInstruction {
  kind: AgentInstruction["kind"];
  file: string;
  before: AgentInstruction;
  after: AgentInstruction;
  contentChanged: boolean;
  addedImports: string[];
  removedImports: string[];
  addedAllowedTools: string[];
  removedAllowedTools: string[];
}

export interface AuthorityDiff {
  beforeRoot: string;
  afterRoot: string;
  addedCapabilities: Capability[];
  removedCapabilities: Capability[];
  addedFindings: Finding[];
  removedFindings: Finding[];
  addedTools: McpTool[];
  removedTools: McpTool[];
  changedTools: ChangedTool[];
  addedInstructions: AgentInstruction[];
  removedInstructions: AgentInstruction[];
  changedInstructions: ChangedInstruction[];
}

function capabilityKey(capability: Capability): string {
  return `${capability.kind}\0${capability.source}\0${capability.target}`;
}

function findingKey(finding: Finding): string {
  return finding.signature;
}

function toolKey(tool: McpTool): string {
  return `${tool.server}\0${tool.name}`;
}

function annotationsKey(tool: McpTool): string {
  const annotations = tool.annotations;
  if (!annotations) return "";
  return [
    `readOnlyHint:${annotations.readOnlyHint ?? ""}`,
    `destructiveHint:${annotations.destructiveHint ?? ""}`,
    `idempotentHint:${annotations.idempotentHint ?? ""}`,
    `openWorldHint:${annotations.openWorldHint ?? ""}`,
  ].join("|");
}

function toolStateKey(tool: McpTool): string {
  return [
    [...tool.inputs].sort().join("\0"),
    annotationsKey(tool),
    tool.capabilities.map(capabilityKey).sort().join("\0"),
  ].join("\u0001");
}

function instructionKey(instruction: AgentInstruction): string {
  return `${instruction.kind}\0${instruction.file}`;
}

function instructionSortKey(instruction: AgentInstruction): string {
  return `${instruction.file}\0${instruction.kind}`;
}

function allowedTools(instruction: AgentInstruction): string[] {
  return [...(instruction.skill?.allowedTools ?? [])].sort();
}

function instructionStateKey(instruction: AgentInstruction): string {
  const skill = instruction.skill;
  return [
    instruction.contentHash,
    instruction.scope,
    instruction.precedence ?? "",
    [...instruction.imports].sort().join("\0"),
    skill?.name ?? "",
    skill?.description ?? "",
    skill?.license ?? "",
    skill?.compatibility ?? "",
    allowedTools(instruction).join("\0"),
  ].join("\u0001");
}

function semanticDelta<T>(
  before: readonly T[],
  after: readonly T[],
  key: (value: T) => string,
): { added: T[]; removed: T[] } {
  const beforeByKey = new Map(before.map((value) => [key(value), value]));
  const afterByKey = new Map(after.map((value) => [key(value), value]));

  const added = [...afterByKey]
    .filter(([semanticKey]) => !beforeByKey.has(semanticKey))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => value);

  const removed = [...beforeByKey]
    .filter(([semanticKey]) => !afterByKey.has(semanticKey))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => value);

  return { added, removed };
}

function stringDelta(before: readonly string[], after: readonly string[]): {
  added: string[];
  removed: string[];
} {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  return {
    added: [...afterSet].filter((value) => !beforeSet.has(value)).sort(),
    removed: [...beforeSet].filter((value) => !afterSet.has(value)).sort(),
  };
}

function toolDelta(before: readonly McpTool[], after: readonly McpTool[]): {
  added: McpTool[];
  removed: McpTool[];
  changed: ChangedTool[];
} {
  const beforeByKey = new Map(before.map((tool) => [toolKey(tool), tool]));
  const afterByKey = new Map(after.map((tool) => [toolKey(tool), tool]));

  const added = [...afterByKey]
    .filter(([key]) => !beforeByKey.has(key))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, tool]) => tool);
  const removed = [...beforeByKey]
    .filter(([key]) => !afterByKey.has(key))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, tool]) => tool);

  const changed = [...afterByKey]
    .filter(([key, tool]) => {
      const previous = beforeByKey.get(key);
      return previous !== undefined && toolStateKey(previous) !== toolStateKey(tool);
    })
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, tool]) => {
      const previous = beforeByKey.get(key)!;
      const capabilities = semanticDelta(
        previous.capabilities,
        tool.capabilities,
        capabilityKey,
      );
      const inputs = stringDelta(previous.inputs, tool.inputs);
      return {
        name: tool.name,
        server: tool.server,
        before: previous,
        after: tool,
        addedCapabilities: capabilities.added,
        removedCapabilities: capabilities.removed,
        addedInputs: inputs.added,
        removedInputs: inputs.removed,
      };
    });

  return { added, removed, changed };
}

function instructionDelta(
  before: readonly AgentInstruction[],
  after: readonly AgentInstruction[],
): {
  added: AgentInstruction[];
  removed: AgentInstruction[];
  changed: ChangedInstruction[];
} {
  const beforeByKey = new Map(before.map((instruction) => [instructionKey(instruction), instruction]));
  const afterByKey = new Map(after.map((instruction) => [instructionKey(instruction), instruction]));

  const added = [...afterByKey]
    .filter(([key]) => !beforeByKey.has(key))
    .sort(([, a], [, b]) => instructionSortKey(a).localeCompare(instructionSortKey(b)))
    .map(([, instruction]) => instruction);
  const removed = [...beforeByKey]
    .filter(([key]) => !afterByKey.has(key))
    .sort(([, a], [, b]) => instructionSortKey(a).localeCompare(instructionSortKey(b)))
    .map(([, instruction]) => instruction);

  const changed = [...afterByKey]
    .filter(([key, instruction]) => {
      const previous = beforeByKey.get(key);
      return previous !== undefined
        && instructionStateKey(previous) !== instructionStateKey(instruction);
    })
    .sort(([, a], [, b]) => instructionSortKey(a).localeCompare(instructionSortKey(b)))
    .map(([key, instruction]) => {
      const previous = beforeByKey.get(key)!;
      const imports = stringDelta(previous.imports, instruction.imports);
      const tools = stringDelta(allowedTools(previous), allowedTools(instruction));
      return {
        kind: instruction.kind,
        file: instruction.file,
        before: previous,
        after: instruction,
        contentChanged: previous.contentHash !== instruction.contentHash,
        addedImports: imports.added,
        removedImports: imports.removed,
        addedAllowedTools: tools.added,
        removedAllowedTools: tools.removed,
      };
    });

  return { added, removed, changed };
}

export function diffReports(before: ScanReport, after: ScanReport): AuthorityDiff {
  const capabilities = semanticDelta(before.capabilities, after.capabilities, capabilityKey);
  const findings = semanticDelta(before.findings, after.findings, findingKey);
  const tools = toolDelta(before.mcpTools ?? [], after.mcpTools ?? []);
  const instructions = instructionDelta(
    before.agentInstructions ?? [],
    after.agentInstructions ?? [],
  );

  return {
    beforeRoot: before.root,
    afterRoot: after.root,
    addedCapabilities: capabilities.added,
    removedCapabilities: capabilities.removed,
    addedFindings: findings.added,
    removedFindings: findings.removed,
    addedTools: tools.added,
    removedTools: tools.removed,
    changedTools: tools.changed,
    addedInstructions: instructions.added,
    removedInstructions: instructions.removed,
    changedInstructions: instructions.changed,
  };
}
