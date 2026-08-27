import { createHash } from "node:crypto";
import type { NodeKind } from "./types.ts";

export function createNodeId(kind: NodeKind, file: string, identity: string): string {
  const hash = createHash("sha256")
    .update(`${kind}\0${file}\0${identity}`)
    .digest("hex")
    .slice(0, 16);
  return `${kind}:${hash}`;
}
