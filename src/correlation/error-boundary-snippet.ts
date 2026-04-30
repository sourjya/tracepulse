/**
 * TracePulse ErrorBoundary bridge snippet.
 *
 * Drop this into your React app's ErrorBoundary to send crash reports
 * to TracePulse's log collector. The agent will see frontend crashes
 * in get_errors() alongside backend errors.
 *
 * Usage in React ErrorBoundary:
 *
 *   componentDidCatch(error, errorInfo) {
 *     reportCrashToTracePulse(error, errorInfo.componentStack);
 *   }
 *
 * Or with a global handler:
 *
 *   window.addEventListener('error', (e) => {
 *     reportCrashToTracePulse(e.error);
 *   });
 *
 * @param port - TracePulse log collector port (default 9801)
 */
export function reportCrashToTracePulse(
  error: Error,
  componentStack?: string | null,
  port = 9801,
): void {
  try {
    fetch(`http://localhost:${port}/api/v1/crashes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        componentStack: componentStack ?? undefined,
        url: typeof globalThis !== "undefined" && "location" in globalThis
          ? String((globalThis as unknown as { location: { href: string } }).location.href) : undefined,
      }),
    }).catch(() => {
      // TracePulse not running - silently ignore
    });
  } catch {
    // Never crash the app because of crash reporting
  }
}
