# Phase 2: Watch Mode - Design

> **Hardening Reference:** See [Collector Pitfalls & Hardening Guide](../../../docs/references/collector-pitfalls-hardening.md) for known failure modes. Phase 2 inherits all Phase 1 pipeline hardening (ANSI stripping, line length guard, PYTHONUNBUFFERED, EPIPE detection, global error handlers). Build error parsers receive pre-stripped input (NFR-7).

## Architecture Overview

Phase 2 adds four new MCP tools and two new internal modules on top of the Phase 1 pipeline. The data flow extends the existing pipeline without modifying it:

```
                          Phase 1 (existing)                          Phase 2 (new)
                    ┌─────────────────────────┐              ┌──────────────────────────┐
                    │                         │              │                          │
Dev Server ──stdout─┤  Secret Redactor        │              │  Hot-Reload Detector     │
           ──stderr─┤  → Error Parsers        │──events──►   │  Build Error Parsers     │
                    │  → Signal Scorer        │              │  → Event Buffer (ring)   │
                    │  → Event Buffer (ring)  │              │                          │
                    └─────────────────────────┘              └──────────┬───────────────┘
                                                                        │
                    ┌─────────────────────────┐              ┌──────────▼───────────────┐
                    │  Phase 1 MCP Tools      │              │  Phase 2 MCP Tools       │
                    │  get_errors             │              │  watch_for_errors        │
                    │  get_server_logs        │              │  get_build_errors        │
                    │  get_runtime_status     │              │  get_error_context       │
                    │  clear_errors           │              │  get_timeline            │
                    └─────────────────────────┘              └──────────────────────────┘
```

### Component Interactions

1. **Hot-Reload Detector** - Listens to the same stdout/stderr stream as the error parsers. Matches lines against a registry of hot-reload patterns. Injects synthetic `RuntimeEvent` markers into the event buffer.
2. **Build Error Parsers** - New parsers added to the Phase 1 parser registry: TypeScript compiler, ESLint, Vite/webpack build errors. They produce `RuntimeEvent` objects with `source: 'build-error'`.
3. **Watch Controller** - Internal module that manages the blocking behavior of `watch_for_errors`. Subscribes to the event buffer, collects events for the specified duration, then returns.
4. **Timeline Query** - Internal module that queries the event buffer by time range. Used by `get_timeline` and `get_error_context`.

---

## Data Flow: watch_for_errors

```
Agent calls watch_for_errors(duration_seconds=15, source="server-stderr")
    │
    ▼
Watch Controller
    │
    ├── 1. Record start_timestamp = Date.now()
    ├── 2. Subscribe to event buffer's "new event" emitter
    ├── 3. Set timer for duration_seconds
    ├── 4. Collect events where:
    │       - event.timestamp >= start_timestamp
    │       - event.source matches filter (if provided)
    │       - event.level is 'error' or 'warn' (not info/debug)
    ├── 5. Listen for process-exit event (early return)
    │
    ▼ (timer fires OR process exits)
    │
    ├── 6. Unsubscribe from event buffer
    ├── 7. Deduplicate by fingerprint (keep latest, increment count)
    └── 8. Return RuntimeEvent[] sorted by timestamp ascending
```

Key design: `watch_for_errors` only collects **error and warning level** events by default. Info/debug logs are excluded to keep the response focused. The agent can use `get_timeline` for the full picture.

---

## Data Flow: get_error_context

```
Agent calls get_error_context(fingerprint="abc123")
    │
    ▼
Timeline Query
    │
    ├── 1. Find most recent event matching fingerprint in buffer
    │       → If not found: return { error: null, message: "Fingerprint not found" }
    ├── 2. Count total occurrences of fingerprint in buffer
    ├── 3. Query buffer for all events within ±5 seconds of error timestamp
    ├── 4. Exclude the error event itself from surrounding_logs
    ├── 5. Cap surrounding_logs at 50 events
    └── 6. Return { error, surrounding_logs, occurrence_count }
```

---

## Hot-Reload Detection

### Pattern Registry

The hot-reload detector maintains a registry of `HotReloadPattern` objects:

```typescript
/**
 * A pattern that identifies a hot-reload event in dev server output.
 *
 * Each pattern matches a specific dev tool's reload/restart message.
 * The registry is checked against every stdout/stderr line.
 */
interface HotReloadPattern {
  /** Unique identifier for this pattern (e.g., "vite-compiled") */
  readonly id: string;
  /** Human-readable name of the dev tool (e.g., "Vite") */
  readonly tool: string;
  /** Regex to match against a log line */
  readonly pattern: RegExp;
  /** Description of what this pattern indicates */
  readonly description: string;
}
```

