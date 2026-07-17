/**
 * Tests for buildExecEnv — the least-privilege child-process environment
 * builder (TRP-55, SRR-003 M-003). Default policy is pass-through MINUS
 * secret-shaped vars, so a spawned command cannot harvest the developer's
 * secrets (e.g. `bash -c env`) while ordinary config (NODE_ENV, CI) still works.
 *
 * @see src/tools/exec-env.ts
 * @see .kiro/specs/m28-safe-command-execution/ (Feature 1)
 */

import { describe, it, expect } from "vitest";
import { buildExecEnv } from "@/tools/exec-env.js";

const SRC = {
  NODE_ENV: "test",
  CI: "true",
  PATH: "/usr/bin",
  APP_MODE: "prod",
  AWS_REGION: "us-east-1",
  MY_API_TOKEN: "plainvalue",
  AWS_SECRET_ACCESS_KEY: "x",
  DATABASE_URL: "postgres://u:p@h/db",
  WEIRD: "AKIAIOSFODNN7EXAMPLE", // secret-shaped VALUE, innocuous name
};

describe("buildExecEnv (TRP-55 env scrub)", () => {
  it("keeps ordinary vars so the inner loop still works", () => {
    const env = buildExecEnv(undefined, { source: SRC });
    expect(env.NODE_ENV).toBe("test");
    expect(env.CI).toBe("true");
    expect(env.APP_MODE).toBe("prod");
    expect(env.PATH).toBe("/usr/bin");
    expect(env.AWS_REGION).toBe("us-east-1"); // non-secret AWS var kept
  });

  it("drops secret-shaped names", () => {
    const env = buildExecEnv(undefined, { source: SRC });
    expect(env.MY_API_TOKEN).toBeUndefined();
    expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(env.DATABASE_URL).toBeUndefined();
  });

  it("drops vars whose VALUE looks like a secret even with an innocuous name", () => {
    const env = buildExecEnv(undefined, { source: SRC });
    expect(env.WEIRD).toBeUndefined();
  });

  it("passes through agent-declared env even if secret-named (explicit intent)", () => {
    const env = buildExecEnv({ MY_API_TOKEN: "explicit" }, { source: SRC });
    expect(env.MY_API_TOKEN).toBe("explicit");
  });

  it("inheritAll opt-out keeps everything", () => {
    const env = buildExecEnv(undefined, { source: SRC, inheritAll: true });
    expect(env.MY_API_TOKEN).toBe("plainvalue");
    expect(env.AWS_SECRET_ACCESS_KEY).toBe("x");
    expect(env.DATABASE_URL).toBe("postgres://u:p@h/db");
  });
});
