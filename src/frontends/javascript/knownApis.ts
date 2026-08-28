import type { CapabilityKind } from "../../ir/types.ts";

export const processExecutionApis = new Set([
  "exec",
  "execSync",
  "spawn",
  "spawnSync",
]);

export const filesystemWriteApis = new Set([
  "writeFile",
  "writeFileSync",
  "appendFile",
  "appendFileSync",
]);

export function isChildProcessModule(name: string): boolean {
  return name === "node:child_process" || name === "child_process";
}

export function isFileSystemModule(name: string): boolean {
  return name === "node:fs"
    || name === "fs"
    || name === "node:fs/promises"
    || name === "fs/promises";
}

export function executionCapability(apiName: string): CapabilityKind | undefined {
  if (apiName === "exec" || apiName === "execSync") return "shell.execute";
  if (apiName === "spawn" || apiName === "spawnSync") return "process.spawn";
  return undefined;
}
