# ScopeGraph

[![CI](https://github.com/AnnonyA/ScopeGraph/actions/workflows/ci.yml/badge.svg)](https://github.com/AnnonyA/ScopeGraph/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-brightgreen.svg)](https://nodejs.org/)

**Static semantic analysis for AI agent authority.**

> **ScopeGraph reports paths, not vibes.**

ScopeGraph is a local-first static analyzer for reasoning about what AI-agent tooling can actually reach. Instead of flagging isolated API names, it builds evidence-backed semantic state and looks for demonstrable source-to-sink paths.

It can also compare two project states and answer a more useful question than “what lines changed?”:

> **What changed in the agent's effective authority and control surface?**

The current core analyzes JavaScript/TypeScript process execution, filesystem mutation, environment reads, and `fetch` network sends; common MCP JSON configuration; MCP SDK tool registrations; Codex instruction files; Claude instruction files; and Agent Skills metadata. It can connect proven untrusted input to execution or filesystem sinks, prove sensitive environment data reaching the network, inventory scoped agent instructions without treating free-form prose as proof, and compare tool/instruction state between directories or Git revisions.

```text
                         project
                            │
       ┌────────────┬───────┼─────────┬────────────┐
       ▼            ▼       ▼         ▼            ▼
    JS / TS     MCP config  MCP SDK  AGENTS /    CLAUDE /
                            tools    overrides    SKILL.md
       │            │       │         │            │
       └────────────┴───────┴─────────┴─────┬──────┘
                                             ▼
                                  Agent IR + evidence
                                             │
                                  ┌──────────┴──────────┐
                                  ▼                     ▼
                          authority / paths      semantic inventory
                                  │                     │
                                  └──────────┬──────────┘
                                             ▼
                                      scan / diff
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

### Program and authority analysis

- deterministic Agent IR nodes and evidence edges
- cycle-safe reachability analysis
- deterministic JavaScript / TypeScript project discovery
- TypeScript Compiler API frontend
- `node:child_process` and `child_process` modeling
- `exec`, `execSync`, `spawn`, and `spawnSync` sinks
- `exec` / `execSync` modeled as `shell.execute`
- `spawn` / `spawnSync` modeled as `process.spawn`
- `node:fs`, `fs`, `node:fs/promises`, and `fs/promises` filesystem-write modeling
- `writeFile`, `writeFileSync`, `appendFile`, and `appendFileSync` mutation sinks
- static `process.env.KEY` / `process.env["KEY"]` sensitive-source modeling; values are never retained
- global `fetch(...)` network-send sinks
- static fetch destinations reduced to their origin so URL paths, query strings, fragments, and credentials are not retained
- simple imported-function aliases such as `const run = exec`
- basic taint propagation through identifiers, properties, assignments, binary expressions, templates, object literals, and arrays
- generic untrusted parameters seeded only from exported function declarations; internal helpers are not assumed agent-controlled
- MCP handlers use their discovered tool inputs as the untrusted boundary
- `UNKNOWN` diagnostics for unresolved computed call targets
- `SG1001` — **Untrusted content reaches shell execution**
- `SG1101` — **Untrusted content reaches filesystem mutation**
- `SG1201` — **Sensitive environment data reaches network**
- authority and findings are intentionally separate: a tool may expose a capability without producing a finding unless a dangerous data-flow path is proven

### MCP configuration and tools

- `.mcp.json` / `mcp.json` discovery
- common `mcpServers` configuration parsing
- MCP stdio `process.spawn` capability extraction
- MCP remote `network.connect` capability extraction
- explicit MCP environment-key exposure inventory
- credential-safe reporting: environment values, command args, URL paths, query strings, and fragments are not retained in capability output
- MCP SDK v2 `registerTool(...)` discovery from `@modelcontextprotocol/server`
- legacy MCP SDK v1 `.tool(...)` discovery
- simple `McpServer` receiver alias tracking with stable server identity
- static MCP tool-name and handler resolution
- MCP tool-input discovery from common handler parameter patterns
- tool annotations retained as metadata without overriding proven code authority
- partial MCP analysis with `UNKNOWN` diagnostics for dynamic registration config or incomplete syntax
- proven MCP tool input → execution or filesystem-mutation paths attributed back to the exposed tool
- MCP handler `filesystem.write`, `environment.read`, and `network.send` capability attribution
- `environment.read` retains only the environment-variable key
- `network.send` retains only a static destination origin, or `<dynamic>` when a destination cannot be reduced safely
- per-tool capability inventory in scan reports

### Agent instruction frontends

- hierarchical Codex `AGENTS.md` discovery
- `AGENTS.override.md` discovery with explicit override precedence
- directory scope preserved for Codex instruction files
- hierarchical Claude `CLAUDE.md` discovery
- literal Claude `@path` import extraction outside fenced/inline Markdown code examples
- Agent Skills `SKILL.md` YAML frontmatter parsing
- required skill `name` / `description` validation
- optional `license`, `compatibility`, and `allowed-tools` metadata
- malformed or incomplete skill metadata becomes `UNKNOWN` instead of a usable skill
- SHA-256 content fingerprints for deterministic change detection without retaining Markdown bodies in semantic snapshots
- free-form instruction text is **not** converted into `PROVEN` authority merely because it mentions commands, tools, or sensitive actions

### Semantic diff and reporting

- semantic authority diff between two project directories
- Git revision authority diff using `base..head`
- detached temporary worktrees with guaranteed cleanup for Git revision analysis
- project-relative evidence paths so temporary or machine-specific roots do not leak into reports
- root-independent capability comparison using `kind / source / target`
- stable finding signatures so equivalent findings do not appear new just because a project moved
- semantic MCP tool diff with `added`, `removed`, and `changed` tools
- capability/input deltas for tools whose semantic identity remains stable
- semantic agent-instruction diff with `added`, `removed`, and `changed` files
- content-change detection for `AGENTS.md`, `AGENTS.override.md`, `CLAUDE.md`, and `SKILL.md`
- import deltas for Claude instructions and `allowed-tools` deltas for skills
- terminal and JSON scan output for tools, instructions, scopes, imports, and capabilities
- terminal, JSON, and GitHub-friendly Markdown diff output
- SARIF 2.1.0 output for findings
- `scan --sarif` for full finding export
- `diff --sarif` for newly introduced findings only
- deduplicated SARIF rule descriptors with evidence-backed source locations

### Pull-request integration

- pull-request Authority Diff workflow using exact PR base/head commit SHAs
- read-only PR authority analysis with checkout credentials disabled after fetch
- GitHub Job Summary output for semantic authority and instruction changes
- PR gating only when a newly introduced finding is `high` or `critical`
- Code Scanning SARIF upload for trusted same-repository pull requests

ScopeGraph does **not** claim exhaustive MCP semantics, arbitrary JavaScript metaprogramming support, or semantic understanding of arbitrary Markdown instructions. Filesystem reads, workspace/path escape analysis, Node `http`/`https` request modeling, richer interprocedural flow, and composed authority remain future layers. Dynamic names, unresolved handlers, malformed metadata, and unsupported registration shapes remain conservative `UNKNOWN` territory.

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

## MCP tool analysis

ScopeGraph recognizes common MCP SDK server registrations statically. For example:

```ts
import { exec } from "node:child_process";
import { McpServer } from "@modelcontextprotocol/server";

const server = new McpServer({ name: "workspace", version: "1.0.0" });

server.registerTool(
  "run",
  { inputSchema: {} },
  async ({ command }) => {
    exec(command);
  },
);
```

The tool input is treated as an untrusted source, the execution API is modeled as a sink, and the resulting authority is attached to the tool:

```text
MCP tools: 1

MCP tools
run (v2)
  input: command
  shell.execute -> child_process.exec

CRITICAL SG1001
Untrusted content reaches shell execution
Confidence: PROVEN
```

Annotations such as `readOnlyHint` are retained as metadata, but they do not suppress authority proved from the implementation. If ScopeGraph can prove the tool and handler while only the registration config is dynamic, it keeps the proven portion and emits an `UNKNOWN` diagnostic for the unresolved metadata/schema portion.

A capability does not imply a vulnerability. For example, a tool that executes a fixed command, writes fixed content, or sends a static health request can still expose `shell.execute`, `filesystem.write`, or `network.send` authority while producing no finding because no dangerous source-to-sink flow was proven.

## Filesystem and sensitive network flows

An exported entrypoint can prove untrusted content reaching a filesystem mutation:

```ts
import { writeFile } from "node:fs/promises";

export async function save(input: { body: string }) {
  await writeFile("output.txt", input.body);
}
```

That path produces `SG1101`. Internal helper parameters are not treated as agent-controlled merely because they are function parameters.

Sensitive environment data reaching `fetch` can produce `SG1201`:

```ts
const token = process.env.API_KEY;

await fetch("https://example.test/upload", {
  headers: { authorization: token },
});
```

Only the environment key (`API_KEY`) is retained as sensitive-source identity. When the same behavior is inside a proven MCP tool handler, its static authority can include `environment.read -> API_KEY` and `network.send -> https://example.test`; the secret value and URL path/query are not retained.

## Agent instruction inventory

ScopeGraph recognizes structural facts from common agent instruction formats without pretending to understand arbitrary prose.

Given a project with:

```text
AGENTS.md
packages/api/AGENTS.override.md
packages/api/CLAUDE.md
.agents/skills/review/SKILL.md
```

A scan can report:

```text
Agent instructions: 4

Agent instructions
skill  .agents/skills/review/SKILL.md  scope=.agents/skills/review
  name: review
  allowed tools: Read, Grep
codex  AGENTS.md  scope=.  precedence=normal
codex  packages/api/AGENTS.override.md  scope=packages/api  precedence=override
claude  packages/api/CLAUDE.md  scope=packages/api
  imports: README.md
```

ScopeGraph stores a deterministic content fingerprint for change detection, not the full Markdown body in the semantic snapshot. A sentence such as “run whatever commands are needed” is therefore inventory data, **not a proven shell capability**. Authority still requires supported code/configuration evidence.

## Semantic diff

**Detect authority and control-surface changes, not just line changes.**

An existing MCP tool gaining shell execution can produce:

```text
ScopeGraph Authority Diff

Changed MCP tools
~ run
  + shell.execute -> child_process.exec

Added authority
+ shell.execute  mcp-tool:run -> child_process.exec

New findings
+ CRITICAL SG1001  Untrusted content reaches shell execution
```

Instruction changes are tracked separately:

```text
Added agent instructions
+ claude  packages/api/CLAUDE.md  scope=packages/api

Changed agent instructions
~ codex  AGENTS.md
  content changed

~ skill  .agents/skills/review/SKILL.md
  content changed
  + allowed tool Grep
```

Comparison is semantic. Equivalent capabilities with different graph IDs, project roots, or temporary Git worktree paths are treated as the same authority. Existing tools retain identity across internal changes; instruction files retain identity by ecosystem kind and repository-relative path.

For Git ranges, ScopeGraph resolves both revisions to commits, materializes detached temporary worktrees, analyzes them statically, normalizes evidence back to project-relative paths, and removes the worktrees afterward. The current checkout is not switched or modified by the comparison.

## Pull request integration

ScopeGraph dogfoods its own analysis on pull requests to `main`.

The `Authority Diff` workflow:

1. checks out the repository with full Git history;
2. disables persisted checkout credentials;
3. builds ScopeGraph locally;
4. compares the exact pull-request base and head commit SHAs;
5. writes a Markdown semantic report to the GitHub Job Summary;
6. reports tool and instruction changes informationally;
7. fails only when the PR introduces a new `high` or `critical` finding.

The workflow uses only `contents: read` permission. It does not post comments, modify pull requests, push commits, or require a separate API token.

### SARIF and Code Scanning

ScopeGraph can emit SARIF 2.1.0 with repository-relative source locations:

```bash
scopegraph scan . --sarif
scopegraph diff main..feature --sarif
```

For pull requests, the repository keeps privileged SARIF upload separate from the read-only authority gate. The `ScopeGraph Code Scanning` workflow runs only when the pull request head belongs to this repository, generates SARIF from the exact base/head diff, and uploads it with GitHub's Code Scanning integration. Fork pull requests do not receive the `security-events: write` job; the read-only `Authority Diff` workflow still analyzes them.

This repository-native integration is intentionally narrower than a reusable public GitHub Action. Packaging ScopeGraph for external repositories is a later release step.

## Exit codes

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

## Safety model

ScopeGraph does not execute analyzed source code, imported project modules, MCP servers, discovered hooks, agent instructions, skills, or shell commands. The analyzer only reads project files and parses supported syntax/configuration statically. Git revision diff uses Git itself only to resolve revisions and materialize detached worktrees for reading.

## Roadmap

Planned layers, in order:

1. filesystem-read semantics, Node `http` / `https` sends, and workspace/path-scope analysis (`SG1301`)
2. richer structured references between agent instructions, skills, MCP tools, and executable code
3. composed-authority analysis across multiple tools and instruction surfaces (`SG1401` family)
4. interactive local HTML capability graph
5. package/release hardening and a reusable GitHub Action

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
