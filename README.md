# ScopeGraph

[![CI](https://github.com/AnnonyA/ScopeGraph/actions/workflows/ci.yml/badge.svg)](https://github.com/AnnonyA/ScopeGraph/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-brightgreen.svg)](https://nodejs.org/)

**Static semantic analysis for AI agent authority.**

> **ScopeGraph reports paths, not vibes.**

ScopeGraph is a local-first static analyzer for reasoning about what AI-agent tooling can actually reach. Instead of flagging isolated API names, it builds an evidence-backed graph and looks for demonstrable source-to-sink paths.

It can also compare two project states and answer a more useful question than “what lines changed?”:

> **What new authority did this change give the agent?**

The current core analyzes JavaScript/TypeScript execution flows and common MCP JSON configuration. It can prove when untrusted function input reaches Node.js process-execution APIs, inventory MCP runtime authority, compare authority between project states, preserve evidence, and stay conservative when behavior cannot be resolved.

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
- root-independent capability comparison using `kind / source / target`
- stable finding signatures so equivalent findings do not appear new just because a project moved
- terminal and JSON output
- controlled positive, negative, and unresolved fixtures

ScopeGraph does **not** claim full MCP tool-level semantics, Claude Code, Codex, or Git-revision materialization yet. Those layers are built incrementally on the same IR.

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

Compare two project states:

```bash
node dist/cli/scan.js diff ./baseline ./candidate
```

Machine-readable output works for both commands:

```bash
node dist/cli/scan.js scan ./path/to/project --json
node dist/cli/scan.js diff ./baseline ./candidate --json
```

## Authority diff

**Detect authority changes, not just line changes.**

Given a baseline that can only launch a local MCP server and a candidate that adds a remote MCP endpoint plus a newly reachable shell path:

```text
$ scopegraph diff ./baseline ./candidate

ScopeGraph Authority Diff

Before: ./baseline
After:  ./candidate

Added authority
+ network.connect  docs -> https://mcp.example.com

New findings
+ CRITICAL SG1001  Untrusted content reaches shell execution
```

Comparison is semantic. Two equivalent capabilities with different graph IDs or project roots are treated as the same authority.

The current command compares two directories. Git-native revision syntax such as `scopegraph diff main..feature` is planned as a layer on top of the same comparison engine.

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
source tree
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

ScopeGraph does not execute analyzed source code, imported project modules, MCP servers, discovered hooks, or shell commands. The analyzer only reads project files and parses supported syntax/configuration statically.

## Roadmap

Planned layers, in order:

1. Git-native `main..feature` authority diff and PR integration
2. MCP SDK tool-registration discovery and tool-level capability linking
3. Claude Code, Codex, and `SKILL.md` frontends
4. filesystem, secret-source, and network-send semantics in JS/TS
5. composed-authority analysis across multiple tools
6. SARIF output and pull-request annotations
7. interactive local HTML capability graph

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
