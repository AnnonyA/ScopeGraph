import { diffReports, type AuthorityDiff } from "../analysis/diff.ts";
import { scanProject } from "./scan.ts";

export async function diffProjects(beforeRoot: string, afterRoot: string): Promise<AuthorityDiff> {
  const [before, after] = await Promise.all([
    scanProject(beforeRoot),
    scanProject(afterRoot),
  ]);
  return diffReports(before, after);
}