### Default Patterns

| ID | Tool | Pattern | Example Match |
|---|---|---|---|
| `vite-compiled` | Vite | `/✓ compiled|ready in \d+/i` | `✓ Compiled successfully in 245ms` |
| `vite-hmr` | Vite | `/\[vite\] hmr update/i` | `[vite] hmr update /src/App.tsx` |
| `webpack-compiled` | webpack | `/compiled (successfully|with \d+ warning)/i` | `Compiled successfully.` |
| `nodemon-restart` | nodemon | `/\[nodemon\] restarting due to/i` | `[nodemon] restarting due to changes...` |
| `nodemon-starting` | nodemon | `/\[nodemon\] starting/i` | `[nodemon] starting `node server.js`` |
| `nextjs-compiled` | Next.js | `/✓ ready in|compiled client and server/i` | `✓ Ready in 1.2s` |
| `nextjs-compiling` | Next.js | `/compiling \//i` | `Compiling /api/users...` |
| `tsnode-restart` | ts-node-dev | `/restarting|compilation complete/i` | `[INFO] Restarting...` |

### Synthetic Event Generation

When a hot-reload pattern matches, the detector creates:

```typescript
{
  id: crypto.randomUUID(),
  timestamp: Date.now(),
  source: "server-stdout",
  service: "main",
  level: "info",
  message: `Hot-reload detected: ${pattern.tool} - ${matchedLine}`,
  fingerprint: `hotreload:${pattern.id}`,
  signal_score: 5,
  signal_strength: "low",
  context: {
    framework: pattern.tool.toLowerCase(),
  },
  raw: matchedLine,
  first_seen: Date.now(),
  occurrence_count: 1,
}
```

---

## Build Error Parsers

> **ANSI Handling:** All build error parsers receive ANSI-stripped input - the Phase 1 pipeline strips escape codes before the parser registry runs (see [Pitfall 4.4](../../../docs/references/collector-pitfalls-hardening.md#44-ansi-escape-codes-in-output)). Parsers do not need to handle colored output internally.

### TypeScript Compiler Parser

Matches the standard `tsc` output format:

```
src/services/auth.ts(42,5): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.
```

Parsed into:
```typescript
{
  source: "build-error",
  level: "error",
  message: "Argument of type 'string' is not assignable to parameter of type 'number'.",
  context: {
    file: "src/services/auth.ts",
    line: 42,
    column: 5,
    error_type: "TS2345",
    framework: "typescript",
  },
  signal_score: 60,  // build-error base (40) + stack/file:line in user code (15) + error-level (10) - adjusted for build context
  signal_strength: "high",
}
```

Multi-line TypeScript errors (e.g., type mismatch with expected/received) are grouped by detecting continuation lines that start with whitespace after an error line.

### ESLint Parser

Matches ESLint's default formatter output:

```
/home/user/project/src/utils.ts
  10:5  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  15:1  warning  Missing return type  @typescript-eslint/explicit-function-return-type
```

Parsed with file path from the header line, then each indented line becomes a separate `RuntimeEvent` with the rule name in `context.error_type`.

### Vite/webpack Build Error Parser

Matches common build tool error formats:

```
[vite] Internal server error: Failed to resolve import "./missing" from "src/App.tsx"
ERROR in ./src/App.tsx
Module not found: Error: Can't resolve './missing' in '/home/user/project/src'
```

---

## MCP Tool Contracts

### watch_for_errors

```json
{
  "name": "watch_for_errors",
  "description": "Block for N seconds and collect any new errors/warnings from the dev server. Use after editing code to verify if the fix worked. Returns only errors that appear AFTER this tool is called.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "duration_seconds": {
        "type": "number",
        "description": "How long to watch for errors (1-120 seconds). Default: 15.",
        "minimum": 1,
        "maximum": 120,
        "default": 15
      },
      "source": {
        "type": "string",
        "description": "Filter by event source. Omit to collect from all sources.",
        "enum": ["server-stdout", "server-stderr", "build-error"]
      }
    }
  }
}
```

**Example request:**
```json
{ "duration_seconds": 15 }
```

**Example response (errors found):**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"events\":[{\"id\":\"a1b2c3\",\"timestamp\":1714200015000,\"source\":\"server-stderr\",\"level\":\"error\",\"message\":\"TypeError: Cannot read property 'id' of undefined\",\"fingerprint\":\"fp:abc123\",\"signal_score\":75,\"signal_strength\":\"high\",\"context\":{\"file\":\"src/routes/users.ts\",\"line\":42,\"error_type\":\"TypeError\"}}],\"watch_duration_ms\":15000,\"hot_reload_detected\":true}"
    }
  ]
}
```

**Example response (no errors - fix worked):**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"events\":[],\"watch_duration_ms\":15000,\"hot_reload_detected\":true}"
    }
  ]
}
```

