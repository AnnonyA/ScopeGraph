export type McpSdkStyle = "v1" | "v2";

export function mcpSdkStyleForModule(moduleName: string): McpSdkStyle | undefined {
  if (
    moduleName === "@modelcontextprotocol/server"
    || moduleName.startsWith("@modelcontextprotocol/server/")
  ) {
    return "v2";
  }
  if (moduleName.startsWith("@modelcontextprotocol/sdk/server/mcp")) {
    return "v1";
  }
  return undefined;
}
