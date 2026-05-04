/**
 * Tests for start_server process spawning and Layer 2 activation.
 *
 * @see src/tools/start-server.ts
 */

import { describe, it, expect } from "vitest";
import { handleStartServer, createServerManager } from "@/tools/start-server.js";

describe("start_server spawning", () => {
  it("returns ready status for valid command", async () => {
    const mgr = createServerManager();
    const result = await handleStartServer(mgr, { command: "node --version" });
    const text = (result as { content: Array<{ text: string }> }).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.status).toBe("ready");
    expect(parsed.command).toBe("node --version");
  });

  it("returns invalid for shell syntax", async () => {
    const mgr = createServerManager();
    const result = await handleStartServer(mgr, { command: "PYTHONPATH=src python app.py" });
    const text = (result as { content: Array<{ text: string }> }).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.status).toBe("invalid");
  });

  it("blocks when server already running", async () => {
    const mgr = createServerManager();
    mgr.setRunning("main", 999);
    const result = await handleStartServer(mgr, { command: "npm run dev" });
    const text = (result as { content: Array<{ text: string }> }).content[0].text;
    expect(text).toContain("already running");
  });

  it("accepts env parameter", async () => {
    const mgr = createServerManager();
    const result = await handleStartServer(mgr, {
      command: "python -m app",
      env: { PYTHONPATH: "src" },
    });
    const text = (result as { content: Array<{ text: string }> }).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.status).toBe("ready");
  });
});