The response includes `hot_reload_detected: boolean` so the agent knows whether the server actually reloaded during the watch window. If `false`, the agent may want to wait longer or check if the dev server supports hot-reload.

### get_build_errors

```json
{
  "name": "get_build_errors",
  "description": "Get current build/compilation errors (TypeScript, ESLint, Vite/webpack). Returns only errors with source 'build-error', deduplicated by fingerprint.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "limit": {
        "type": "number",
        "description": "Maximum number of errors to return. Default: 20.",
        "default": 20,
        "maximum": 100
      }
    }
  }
}
```

**Example response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"errors\":[{\"id\":\"d4e5f6\",\"timestamp\":1714200010000,\"source\":\"build-error\",\"level\":\"error\",\"message\":\"Argument of type 'string' is not assignable to parameter of type 'number'.\",\"fingerprint\":\"fp:ts2345-auth\",\"signal_score\":60,\"signal_strength\":\"high\",\"context\":{\"file\":\"src/services/auth.ts\",\"line\":42,\"column\":5,\"error_type\":\"TS2345\",\"framework\":\"typescript\"}}],\"total_count\":1}"
    }
  ]
}
```

### get_error_context

```json
{
  "name": "get_error_context",
  "description": "Deep-dive into a specific error by fingerprint. Returns the full error, surrounding log events (±5 seconds), and total occurrence count. Use after get_errors to investigate a specific error.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "fingerprint": {
        "type": "string",
        "description": "The fingerprint of the error to investigate (from a previous get_errors or watch_for_errors response)."
      }
    },
    "required": ["fingerprint"]
  }
}
```

**Example response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"error\":{\"id\":\"a1b2c3\",\"timestamp\":1714200015000,\"source\":\"server-stderr\",\"level\":\"error\",\"message\":\"TypeError: Cannot read property 'id' of undefined\",\"fingerprint\":\"fp:abc123\",\"signal_score\":75,\"signal_strength\":\"high\",\"context\":{\"file\":\"src/routes/users.ts\",\"line\":42,\"error_type\":\"TypeError\"},\"stack_trace\":\"TypeError: Cannot read property 'id' of undefined\\n    at getUser (src/routes/users.ts:42:15)\\n    at Layer.handle (node_modules/express/lib/router/layer.js:95:5)\",\"raw\":\"TypeError: Cannot read property 'id' of undefined\\n    at getUser ...\"},\"surrounding_logs\":[{\"id\":\"x1y2z3\",\"timestamp\":1714200012000,\"source\":\"server-stdout\",\"level\":\"info\",\"message\":\"GET /api/users/123\",\"signal_score\":5,\"signal_strength\":\"low\"},{\"id\":\"h7i8j9\",\"timestamp\":1714200016000,\"source\":\"server-stdout\",\"level\":\"info\",\"message\":\"Hot-reload detected: Vite - ✓ Compiled successfully\",\"signal_score\":5,\"signal_strength\":\"low\"}],\"occurrence_count\":3}"
    }
  ]
}
```

### get_timeline

```json
{
  "name": "get_timeline",
  "description": "Get a unified chronological stream of ALL events (errors, warnings, info, hot-reload markers) in a time window. Use for full situational awareness of what happened during a period.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "since": {
        "type": "number",
        "description": "Unix timestamp in milliseconds. Events from this time onward are included."
      },
      "duration_seconds": {
        "type": "number",
        "description": "Window length in seconds. If omitted, returns events from 'since' to now."
      },
      "limit": {
        "type": "number",
        "description": "Maximum events to return. Default: 100, max: 500.",
        "default": 100,
        "maximum": 500
      }
    },
    "required": ["since"]
  }
}
```

