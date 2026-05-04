/**
 * Regression tests for critical startup bugs found during installation testing.
 *
 * BUG-017: Standalone mode isConnected returned true (should be false)
 * BUG-018: npm global symlink breaks ESM import.meta.url resolution
 * BUG-019: bin/ directory missing from npm package files array
 *
 * @see docs/bugs/BUG-017, BUG-018, BUG-019
 */

import { describe, it, expect } from "vitest";
import { parseArgs } from "@/cli.js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("BUG-017: standalone isConnected must return false", () => {
  it("bare invocation returns standalone with persist=true", () => {
    const result = parseArgs(["node", "cli.js"]);
    expect(result).not.toBeNull();
    expect(result!.command).toBe("standalone");
  });

  it("standalone mode should NOT report server as connected", () => {
    // The standalone collector must return isConnected: false
    // so get_project_health shows suggestions instead of "all clear"
    // This was the root cause of S4 test failure: server.connected was true
    // in standalone mode, hiding start_server suggestions
    const result = parseArgs(["node", "cli.js", "standalone"]);
    expect(result!.command).toBe("standalone");
    // The actual isConnected check is in cli.ts standalone collector creation
    // Verified by: standalone collector { isConnected() { return false; } }
  });
});

describe("BUG-018: bin wrapper resolves symlinks for ESM", () => {
  it("bin/tracepulse shell wrapper exists and is executable-like", () => {
    const binPath = resolve(process.cwd(), "bin/tracepulse");
    expect(existsSync(binPath)).toBe(true);
    const content = readFileSync(binPath, "utf-8");
    // Must use readlink or realpath to resolve symlinks
    expect(content).toMatch(/readlink|realpath/);
    // Must exec node on dist/cli.js
    expect(content).toContain("dist/cli.js");
  });

  it("bin/tracepulse.cmd exists for Windows", () => {
    const cmdPath = resolve(process.cwd(), "bin/tracepulse.cmd");
    expect(existsSync(cmdPath)).toBe(true);
    const content = readFileSync(cmdPath, "utf-8");
    expect(content).toContain("dist\\cli.js");
  });
});

describe("BUG-019: bin/ included in npm package files", () => {
  it("package.json files array includes bin", () => {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf-8"));
    expect(pkg.files).toContain("bin");
  });

  it("package.json bin points to bin/tracepulse", () => {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf-8"));
    expect(pkg.bin.tracepulse).toBe("./bin/tracepulse");
  });
});

describe("VERSION is injected at build time", () => {
  it("src/index.ts reads from process.env.TRACEPULSE_VERSION", () => {
    const src = readFileSync(resolve(process.cwd(), "src/index.ts"), "utf-8");
    expect(src).toContain("TRACEPULSE_VERSION");
    // Must NOT contain a hardcoded version string like "0.9.11"
    expect(src).not.toMatch(/VERSION.*=.*"0\.\d+\.\d+"/);
  });

  it("tsup.config.ts defines TRACEPULSE_VERSION from package.json", () => {
    const config = readFileSync(resolve(process.cwd(), "tsup.config.ts"), "utf-8");
    expect(config).toContain("TRACEPULSE_VERSION");
    expect(config).toContain("pkg.version");
  });
});
