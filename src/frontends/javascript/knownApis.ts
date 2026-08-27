export const processExecutionApis = new Set([
  "exec",
  "execSync",
  "spawn",
  "spawnSync",
]);

export function isChildProcessModule(name: string): boolean {
  return name === "node:child_process" || name === "child_process";
}