**Example response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"events\":[{\"timestamp\":1714200010000,\"level\":\"info\",\"message\":\"Server listening on port 3000\",\"signal_strength\":\"low\"},{\"timestamp\":1714200012000,\"level\":\"info\",\"message\":\"GET /api/users/123\",\"signal_strength\":\"low\"},{\"timestamp\":1714200015000,\"level\":\"error\",\"message\":\"TypeError: Cannot read property 'id' of undefined\",\"signal_strength\":\"high\",\"fingerprint\":\"fp:abc123\"},{\"timestamp\":1714200016000,\"level\":\"info\",\"message\":\"Hot-reload detected: Vite - ✓ Compiled successfully\",\"signal_strength\":\"low\"}],\"window\":{\"from\":1714200000000,\"to\":1714200020000},\"total_in_window\":4,\"capped\":false}"
    }
  ]
}
```

---

## Internal Module Structure

Phase 2 adds these files to the `src/` tree:

```
src/
├── parsers/
│   ├── build/                    # New - build error parsers
│   │   ├── typescript-parser.ts  # TypeScript compiler error parser
│   │   ├── eslint-parser.ts      # ESLint output parser
│   │   ├── vite-webpack-parser.ts # Vite/webpack build error parser
│   │   └── index.ts              # Re-exports all build parsers
├── watch/                        # New - watch mode internals
│   ├── watch-controller.ts       # Manages blocking watch_for_errors behavior
│   ├── hot-reload-detector.ts    # Pattern matching for hot-reload events
│   ├── hot-reload-patterns.ts    # Default pattern registry (constants)
│   └── index.ts                  # Re-exports
├── query/                        # New - buffer query utilities
│   ├── timeline-query.ts         # Time-range queries on the event buffer
│   └── index.ts
├── tools/
│   ├── watch-for-errors.ts       # New MCP tool handler
│   ├── get-build-errors.ts       # New MCP tool handler
│   ├── get-error-context.ts      # New MCP tool handler
│   ├── get-timeline.ts           # New MCP tool handler
│   └── ... (Phase 1 tools)
└── ... (Phase 1 modules)
```

### Event Buffer Extension

The Phase 1 ring buffer needs one extension for Phase 2: an **event emitter** that notifies subscribers when a new event is added. This is how `watch_for_errors` receives events in real-time without polling.

```typescript
/**
 * Extension to the Phase 1 EventBuffer interface.
 *
 * Adds subscription capability so watch_for_errors can receive
 * events in real-time as they enter the buffer.
 */
interface EventBufferSubscription {
  /** Subscribe to new events. Returns an unsubscribe function. */
  subscribe(callback: (event: RuntimeEvent) => void): () => void;
}
```

The buffer emits events synchronously on `add()`. The watch controller subscribes, collects matching events into a local array, and unsubscribes when the timer fires.

---

## Constants

All Phase 2 constants are defined in `src/constants/watch.ts`:

```typescript
/** Default watch duration when not specified by the caller (seconds). */
export const DEFAULT_WATCH_DURATION_SECONDS = 15;

/** Minimum allowed watch duration (seconds). */
export const MIN_WATCH_DURATION_SECONDS = 1;

/** Maximum allowed watch duration (seconds). */
export const MAX_WATCH_DURATION_SECONDS = 120;

/** Time window (ms) around an error for surrounding log context. */
export const ERROR_CONTEXT_WINDOW_MS = 5_000;

/** Maximum surrounding log events returned by get_error_context. */
export const MAX_SURROUNDING_LOGS = 50;

/** Default limit for get_timeline results. */
export const DEFAULT_TIMELINE_LIMIT = 100;

/** Maximum limit for get_timeline results. */
export const MAX_TIMELINE_LIMIT = 500;

/** Default limit for get_build_errors results. */
export const DEFAULT_BUILD_ERRORS_LIMIT = 20;

/** Maximum limit for get_build_errors results. */
export const MAX_BUILD_ERRORS_LIMIT = 100;

/** Signal score assigned to hot-reload detection events. */
export const HOT_RELOAD_SIGNAL_SCORE = 5;

/** Base signal score for build errors (they always block the dev server). */
export const BUILD_ERROR_BASE_SIGNAL_SCORE = 40;
```

---

## Error Handling

| Scenario | Behavior |
|---|---|
| `watch_for_errors` with invalid `duration_seconds` | Return MCP error with message: `"duration_seconds must be between 1 and 120"` |
| `get_error_context` with unknown fingerprint | Return `{ error: null, surrounding_logs: [], occurrence_count: 0, message: "No error found with fingerprint: <fp>" }` |
| `get_timeline` with `since` in the future | Return empty events array with the window metadata |
| Dev server exits during `watch_for_errors` | Return immediately with collected events + synthetic exit event |
| Buffer is empty for any query | Return empty array, not an error |
| Multiple concurrent `watch_for_errors` calls | Each gets its own subscription and timer - fully independent |
