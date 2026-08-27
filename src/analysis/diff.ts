import type { Finding } from "./findings.ts";
import type { ScanReport } from "../cli/scan.ts";
import type { Capability } from "../ir/types.ts";

export interface AuthorityDiff {
  beforeRoot: string;
  afterRoot: string;
  addedCapabilities: Capability[];
  removedCapabilities: Capability[];
  addedFindings: Finding[];
  removedFindings: Finding[];
}

function capabilityKey(capability: Capability): string {
  return `${capability.kind}\0${capability.source}\0${capability.target}`;
}

function findingKey(finding: Finding): string {
  return finding.signature;
}

function semanticDelta<T>(
  before: readonly T[],
  after: readonly T[],
  key: (value: T) => string,
): { added: T[]; removed: T[] } {
  const beforeByKey = new Map(before.map((value) => [key(value), value]));
  const afterByKey = new Map(after.map((value) => [key(value), value]));

  const added = [...afterByKey]
    .filter(([semanticKey]) => !beforeByKey.has(semanticKey))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => value);

  const removed = [...beforeByKey]
    .filter(([semanticKey]) => !afterByKey.has(semanticKey))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => value);

  return { added, removed };
}

export function diffReports(before: ScanReport, after: ScanReport): AuthorityDiff {
  const capabilities = semanticDelta(before.capabilities, after.capabilities, capabilityKey);
  const findings = semanticDelta(before.findings, after.findings, findingKey);

  return {
    beforeRoot: before.root,
    afterRoot: after.root,
    addedCapabilities: capabilities.added,
    removedCapabilities: capabilities.removed,
    addedFindings: findings.added,
    removedFindings: findings.removed,
  };
}
