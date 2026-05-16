/**
 * Tests for free_port tool - kills process occupying a port.
 *
 * @see src/tools/free-port.ts
 */

import { describe, it, expect } from "vitest";
import { handleFreePort } from "@/tools/free-port.js";

describe("handleFreePort", () => {
  it("requires port parameter", async () => {
    const result = await handleFreePort({});
    const text = (result as { content: Array<{ text: string }> }).content[0].text;
    expect(text).toContain("port");
    expect((result as { isError?: boolean }).isError).toBe(true);
  });

  it("reports port already free", async () => {
    // Use a port that's almost certainly not in use
    const result = await handleFreePort({ port: 59999 });
    const text = (result as { content: Array<{ text: string }> }).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.status).toBe("already_free");
  });
});
