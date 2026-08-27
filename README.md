# ScopeGraph

[![CI](https://github.com/AnnonyA/ScopeGraph/actions/workflows/ci.yml/badge.svg)](https://github.com/AnnonyA/ScopeGraph/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-brightgreen.svg)](https://nodejs.org/)

**Static semantic analysis for AI agent authority.**

> **ScopeGraph reports paths, not vibes.**

ScopeGraph is a local-first static analyzer for reasoning about what AI-agent tooling can actually reach. Instead of flagging isolated API names, it builds an evidence-backed graph and looks for demonstrable source-to-sink paths.

The current core focuses on JavaScript and TypeScript execution flows. It can prove when untrusted function input reaches Node.js process-execution APIs, preserve the evidence path, and stay conservative when a dynamic call cannot be resolved.

```text
untrusted input
      │
      ▼
 local command value
      │
      ▼
child_process.exec
      │
      ▼
 shell execution
```

## Why ScopeGraph

Agent security is often discussed as a list of permissions or suspicious strings. That misses composition: a capability becomes important because of what can reach it and what it can reach next.

ScopeGraph is designed around four rules:

- **Static-first** — analyzed projects are parsed, not executed.
- **Evidence-backed** — proven findings retain the source path that produced them.
- **Conservative** — unsupported dynamic behavior becomes `UNKNOWN`, not a fabricated vulnerability.
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
- terminal and JSON scan output
- controlled positive, negative, and unresolved fixtures

ScopeGraph intentionally does **not** claim full MCP, Claude Code, or Codex coverage yet. Those frontends are roadmap work built on top of the same IR.

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

Machine-readable output:

```bash
node dist/cli/scan.js scan ./path/to/project --json
```

A proven execution flow produces output similar to:

```text
ScopeGraph

Analyzed: 1 JavaScript / TypeScript file
Findings: 1

CRITICAL SG1001
Untrusted content reaches shell execution
Confidence: PROVEN
```

Exit codes:

| Code | Meaning |
| ---: | --- |
| `0` | Scan completed with no high/critical finding |
| `1` | A high/critical finding was proven |
| `2` | ScopeGraph could not complete the scan |

## How it works

```text
source tree
    │
    ▼
discovery
    │
    ▼
JS / TS frontend
    │
    ▼
Agent IR + evidence graph
    │
    ▼
reachability / taint
    │
    ▼
evidence-backed findings
```

The frontend owns syntax-specific reasoning. The analysis layer only sees the common graph, so future MCP, skill, and agent-configuration frontends can feed the same engine without duplicating security logic.

## Example

This is considered unsafe because the command originates from a function parameter:

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

ScopeGraph does not execute analyzed source code, imported project modules, discovered hooks, or shell commands. The analyzer reads project files and parses supported syntax statically.

## Roadmap

Planned layers, in order:

1. MCP configuration and tool-capability extraction
2. Claude Code, Codex, and `SKILL.md` frontends
3. filesystem, environment/secret, and network semantics
4. composed-authority analysis across multiple tools
5. `scopegraph diff` for authority changes between revisions
6. SARIF output and pull-request annotations
7. interactive local HTML capability graph

The roadmap is intentionally incremental: a new feature should only ship when its positive, negative, and unresolved cases are reproducible.

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
