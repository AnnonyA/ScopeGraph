# ScopeGraph

[![CI](https://github.com/AnnonyA/ScopeGraph/actions/workflows/ci.yml/badge.svg)](https://github.com/AnnonyA/ScopeGraph/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-brightgreen.svg)](https://nodejs.org/)

**Static semantic analysis for AI agent authority.**

> **ScopeGraph reports paths, not vibes.**

ScopeGraph is a local-first static analyzer for reasoning about what AI-agent tooling can actually reach. Instead of flagging isolated API names, it builds an evidence-backed graph and looks for demonstrable source-to-sink paths.

It can also compare two project states and answer a more useful question than “what lines changed?”:

> **What new authority did this change give the agent?**

The current core analyzes JavaScript/TypeScript execution flows and common MCP JSON configuration. It can prove when untrusted function input reaches Node.js process-execution APIs, inventory MCP runtime authority, compare authority between project states or Git revisions, preserve evidence, and stay conservative when behavior cannot be resolved.

```text
                 project
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
      JS / TS              MCP config
          │                   │
          ▼              ┌────┼─────────────┐
   taint / calls          ▼    ▼             ▼
          │             process network  environment
          └──────────┬────┘
                     ▼
             Agent IR + evidence
                     │
                     ▼
          authority / reachability
                     │
              ┌──────┴──────┐
              ▼             ▼
            scan           diff
```

## Why ScopeGraph

Agent security is often discussed as a list of permissions or suspicious strings. That misses composition: a capability matters because of what can reach it and what it can reach next.

ScopeGraph is designed around four rules:

- **Static-first** — analyzed projects are parsed, not executed.
- **Evidence-backed** — proven findings retain the source path that produced them.
- **Conservative** — unsupported behavior becomes `UNKNOWN`, not a fabricated vulnerability.
- **Deterministic** — the same source and ScopeGraph version should produce the same semantic result.

## Current v0.1 core

Implemented today:

- deterministic Agent IR nodes and evidence edges
- cycle-safe reachability analysis
- deterministic JavaScript / TypeScript project discovery
- TypeScript Compiler API frontend
- `node:child_process` and `child_process` modeling
- `exec`, `execSync`, `spawn`, and `spawnSync` sinks
- simple imported-function aliases such as `const run = exec`
- basic taint propagation through identifiers, properties, assignments, binary expressions, and templates
- `UNKNOWN` diagnostics for unresolved computed call targets
- `SG1001` — **Untrusted content reaches shell execution**
- `.mcp.json` / `mcp.json` discovery
- common `mcpServers` configuration parsing
- MCP stdio `process.spawn` capability extraction
- MCP remote `network.connect` capability extraction
- explicit MCP environment-key exposure inventory
- credential-safe reporting: environment values, command args, URL paths, query strings, and fragments are not retained in capability output
- semantic authority diff between two project directories
- Git revision authority diff using `base..head`
- detached temporary worktrees with guaranteed cleanup for Git revision analysis
- project-relative evidence paths so temporary or machine-specific roots do not leak into reports
- root-independent capability comparison using `kind / source / target`
- stable finding signatures so equivalent findings do not appear new just because a project moved
- terminal, JSON, GitHub-friendly Markdown, and SARIF 2.1.0 output
- `scan --sarif` for full finding export
- `diff --sarif` for newly introduced findings only
- deduplicated SARIF rule descriptors with evidence-backed source locations
- pull-request Authority Diff workflow using the PR base/head commit SHAs
- read-only PR authority analysis with checkout credentials disabled after fetch
- GitHub Job Summary output for semantic authority changes
- PR gating only when a newly introduced finding is `high` or `critical`
- Code Scanning SARIF upload for trusted same-repository pull requests
- controlled positive, negative, unresolved, Git, reporter, and CLI integration fixtures

ScopeGraph does **not** claim full MCP tool-level semantics, Claude Code, Codex, or `SKILL.md` coverage yet. Those layers are built incrementally on the same IR.

## Quick start

Requirements: Node.js 22 or newer.

```bash
git clone https://github.com/AnnonyA/ScopeGraph.git
cd ScopeGraph
npm install
npm run build
```

Scan a project:

```bash
node dist/cli/scan.js scan ./path/to/project
```

Compare two project directories:

```bash
node dist/cli/scan.js diff ./baseline ./candidate
```

Compare two Git revisions from inside a repository:

```bash
node dist/cli/scan.js diff main..feature
```

Machine-readable and GitHub-friendly output:

```bash
node dist/cli/scan.js scan ./path/to/project --json
node dist/cli/scan.js scan ./path/to/project --sarif
node dist/cli/scan.js diff ./baseline ./candidate --json
node dist/cli/scan.js diff main..feature --json
node dist/cli/scan.js diff main..feature --markdown
node dist/cli/scan.js diff main..feature --sarif
```

`scan --sarif` exports all findings proved by that scan. `diff --sarif` exports only findings introduced by the candidate state, so pre-existing findings are not re-announced as new pull-request issues.

## Authority diff

**Detect authority changes, not just line changes.**

Given a baseline that can only launch a local MCP server and a candidate that adds a remote MCP endpoint plus a newly reachable shell path:

```text
$ scopegraph diff main..feature

ScopeGraph Authority Diff

Before: main
After:  feature

Added authority
+ network.connect  docs -> https://mcp.example.com

New findings
+ CRITICAL SG1001  Untrusted content reaches shell execution
```

Comparison is semantic. Two equivalent capabilities with different graph IDs, project roots, or temporary Git worktree paths are treated as the same authority.

For Git ranges, ScopeGraph resolves both revisions to commits, materializes detached temporary worktrees, analyzes them statically, normalizes evidence back to project-relative paths, and removes the worktrees afterward. The current checkout is not switched or modified by the comparison.

## Pull request integration

ScopeGraph dogfoods its own authority analysis on pull requests to `main`.

The `Authority Diff` workflow:

1. checks out the repository with full Git history;
2. disables persisted checkout credentials;
3. builds ScopeGraph locally;
4. compares the exact pull-request base and head commit SHAs;
5. writes a Markdown authority report to the GitHub Job Summary;
6. exits successfully for informational authority changes;
7. fails when the PR introduces a new `high` or `critical` finding.

The workflow uses only `contents: read` permission. It does not post comments, modify pull requests, push commits, or require a separate API token.

A Job Summary can look like this:

```markdown
## ScopeGraph Authority Diff

### Added authority
- `network.connect` — docs → `https://mcp.example.com` — `.mcp.json`

### New findings
- CRITICAL `SG1001` — Untrusted content reaches shell execution — `src/tool.ts:3`

**Result: ❌ new high/critical finding detected**
```

### SARIF and Code Scanning

ScopeGraph can emit SARIF 2.1.0 with repository-relative source locations:

```bash
scopegraph scan . --sarif
scopegraph diff main..feature --sarif
```

For pull requests, the repository keeps privileged SARIF upload separate from the read-only authority gate. The `ScopeGraph Code Scanning` workflow runs only when the pull request head belongs to this repository, generates SARIF from the exact base/head diff, and uploads it with GitHub's Code Scanning integration. Fork pull requests do not receive the `security-events: write` job; the read-only `Authority Diff` workflow still analyzes them.

This repository-native integration is intentionally narrower than a reusable public GitHub Action. Packaging ScopeGraph for external repositories is a later release step.

## Scan example

```text
ScopeGraph

Analyzed: 1 JavaScript / TypeScript file
MCP servers: 2
Capabilities: 3
Findings: 1

Authority
network.connect  docs -> https://mcp.example.com
environment.expose  workspace -> GITHUB_TOKEN
process.spawn  workspace -> node

CRITICAL SG1001
Untrusted content reaches shell execution
Confidence: PROVEN
```

Exit codes:

| Code | Meaning |
| ---: | --- |
| `0` | Command completed without a newly/proven high or critical finding |
| `1` | Scan proved a high/critical finding, or diff introduced one |
| `2` | ScopeGraph could not complete the command |

## MCP authority without secret retention

Given:

```json
{
  "mcpServers": {
    "workspace": {
      "command": "node",
      "args": ["server.js"],
      "env": {
        "GITHUB_TOKEN": "..."
      }
    },
    "docs": {
      "url": "https://mcp.example.com/mcp?token=..."
    }
  }
}
```

ScopeGraph retains only the authority-relevant, non-secret facts:

```text
process.spawn       workspace -> node
environment.expose  workspace -> GITHUB_TOKEN
network.connect      docs      -> https://mcp.example.com
```

It does not keep the environment value, command arguments, URL path, query string, or fragment in the capability report.

## How it works

```text
source tree / Git revisions
          │
          ▼
      discovery
          │
          ├──────────────► JS / TS frontend
          │
          └──────────────► MCP config frontend
                              │
                              ▼
                      Agent IR + evidence graph
                              │
                              ▼
                    reachability / authority
                              │
                        ┌─────┴─────┐
                        ▼           ▼
                    findings   capabilities
                        │           │
                        └─────┬─────┘
                              ▼
                      semantic snapshots
                              │
                              ▼
                       authority diff
```

Frontends own ecosystem-specific parsing. Analysis consumes the common IR, so later MCP-tool, skill, and agent-configuration support can reuse the same graph instead of duplicating security logic.

## JavaScript example

This is reported because the command originates from a function parameter:

```ts
import { exec } from "node:child_process";

export function run(input: { command: string }) {
  const command = input.command;
  exec(command);
}
```

This is not reported as `SG1001` because the command is static:

```ts
import { exec } from "node:child_process";

exec("npm test");
```

If ScopeGraph cannot resolve a dynamic target safely, it records an unresolved diagnostic instead of guessing.

## Safety model

ScopeGraph does not execute analyzed source code, imported project modules, MCP servers, discovered hooks, or shell commands. The analyzer only reads project files and parses supported syntax/configuration statically. Git revision diff uses Git itself only to resolve revisions and materialize detached worktrees for reading.

## Roadmap

Planned layers, in order:

1. MCP SDK tool-registration discovery and tool-level capability linking
2. Claude Code, Codex, and `SKILL.md` frontends
3. filesystem, secret-source, and network-send semantics in JS/TS
4. composed-authority analysis across multiple tools
5. interactive local HTML capability graph
6. package/release hardening and a reusable GitHub Action

The roadmap is intentionally incremental: a feature only ships when its positive, negative, and unresolved cases are reproducible.

## Development

```bash
npm install
npm run typecheck
npm run build
npm test
```

CI runs the same typecheck, build, and test suite on Node.js 22.

## License

MIT — see [LICENSE](LICENSE).
