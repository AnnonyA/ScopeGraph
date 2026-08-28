export type Confidence = "PROVEN" | "UNKNOWN";

export type NodeKind =
  | "repository-content"
  | "user-input"
  | "mcp-tool-input"
  | "tool-output"
  | "function"
  | "command"
  | "process"
  | "file"
  | "environment"
  | "network"
  | "tool"
  | "skill"
  | "agent-instruction"
  | "mcp-server"
  | "capability";

export type EdgeKind =
  | "controls"
  | "passes-to"
  | "calls"
  | "reads"
  | "writes"
  | "executes"
  | "sends-to"
  | "spawns"
  | "connects"
  | "exposes"
  | "registers"
  | "invokes";

export type CapabilityKind =
  | "process.spawn"
  | "shell.execute"
  | "filesystem.write"
  | "environment.read"
  | "network.connect"
  | "network.send"
  | "environment.expose";

export interface Evidence {
  file: string;
  startLine?: number;
  endLine?: number;
  symbol?: string;
}

export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  evidence: Evidence[];
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  evidence: Evidence[];
}

export interface Diagnostic {
  confidence: "UNKNOWN";
  message: string;
  evidence: Evidence[];
}

export interface Capability {
  id: string;
  kind: CapabilityKind;
  source: string;
  target: string;
  evidence: Evidence[];
}

export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface McpTool {
  id: string;
  name: string;
  server: string;
  sdkStyle: "v2" | "v1";
  inputs: string[];
  annotations?: ToolAnnotations;
  capabilities: Capability[];
  evidence: Evidence[];
}

export type AgentInstructionKind = "codex" | "claude" | "skill";

export interface SkillMetadata {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  allowedTools?: string[];
}

export interface AgentInstruction {
  id: string;
  kind: AgentInstructionKind;
  file: string;
  scope: string;
  contentHash: string;
  precedence?: "normal" | "override";
  imports: string[];
  skill?: SkillMetadata;
  evidence: Evidence[];
}
