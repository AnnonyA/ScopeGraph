import type { CapabilityKind } from "../../ir/types.ts";

export const processExecutionApis = new Set([
  "exec",
  "execSync",
  "spawn",
  "spawnSync",
]);

export function isChildProcessModule(name: string): boolean {
  return name === "node:child_process" || name === "child_process";
}

export function executionCapability(apiName: string): CapabilityKind | undefined {
  if (apiName === "exec" || apiName === "execSync") return "shell.execute";
  if (apiName === "spawn" || apiName === "spawnSync") return "process.spawn";
  return undefined;
}
