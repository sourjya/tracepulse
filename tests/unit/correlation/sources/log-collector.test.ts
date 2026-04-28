/**
 * Unit tests for log collector HTTP server.
 *
 * @see src/correlation/sources/log-collector.ts for the implementation
 */

import { describe, it, expect, afterAll } from "vitest";
import { createLogCollector } from "@/correlation/sources/log-collector.js";
import type { FrontendError } from "@/correlation/types.js";

describe("log collector HTTP server", () => {
  it("POST /api/v1/errors with valid payload → emits FrontendError", async () => {
    const received: FrontendError[] = [];
    const collector = createLogCollector(0, (err) => received.push(err)); // port 0 = random
    await collector.start();
    const port = collector.port();

    const res = await fetch(`http://127.0.0.1:${port}/api/v1/errors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "http://localhost:3000/api/users",
        method: "GET",
        statusCode: 500,
        statusText: "Internal Server Error",
      }),
    });

    expect(res.status).toBe(201);
    expect(received).toHaveLength(1);
    expect(received[0].statusCode).toBe(500);
    await collector.stop();
  });

  it("POST with malformed JSON → 400", async () => {
    const collector = createLogCollector(0, () => {});
    await collector.start();
    const port = collector.port();

    const res = await fetch(`http://127.0.0.1:${port}/api/v1/errors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json{{{",
    });

    expect(res.status).toBe(400);
    await collector.stop();
  });

  it("GET /api/v1/health → 200", async () => {
    const collector = createLogCollector(0, () => {});
    await collector.start();
    const port = collector.port();

    const res = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("ok");
    await collector.stop();
  });

  it("server binds to 127.0.0.1 only", () => {
    const collector = createLogCollector(0, () => {});
    expect(collector.host()).toBe("127.0.0.1");
  });
});
