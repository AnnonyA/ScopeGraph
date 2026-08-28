import { createHash } from "node:crypto";
import { posix } from "node:path";
import { parseDocument } from "yaml";
import { createNodeId } from "../../ir/ids.ts";
import type {
  AgentInstruction,
  Diagnostic,
  Evidence,
  SkillMetadata,
} from "../../ir/types.ts";

export interface InstructionAnalysis {
  instructions: AgentInstruction[];
  diagnostics: Diagnostic[];
}

function normalizedPath(filePath: string): string {
  return filePath.replaceAll("\\", "/");
}

function scopeFor(filePath: string): string {
  const scope = posix.dirname(normalizedPath(filePath));
  return scope === "." || scope === "" ? "." : scope;
}

function evidenceFor(filePath: string): Evidence[] {
  return [{ file: normalizedPath(filePath), startLine: 1 }];
}

function contentHash(source: string): string {
  return createHash("sha256").update(source, "utf8").digest("hex");
}

function stripMarkdownCode(source: string): string {
  const output: string[] = [];
  let fence: "`" | "~" | undefined;

  for (const line of source.split(/\r?\n/)) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/u)?.[1];
    if (marker) {
      const markerType = marker[0] as "`" | "~";
      if (!fence) {
        fence = markerType;
        continue;
      }
      if (fence === markerType) {
        fence = undefined;
        continue;
      }
    }
    if (fence) continue;
    output.push(line.replace(/`+[^`]*`+/gu, ""));
  }

  return output.join("\n");
}

function claudeImports(source: string): string[] {
  const imports = new Set<string>();
  const visible = stripMarkdownCode(source);
  const pattern = /@((?:\.{1,2}\/)?[A-Za-z0-9._~/-]+)/gu;
  for (const match of visible.matchAll(pattern)) {
    const value = match[1];
    if (value) imports.add(value);
  }
  return [...imports].sort();
}

function stringField(
  record: Record<string, unknown>,
  field: string,
): string | undefined {
  const value = record[field];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function allowedToolsField(value: unknown): string[] | undefined {
  if (typeof value === "string") {
    const tools = value.split(/\s+/u).map((tool) => tool.trim()).filter(Boolean);
    return tools.length ? tools : undefined;
  }
  if (Array.isArray(value)) {
    const tools = value
      .filter((tool): tool is string => typeof tool === "string" && Boolean(tool.trim()))
      .map((tool) => tool.trim());
    return tools.length ? tools : undefined;
  }
  return undefined;
}

function analyzeSkill(filePath: string, source: string): InstructionAnalysis {
  const evidence = evidenceFor(filePath);
  const frontmatter = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/u);
  if (!frontmatter?.[1]) {
    return {
      instructions: [],
      diagnostics: [{
        confidence: "UNKNOWN",
        message: "SKILL.md YAML frontmatter is missing or incomplete",
        evidence,
      }],
    };
  }

  const document = parseDocument(frontmatter[1], { prettyErrors: false });
  if (document.errors.length) {
    return {
      instructions: [],
      diagnostics: [{
        confidence: "UNKNOWN",
        message: "SKILL.md YAML frontmatter could not be parsed",
        evidence,
      }],
    };
  }

  const value: unknown = document.toJS();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      instructions: [],
      diagnostics: [{
        confidence: "UNKNOWN",
        message: "SKILL.md YAML frontmatter must be a mapping",
        evidence,
      }],
    };
  }

  const record = value as Record<string, unknown>;
  const name = stringField(record, "name");
  if (!name) {
    return {
      instructions: [],
      diagnostics: [{
        confidence: "UNKNOWN",
        message: "SKILL.md requires a non-empty name",
        evidence,
      }],
    };
  }

  const description = stringField(record, "description");
  if (!description) {
    return {
      instructions: [],
      diagnostics: [{
        confidence: "UNKNOWN",
        message: "SKILL.md requires a non-empty description",
        evidence,
      }],
    };
  }

  const license = stringField(record, "license");
  const compatibility = stringField(record, "compatibility");
  const allowedTools = allowedToolsField(record["allowed-tools"]);
  const skill: SkillMetadata = {
    name,
    description,
    ...(license ? { license } : {}),
    ...(compatibility ? { compatibility } : {}),
    ...(allowedTools ? { allowedTools } : {}),
  };

  const file = normalizedPath(filePath);
  return {
    instructions: [{
      id: createNodeId("skill", file, name),
      kind: "skill",
      file,
      scope: scopeFor(file),
      contentHash: contentHash(source),
      imports: [],
      skill,
      evidence,
    }],
    diagnostics: [],
  };
}

export function analyzeInstructionFile(filePath: string, source: string): InstructionAnalysis {
  const file = normalizedPath(filePath);
  const name = posix.basename(file);
  const scope = scopeFor(file);
  const evidence = evidenceFor(file);
  const hash = contentHash(source);

  if (name === "AGENTS.md" || name === "AGENTS.override.md") {
    return {
      instructions: [{
        id: createNodeId("agent-instruction", file, name),
        kind: "codex",
        file,
        scope,
        contentHash: hash,
        precedence: name === "AGENTS.override.md" ? "override" : "normal",
        imports: [],
        evidence,
      }],
      diagnostics: [],
    };
  }

  if (name === "CLAUDE.md") {
    return {
      instructions: [{
        id: createNodeId("agent-instruction", file, name),
        kind: "claude",
        file,
        scope,
        contentHash: hash,
        imports: claudeImports(source),
        evidence,
      }],
      diagnostics: [],
    };
  }

  if (name === "SKILL.md") return analyzeSkill(file, source);
  return { instructions: [], diagnostics: [] };
}
