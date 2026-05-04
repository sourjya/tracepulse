# Environment Detection & Zero-Config Architecture Research

Date: 2026-05-04
Status: Applied (M21 Phase 1 + Phase 2)

## Problem

TracePulse's startup model assumed a running dev server. This created a cascade of failures:

1. **Fresh projects** - no server, no deps, `tracepulse start "npm run dev"` fails
2. **Python projects** - needs PYTHONPATH, venv activation, or start scripts
3. **Library/monorepo** - no single dev server
4. **First-time users** - must choose start/attach/standalone/compose before understanding the tool

The "connection closed: initialize response" error was the #1 abandonment point, observed on 3 different projects.

## Root Cause Analysis

### Why MCP servers have different environments than user shells

MCP clients (Kiro, Cursor, Claude Desktop) spawn MCP servers as child processes. The spawned process inherits the MCP client's environment, NOT the user's interactive shell environment. Key differences:

| What | User's terminal | MCP server process |
|------|----------------|-------------------|
| Shell profile | `.bashrc`/`.zshrc` sourced | Not sourced |
| PATH | Includes user modifications | MCP client's PATH only |
| Virtual environments | Activated via `source .venv/bin/activate` | Not activated |
| PYTHONPATH | Set in terminal | Not set |
| nvm/pyenv/rbenv | Active version selected | System default |

This means:
- `python` may resolve to system Python (no packages) instead of venv Python
- `pytest` may not be found at all (only in venv)
- `npm run dev` works but `PYTHONPATH=src python app.py` doesn't (shell syntax)

### Why npm global symlinks break ESM

npm global install creates a symlink: `/usr/bin/tracepulse -> /usr/lib/node_modules/tracepulse/dist/cli.js`

When Node.js runs an ESM file through a symlink, `import.meta.url` resolves to the **symlink location**, not the real file. Relative imports to sibling chunks (tsup code-splits) fail silently because they look in the wrong directory.

**Fix:** Shell wrapper (`bin/tracepulse`) that resolves the real path via `readlink -f` before calling `node dist/cli.js`.

### Why `PYTHONPATH=src python app.py` fails

`child_process.spawn` does NOT use a shell by default. `VAR=value command` is shell syntax - the entire string `PYTHONPATH=src python app.py` is treated as the command name, which doesn't exist.

**Fix:** `env` field in MCP config, or `bash -c '...'` wrapper.

## Architecture Decision: Capability Layers

Instead of modes (start/attach/standalone/compose), TracePulse uses capability layers that activate based on what's available:

```
Layer 0: Filesystem (always works)
  Tools: run_and_watch, check_port, check_drift, verify_build, etc.
  Activates: immediately

Layer 1: Project Intelligence (file detection)
  Detects: package.json, pyproject.toml, go.mod, Cargo.toml, .env
  Activates: on startup, reads files in cwd
  Effect: expands allowlist, suggests start commands

Layer 2: Live Monitoring (server running)
  Tools: get_errors, watch_for_errors, verify_fix, etc.
  Activates: when agent calls start_server() or user provides command

Layer 3: Cross-Session Intelligence (persistence)
  Tools: get_bug_patterns, get_new_errors, get_error_trends
  Activates: when .tracepulse/ has history
```

### Key design decisions

1. **TracePulse never fails to start.** Layer 0 always works.
2. **No mode selection required.** Bare `tracepulse` starts Layer 0+1.
3. **Server starts on demand.** Agent calls `start_server()` when ready.
4. **Backward compatible.** `tracepulse start "cmd"` still works.

## Centralized Detection

All project file detection is centralized in `src/diagnostics/project-detector.ts`:

| Helper | Purpose |
|--------|---------|
| `detectProjectStacks(cwd)` | Scan for 7 stack types (node, python, go, rust, java, infra, docker) |
| `suggestStartCommands(cwd)` | Read package.json scripts, Makefile, scripts/*.sh, manage.py |
| `hasVenv(cwd)` | Check for .venv/bin |
| `getVenvBinPath(cwd)` | Return venv bin path or null |
| `hasPackageJson(cwd)` | Check for package.json |
| `isPythonProject(cwd)` | Check for pyproject.toml or requirements.txt |
| `detectMigrationFramework(cwd)` | Detect alembic/prisma/django/knex |

**Rule:** No other module should use `existsSync` for project file detection. Import from `project-detector.ts`.

### Why centralization matters

Before centralization, `manage.py` was checked in 4 files, `.venv` in 3 files, `package.json` in 2 files. If any check used a different path (e.g., `.venv` vs `.venv/bin`), detection would be inconsistent. One module might think "Python project with venv" while another thinks "Python project without venv."

## Virtual Environment Auto-Detection

`run_and_watch` auto-detects `.venv/bin` in the working directory and prepends it to PATH:

```typescript
const venvBin = getVenvBinPath(spawnCwd);
if (venvBin) {
  spawnEnv.PATH = `${venvBin}:${spawnEnv.PATH}`;
  spawnEnv.VIRTUAL_ENV = resolve(spawnCwd, ".venv");
}
```

This fixes the environment mismatch between MCP server and user's terminal without requiring the user to configure anything.

## Stack-Aware Allowlist

The `run_and_watch` command allowlist expands based on detected stacks:

| Stack | Additional commands allowed |
|-------|---------------------------|
| Python | python, pytest, .venv/bin/*, uv, pip, mypy, ruff, alembic |
| Go | go test, go run, go build, go vet |
| Rust | cargo test/build/run/check/clippy |
| Java | mvn, gradle, ./gradlew |
| Docker | docker |

Base commands (node, npx, npm, tsc, eslint, bash, make) are always allowed.

## Startup Diagnostics

When a command fails, `diagnoseStartupFailure()` analyzes the command and error to produce actionable fixes:

| Pattern detected | Diagnostic |
|-----------------|-----------|
| `VAR=value cmd` | "Shell syntax. Use env field." |
| `cmd1 && cmd2` | "Shell operators. Use cwd parameter or bash wrapper." |
| `ModuleNotFoundError` | "Module not installed. pip install or use venv." |
| `ENOENT` | "Command not found. Install or use full path." |
| `EADDRINUSE` | "Port in use. Stop existing server." |
| `npm run` without package.json | "No package.json. Use actual server command." |

## Bugs Found During Implementation

| Bug | Severity | Root cause |
|-----|----------|-----------|
| BUG-017: standalone isConnected=true | HIGH | Copy-paste from start mode fallback |
| BUG-018: npm symlink breaks ESM | CRITICAL | import.meta.url resolves to symlink, not real file |
| BUG-019: bin/ not in npm package | CRITICAL | `files` array in package.json didn't include `bin` |

## Testing

| Test suite | Scenarios | Status |
|-----------|-----------|--------|
| Unit tests | 968 | All passing |
| Installation tests (`scripts/test-install.sh`) | 21 | All passing |
| Integration tests (`scripts/test-integration.sh`) | 20 | All passing |

## References

- [M21 Spec](.kiro/specs/m21-zero-config/requirements.md) - Full architecture spec with pitfall analysis
- [BUG-017](docs/bugs/BUG-017-standalone-isconnected-true.md)
- [BUG-018](docs/bugs/BUG-018-npm-global-symlink-esm.md)
- [BUG-019](docs/bugs/BUG-019-bin-missing-from-npm-files.md)
- [Installation Test Plan](docs/testing/installation-test-plan.md)
