# BUG-019: bin/ directory missing from npm package files

- **ID:** BUG-019
- **Severity:** CRITICAL
- **Status:** FIXED
- **Found:** 2026-05-04
- **Fixed:** 2026-05-04

## Description

The `files` array in `package.json` only included `["dist", "skills"]`. The `bin/` directory with the shell wrapper was not included, so `npm publish` excluded it. Global installs had no bin wrapper, falling back to the broken direct ESM symlink.

## Impact

- BUG-018 fix (bin wrapper) was not shipped in the npm package
- Global install still used the broken `dist/cli.js` symlink
- Users installing v0.9.10 still got "connection closed" errors

## Root Cause

When `bin/tracepulse` was created, the `files` array in `package.json` was not updated to include `"bin"`. npm only publishes files listed in the `files` array (plus package.json and README).

## Fix

Added `"bin"` to the `files` array in `package.json`.

## Regression Tests

- `tests/unit/startup-regressions.test.ts`: BUG-019 package.json files includes bin
- `scripts/test-install.sh`: all scenarios (use global binary)

## Files Changed

- `package.json`
