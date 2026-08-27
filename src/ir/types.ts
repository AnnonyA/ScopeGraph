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
  | "skill";

export type EdgeKind =
  | "controls"
  | "passes-to"
  | "calls"
  | "reads"
  | "writes"
  | "executes"
  | "sends-to";

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
