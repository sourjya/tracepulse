/**
 * Unit tests for Phase 3 service constants.
 *
 * Validates service status values, correlation defaults, persistence limits,
 * and transport defaults.
 *
 * @see src/constants/services.ts for the constants under test
 */

import { describe, it, expect } from "vitest";
import {
  SERVICE_STATUSES,
  CORRELATION_WINDOW_MS,
  MAX_PERSISTED_FINGERPRINTS,
  DEFAULT_HTTP_PORT,
  FINGERPRINT_PERSISTENCE_PATH,
} from "@/constants/services.js";

describe("service constants", () => {
  it("SERVICE_STATUSES contains exactly: running, stopped, crashed, restarting", () => {
    expect(SERVICE_STATUSES).toEqual(["running", "stopped", "crashed", "restarting"]);
  });

  it("CORRELATION_WINDOW_MS defaults to 2000", () => {
    expect(CORRELATION_WINDOW_MS).toBe(2000);
  });

  it("MAX_PERSISTED_FINGERPRINTS is 5000", () => {
    expect(MAX_PERSISTED_FINGERPRINTS).toBe(5000);
  });

  it("DEFAULT_HTTP_PORT is 9800", () => {
    expect(DEFAULT_HTTP_PORT).toBe(9800);
  });

  it("FINGERPRINT_PERSISTENCE_PATH is .tracepulse/fingerprints.json", () => {
    expect(FINGERPRINT_PERSISTENCE_PATH).toBe(".tracepulse/fingerprints.json");
  });
});
