export type Confidence = "PROVEN" | "UNKNOWN";

export type NodeKind =
  | "repository-content"
  | "user-input"
  | "tool-output"
  | "function"
  | "command"
  | "process"
  | "file"
  | "environment"
  | "network"
  | "tool"
  | "skill"
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
  | "exposes";

export type CapabilityKind =
  | "process.spawn"
  | "network.connect"
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
