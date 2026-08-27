import type { ScanReport } from "../cli/scan.ts";

export function renderJson(report: ScanReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
