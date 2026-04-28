/**
 * Unit tests for crash loop detector, infra patterns, migration parser, env validator.
 *
 * @see src/pipeline/crash-loop-detector.ts
 * @see src/scoring/infra-patterns.ts
 * @see src/parsers/migration-parser.ts
 * @see src/infra/env-validator.ts
 */

import { describe, it, expect } from "vitest";
import { createCrashLoopDetector } from "@/pipeline/crash-loop-detector.js";
import { matchInfraPattern } from "@/scoring/infra-patterns.js";
import { migrationParser } from "@/parsers/migration-parser.js";
import type { RuntimeEvent } from "@/types/events.js";

function makeEvent(overrides: Partial<RuntimeEvent> = {}): RuntimeEvent {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    source: "server-stderr",
    service: "main",
    level: "info",
    message: "test",
    fingerprint: `fp:${crypto.randomUUID()}`,
    signal_score: 5,
    signal_strength: "low",
    context: {},
    raw: "test",
    first_seen: Date.now(),
    occurrence_count: 1,
    ...overrides,
  };
}

describe("crash loop detector", () => {
  it("does not trigger for fewer than 3 restarts", () => {
    const alerts: RuntimeEvent[] = [];
    const detect = createCrashLoopDetector((e) => alerts.push(e));
    const now = Date.now();

    detect(makeEvent({ fingerprint: "hotreload:uvicorn-reload", timestamp: now }));
    detect(makeEvent({ fingerprint: "hotreload:uvicorn-reload", timestamp: now + 1000 }));

    expect(alerts).toHaveLength(0);
  });

  it("triggers for 3+ restarts within 60s", () => {
    const alerts: RuntimeEvent[] = [];
    const detect = createCrashLoopDetector((e) => alerts.push(e));
    const now = Date.now();

    detect(makeEvent({ fingerprint: "hotreload:uvicorn-reload", timestamp: now }));
    detect(makeEvent({ fingerprint: "hotreload:uvicorn-reload", timestamp: now + 5000 }));
    detect(makeEvent({ fingerprint: "hotreload:uvicorn-reload", timestamp: now + 10000 }));

    expect(alerts).toHaveLength(1);
    expect(alerts[0].signal_score).toBe(95);
    expect(alerts[0].message).toContain("CRASH LOOP");
  });

  it("ignores non-restart events", () => {
    const alerts: RuntimeEvent[] = [];
    const detect = createCrashLoopDetector((e) => alerts.push(e));

    detect(makeEvent({ fingerprint: "fp:regular-error" }));
    detect(makeEvent({ fingerprint: "fp:another-error" }));
    detect(makeEvent({ fingerprint: "fp:third-error" }));

    expect(alerts).toHaveLength(0);
  });
});

describe("infra patterns", () => {
  it("matches connection refused", () => {
    const match = matchInfraPattern("Error: connect ECONNREFUSED 127.0.0.1:5432");
    expect(match).toBeDefined();
    expect(match!.category).toBe("connectivity");
  });

  it("matches OOM", () => {
    const match = matchInfraPattern("FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed - JavaScript heap out of memory");
    expect(match).toBeDefined();
    expect(match!.category).toBe("memory");
  });

  it("matches connection pool exhaustion", () => {
    const match = matchInfraPattern("connection pool exhausted: too many open connections");
    expect(match).toBeDefined();
    expect(match!.category).toBe("db/pool");
  });

  it("returns undefined for non-infra errors", () => {
    expect(matchInfraPattern("TypeError: Cannot read property 'id'")).toBeUndefined();
  });
});

describe("migration parser", () => {
  it("parses alembic upgrade", () => {
    const line = "INFO  [alembic.runtime.migration] Running upgrade abc123 -> def456, add users table";
    expect(migrationParser.canParse(line)).toBe(true);
    const result = migrationParser.parse(line);
    expect(result).not.toBeNull();
    expect(result!.level).toBe("info");
    expect(result!.context.framework).toBe("alembic");
  });

  it("parses Django migration", () => {
    const line = "  Applying auth.0001_initial... OK";
    expect(migrationParser.canParse(line)).toBe(true);
    const result = migrationParser.parse(line);
    expect(result).not.toBeNull();
    expect(result!.context.framework).toBe("django");
  });

  it("parses alembic error as error level", () => {
    const line = "alembic.util.exc.CommandError: Can't locate revision identified by 'abc123'";
    const result = migrationParser.parse(line);
    expect(result).not.toBeNull();
    expect(result!.level).toBe("error");
  });

  it("does not match non-migration lines", () => {
    expect(migrationParser.canParse("GET /api/users 200")).toBe(false);
  });
});
