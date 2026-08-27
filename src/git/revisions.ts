import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import type { AuthorityDiff } from "../analysis/diff.ts";
import { diffProjects } from "../cli/diff.ts";

const execFileAsync = promisify(execFile);

export interface RevisionRange {
  before: string;
  after: string;
}

export function parseRevisionRange(input: string): RevisionRange {
  const value = input.trim();
  if (value.includes("...")) {
    throw new Error("ScopeGraph Git diff requires a two-dot range such as main..feature");
  }

  const parts = value.split("..");
  if (parts.length !== 2) {
    throw new Error("ScopeGraph Git diff requires exactly one two-dot revision range");
  }

  const before = parts[0]?.trim() ?? "";
  const after = parts[1]?.trim() ?? "";
  if (!before || !after) {
    throw new Error("Both revisions in a ScopeGraph Git diff must be non-empty");
  }

  return { before, after };
}

async function git(repoRoot: string, args: string[]): Promise<string> {
  const result = await execFileAsync("git", ["-C", repoRoot, ...args], {
    encoding: "utf8",
    windowsHide: true,
  });
  return String(result.stdout).trim();
}

async function resolveCommit(repoRoot: string, ref: string): Promise<string> {
  const sha = await git(repoRoot, ["rev-parse", "--verify", `${ref}^{commit}`]);
  if (!/^[0-9a-f]{40,64}$/i.test(sha)) {
    throw new Error(`Git revision did not resolve to a commit: ${ref}`);
  }
  return sha;
}

async function removeOwnedWorktree(repoRoot: string, path: string): Promise<void> {
  try {
    await git(repoRoot, ["worktree", "remove", "--force", path]);
  } catch {
    // A failed add may leave no registered worktree. prune below repairs stale metadata.
  }
}

export async function diffGitRange(repoRoot: string, rangeInput: string): Promise<AuthorityDiff> {
  const range = parseRevisionRange(rangeInput);
  const requestedRoot = resolve(repoRoot);
  const root = await git(requestedRoot, ["rev-parse", "--show-toplevel"]);
  const [beforeSha, afterSha] = await Promise.all([
    resolveCommit(root, range.before),
    resolveCommit(root, range.after),
  ]);

  const tempRoot = await mkdtemp(join(tmpdir(), "scopegraph-git-"));
  const beforeDir = join(tempRoot, "before");
  const afterDir = join(tempRoot, "after");
  let beforeAdded = false;
  let afterAdded = false;

  try {
    await git(root, ["worktree", "add", "--detach", beforeDir, beforeSha]);
    beforeAdded = true;
    await git(root, ["worktree", "add", "--detach", afterDir, afterSha]);
    afterAdded = true;

    const diff = await diffProjects(beforeDir, afterDir);
    return {
      ...diff,
      beforeRoot: range.before,
      afterRoot: range.after,
    };
  } finally {
    if (afterAdded) await removeOwnedWorktree(root, afterDir);
    if (beforeAdded) await removeOwnedWorktree(root, beforeDir);
    try {
      await git(root, ["worktree", "prune"]);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }
}
