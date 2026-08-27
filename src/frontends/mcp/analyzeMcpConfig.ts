import { AgentGraph } from "../../ir/graph.ts";
import { createNodeId } from "../../ir/ids.ts";
import type {
  Capability,
  CapabilityKind,
  Diagnostic,
  Evidence,
} from "../../ir/types.ts";

export interface McpConfigAnalysis {
  graph: AgentGraph;
  capabilities: Capability[];
  serverIds: Set<string>;
  diagnostics: Diagnostic[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function capabilityOrder(a: Capability, b: Capability): number {
  return `${a.source}:${a.kind}:${a.target}`.localeCompare(
    `${b.source}:${b.kind}:${b.target}`,
  );
}

export function analyzeMcpConfig(filePath: string, source: string): McpConfigAnalysis {
  const graph = new AgentGraph();
  const capabilities: Capability[] = [];
  const serverIds = new Set<string>();
  const diagnostics: Diagnostic[] = [];
  const fileEvidence: Evidence[] = [{ file: filePath }];

  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch {
    diagnostics.push({
      confidence: "UNKNOWN",
      message: "Invalid MCP JSON configuration",
      evidence: fileEvidence,
    });
    return { graph, capabilities, serverIds, diagnostics };
  }

  if (!isRecord(parsed) || !isRecord(parsed.mcpServers)) {
    diagnostics.push({
      confidence: "UNKNOWN",
      message: "MCP configuration does not contain an mcpServers object",
      evidence: fileEvidence,
    });
    return { graph, capabilities, serverIds, diagnostics };
  }

  const addCapability = (
    serverName: string,
    serverId: string,
    kind: CapabilityKind,
    target: string,
  ): void => {
    const id = createNodeId("capability", filePath, `${serverName}:${kind}:${target}`);
    const capability: Capability = {
      id,
      kind,
      source: serverName,
      target,
      evidence: fileEvidence,
    };
    capabilities.push(capability);
    graph.addNode({ id, kind: "capability", label: kind, evidence: fileEvidence });
    graph.addEdge({ from: serverId, to: id, kind: "exposes", evidence: fileEvidence });
  };

  for (const serverName of Object.keys(parsed.mcpServers).sort()) {
    const rawServer = parsed.mcpServers[serverName];
    if (!isRecord(rawServer)) {
      diagnostics.push({
        confidence: "UNKNOWN",
        message: `MCP server "${serverName}" has an unsupported configuration shape`,
        evidence: fileEvidence,
      });
      continue;
    }

    const serverId = createNodeId("mcp-server", filePath, serverName);
    serverIds.add(serverId);
    graph.addNode({
      id: serverId,
      kind: "mcp-server",
      label: serverName,
      evidence: fileEvidence,
    });

    if (typeof rawServer.command === "string" && rawServer.command.trim() !== "") {
      const command = rawServer.command.trim();
      const processId = createNodeId("process", filePath, `${serverName}:process:${command}`);
      graph.addNode({
        id: processId,
        kind: "process",
        label: command,
        evidence: fileEvidence,
      });
      graph.addEdge({
        from: serverId,
        to: processId,
        kind: "spawns",
        evidence: fileEvidence,
      });
      addCapability(serverName, serverId, "process.spawn", command);
    }

    if (isRecord(rawServer.env)) {
      for (const key of Object.keys(rawServer.env).sort()) {
        const environmentId = createNodeId(
          "environment",
          filePath,
          `${serverName}:env:${key}`,
        );
        graph.addNode({
          id: environmentId,
          kind: "environment",
          label: key,
          evidence: fileEvidence,
        });
        graph.addEdge({
          from: serverId,
          to: environmentId,
          kind: "exposes",
          evidence: fileEvidence,
        });
        addCapability(serverName, serverId, "environment.expose", key);
      }
    }

    if (typeof rawServer.url === "string") {
      try {
        const url = new URL(rawServer.url);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          throw new Error("unsupported protocol");
        }
        const origin = url.origin;
        const networkId = createNodeId(
          "network",
          filePath,
          `${serverName}:network:${origin}`,
        );
        graph.addNode({
          id: networkId,
          kind: "network",
          label: origin,
          evidence: fileEvidence,
        });
        graph.addEdge({
          from: serverId,
          to: networkId,
          kind: "connects",
          evidence: fileEvidence,
        });
        addCapability(serverName, serverId, "network.connect", origin);
      } catch {
        diagnostics.push({
          confidence: "UNKNOWN",
          message: `MCP server "${serverName}" has an invalid or unsupported URL`,
          evidence: fileEvidence,
        });
      }
    }
  }

  capabilities.sort(capabilityOrder);
  return { graph, capabilities, serverIds, diagnostics };
}
