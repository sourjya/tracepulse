/**
 * Hot-reload pattern registry for dev server output detection.
 *
 * Defines the HotReloadPattern interface and a default set of patterns
 * that match hot-reload/restart messages from common dev tools:
 * Vite, webpack, nodemon, Next.js, and ts-node-dev.
 *
 * The hot-reload detector checks each stdout/stderr line against these
 * patterns and injects synthetic RuntimeEvent markers into the event buffer
 * when a match is found.
 *
 * @see src/watch/hot-reload-detector.ts for the detector that uses these patterns
 * @see .kiro/specs/phase2-watch-mode/design.md for pattern specifications
 */

/**
 * A pattern that identifies a hot-reload event in dev server output.
 *
 * Each pattern matches a specific dev tool's reload/restart message.
 * The registry is checked against every stdout/stderr line.
 */
export interface HotReloadPattern {
  /** Unique identifier for this pattern (e.g., "vite-compiled"). */
  readonly id: string;
  /** Human-readable name of the dev tool (e.g., "Vite"). */
  readonly tool: string;
  /** Regex to match against a log line. */
  readonly pattern: RegExp;
  /** Description of what this pattern indicates. */
  readonly description: string;
}

/**
 * Default hot-reload patterns covering the most common dev tools.
 *
 * Patterns use case-insensitive matching. Each regex is designed to be
 * specific enough to avoid false positives on unrelated log lines.
 */
export const DEFAULT_PATTERNS: readonly HotReloadPattern[] = [
  {
    id: "vite-compiled",
    tool: "Vite",
    pattern: /✓ compiled|ready in \d+/i,
    description: "Vite compilation success or dev server ready",
  },
  {
    id: "vite-hmr",
    tool: "Vite",
    pattern: /\[vite\] hmr update/i,
    description: "Vite HMR module update",
  },
  {
    id: "webpack-compiled",
    tool: "webpack",
    pattern: /compiled (successfully|with \d+ warning)/i,
    description: "webpack compilation completed",
  },
  {
    id: "nodemon-restart",
    tool: "nodemon",
    pattern: /\[nodemon\] restarting due to/i,
    description: "nodemon detected file change and is restarting",
  },
  {
    id: "nodemon-starting",
    tool: "nodemon",
    pattern: /\[nodemon\] starting/i,
    description: "nodemon starting the application",
  },
  {
    id: "nextjs-compiled",
    tool: "Next.js",
    pattern: /✓ ready in|compiled client and server/i,
    description: "Next.js compilation success or dev server ready",
  },
  {
    id: "nextjs-compiling",
    tool: "Next.js",
    pattern: /compiling \//i,
    description: "Next.js compiling a route",
  },
  {
    id: "tsnode-restart",
    tool: "ts-node-dev",
    pattern: /restarting|compilation complete/i,
    description: "ts-node-dev restart or compilation complete",
  },
  {
    id: "uvicorn-reload",
    tool: "uvicorn",
    pattern: /WatchFiles detected changes|Started reloader process|Shutting down$/i,
    description: "uvicorn --reload detected file changes",
  },
  {
    id: "django-reload",
    tool: "Django",
    pattern: /Watching for file changes|Performing system checks/i,
    description: "Django dev server auto-reload",
  },
  {
    id: "flask-reload",
    tool: "Flask",
    pattern: /Restarting with (stat|watchdog)|Detected change in/i,
    description: "Flask dev server auto-reload",
  },
];
