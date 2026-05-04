/**
 * Tests for manifest registration with external dashboard.
 *
 * @see src/transport/manifest-registration.ts
 */

import { describe, it, expect } from "vitest";
import { buildManifest } from "@/transport/manifest-registration.js";

describe("buildManifest", () => {
  it("builds a valid manifest object", () => {
    const manifest = buildManifest({ port: 9800, version: "0.9.14" });
    expect(manifest.tool_name).toBe("tracepulse");
    expect(manifest.display_name).toBe("TracePulse");
    expect(manifest.base_url).toContain("9800");
    expect(manifest.version).toBe("0.9.14");
    expect(manifest.manifest.widgets).toBeInstanceOf(Array);
    expect(manifest.manifest.widgets.length).toBeGreaterThan(0);
    expect(manifest.manifest.health_endpoint).toBe("/health");
  });

  it("includes correct widget data sources", () => {
    const manifest = buildManifest({ port: 9800, version: "1.0.0" });
    const sources = manifest.manifest.widgets.map((w: { data_source: string }) => w.data_source);
    expect(sources).toContain("/api/errors");
    expect(sources).toContain("/api/session");
    expect(sources).toContain("/api/patterns");
  });
});
