/**
 * TracePulse CLI entry point.
 *
 * Usage:
 *   npx tracepulse start "npm run dev"     — spawn dev server and monitor
 *   npx tracepulse attach --log-file ./log  — attach to existing process
 *
 * stdout is reserved for MCP JSON-RPC protocol messages.
 * All diagnostic output goes to stderr.
 */

import { VERSION } from "./index.js";

// eslint-disable-next-line no-console
console.error(`TracePulse v${VERSION}`);
