/**
 * Unit tests for hot-reload detector.
 *
 * Validates that the detector matches dev tool output lines against
 * the pattern registry and produces correctly-shaped synthetic RuntimeEvents
 * with appropriate signal scoring.
 *
 * @see src/watch/hot-reload-detector.ts for the implementation
 */

import { describe, it, expect } from "vitest";
import { detectHotReload } from "@/watch/hot-reload-detector.js";

describe("hot-reload detector", () => {
  it("matches a Vite compilation success line and produces a RuntimeEvent", () => {
    const event = detectHotReload("✓ compiled successfully in 245ms");
    expect(event).not.toBeNull();
    expect(event!.message).toContain("Vite");
    expect(event!.level).toBe("info");
    expect(event!.source).toBe("server-stdout");
  });

  it("matches a nodemon restart line", () => {
    const event = detectHotReload("[nodemon] restarting due to changes...");
    expect(event).not.toBeNull();
    expect(event!.message).toContain("nodemon");
  });

  it("ignores non-matching lines", () => {
    expect(detectHotReload("GET /api/users 200 15ms")).toBeNull();
    expect(detectHotReload("Server listening on port 3000")).toBeNull();
    expect(detectHotReload("TypeError: Cannot read property")).toBeNull();
  });

  it("synthetic event has correct fields", () => {
    const event = detectHotReload("[vite] hmr update /src/App.tsx");
    expect(event).not.toBeNull();
    expect(event!.level).toBe("info");
    expect(event!.source).toBe("server-stdout");
    expect(event!.signal_score).toBe(5);
    expect(event!.signal_strength).toBe("low");
    expect(event!.service).toBe("main");
    expect(event!.occurrence_count).toBe(1);
  });

  it("synthetic event fingerprint follows hotreload:{pattern.id} format", () => {
    const event = detectHotReload("[nodemon] starting `node server.js`");
    expect(event).not.toBeNull();
    expect(event!.fingerprint).toBe("hotreload:nodemon-starting");
  });

  it("synthetic event context includes framework", () => {
    const event = detectHotReload("Compiling /api/users...");
    expect(event).not.toBeNull();
    expect(event!.context.framework).toBe("next.js");
  });

  it("works with custom patterns", () => {
    const custom = [
      {
        id: "custom-reload",
        tool: "MyTool",
        pattern: /\[mytool\] reloaded/i,
        description: "Custom tool reload",
      },
    ];
    const event = detectHotReload("[mytool] reloaded", custom);
    expect(event).not.toBeNull();
    expect(event!.fingerprint).toBe("hotreload:custom-reload");
    expect(event!.context.framework).toBe("mytool");
  });

  it("returns null for custom patterns when line does not match", () => {
    const custom = [
      {
        id: "custom-reload",
        tool: "MyTool",
        pattern: /\[mytool\] reloaded/i,
        description: "Custom tool reload",
      },
    ];
    expect(detectHotReload("unrelated line", custom)).toBeNull();
  });
});
