# BUG-018: npm global symlink breaks ESM import.meta.url

- **ID:** BUG-018
- **Severity:** CRITICAL
- **Status:** FIXED
- **Found:** 2026-05-04
- **Fixed:** 2026-05-04

## Description

When TracePulse is installed globally via `npm install -g`, npm creates a symlink from the global bin directory to `dist/cli.js`. When Node.js runs an ESM file through a symlink, `import.meta.url` resolves to the symlink location, not the real file. This breaks relative chunk imports (tsup splits code into chunks), causing silent failure - no output, no error, just an empty process.

## Impact

- `"command": "tracepulse"` in MCP config produced "connection closed: initialize response"
- Users had to use `"command": "node", "args": ["/full/path/to/dist/cli.js"]` as workaround
- Hardcoded paths are not portable across machines
- First-time users on any non-Node project hit this immediately

## Root Cause

`package.json` `bin` field pointed directly to `./dist/cli.js` (ESM). npm symlinks this file. Node's ESM loader resolves `import.meta.url` from the symlink path, not the real path. Relative imports to sibling chunks fail silently.

## Fix

Added `bin/tracepulse` shell wrapper (Unix) and `bin/tracepulse.cmd` (Windows) that resolve the real path via `readlink -f` / `realpath` before calling `node dist/cli.js`. The `bin` field in package.json now points to `./bin/tracepulse`.

## Regression Tests

- `tests/unit/startup-regressions.test.ts`: BUG-018 bin wrapper exists with readlink/realpath
- `scripts/test-install.sh`: S1 (version check via global binary)

## Files Changed

- `bin/tracepulse` (new - Unix shell wrapper)
- `bin/tracepulse.cmd` (new - Windows cmd wrapper)
- `package.json` (bin field + files array)
