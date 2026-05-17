/**
 * Integration tests for DevLoop Agent cross-layer diagnosis.
 *
 * Each test simulates a real-world dev-session failure scenario by injecting
 * events into a real ring buffer and frontend error buffer, then calling the
 * tool handler and verifying the diagnosis matches the expected pattern.
 *
 * These tests serve as the regression suite recommended by the v2 spec:
 * "Every manually-caught misdiagnosis becomes a test case."
 */

import { describe, it, expect } from "vitest";
import { handleGetCrossLayerDiagnosis } from "@/tools/get-cross-layer-diagnosis.js";
import { createRingBuffer } from "@/store/ring-buffer.js";
import { createFrontendErrorBuffer } from "@/correlation/frontend-error-buffer.js";
import { makeEvent } from "../helpers/make-event.js";

describe("DevLoop Agent - Real-World Scenarios", () => {
  describe("Scenario: Backend 200 + Frontend TypeError (auth token expired)", () => {
    it("diagnoses response format mismatch when backend succeeds but frontend crashes", async () => {
      const buffer = createRingBuffer();
      const now = Date.now();

      // Backend returned 200 OK
      buffer.push(makeEvent({
        timestamp: now - 3000,
        level: "info",
        message: "GET /api/chat 200 12ms",
        context: { http_status: 200 },
        service: "main",
      }));

      // Frontend crash bridge: TypeError in the response handler
      buffer.push(makeEvent({
        timestamp: now - 1000,
        level: "error",
        service: "frontend",
        message: "[Frontend] TypeError: Cannot read properties of undefined (reading 'message')",
        context: { error_type: "TypeError", file: "src/hooks/useAIChat.ts", line: 133 },
      }));

      const result = await handleGetCrossLayerDiagnosis(buffer, {}, "/tmp");
      const parsed = JSON.parse((result.content[0] as { text: string }).text);

      expect(parsed.diagnoses.length).toBeGreaterThanOrEqual(1);
      const diag = parsed.diagnoses.find((d: { pattern_id: string }) => d.pattern_id === "backend-ok-frontend-error");
      expect(diag).toBeDefined();
      expect(diag.confidence).toBeGreaterThanOrEqual(75);
      expect(diag.layers_involved).toContain("backend");
      expect(diag.layers_involved).toContain("frontend");
    });
  });

  describe("Scenario: Rate limit hit from eval run", () => {
    it("diagnoses rate limiter bucket full on 429", async () => {
      const buffer = createRingBuffer();
      const now = Date.now();

      // Backend returned 429
      buffer.push(makeEvent({
        timestamp: now - 2000,
        level: "error",
        message: "POST /api/v1/completions 429 Too Many Requests",
        context: { http_status: 429 },
      }));

      const result = await handleGetCrossLayerDiagnosis(buffer, {}, "/tmp");
      const parsed = JSON.parse((result.content[0] as { text: string }).text);

      const diag = parsed.diagnoses.find((d: { pattern_id: string }) => d.pattern_id === "rate-limited");
      expect(diag).toBeDefined();
      expect(diag.confidence).toBeGreaterThanOrEqual(85);
      expect(diag.proposed_fix).toBeTruthy(); // High confidence = fix included
    });
  });

  describe("Scenario: Same error 3x in 5 minutes", () => {
    it("diagnoses non-transient error requiring root cause investigation", async () => {
      const buffer = createRingBuffer();
      const now = Date.now();

      // Error with high occurrence count
      buffer.push(makeEvent({
        timestamp: now - 5000,
        level: "error",
        message: "ECONNREFUSED 127.0.0.1:5432 - Connection refused",
        occurrence_count: 4,
        fingerprint: "fp-db-conn-refused",
        context: { error_type: "Error" },
      }));

      const result = await handleGetCrossLayerDiagnosis(buffer, {}, "/tmp");
      const parsed = JSON.parse((result.content[0] as { text: string }).text);

      const diag = parsed.diagnoses.find((d: { pattern_id: string }) => d.pattern_id === "repeated-error");
      expect(diag).toBeDefined();
      expect(diag.confidence).toBeGreaterThanOrEqual(70);
      expect(diag.diagnosis).toContain("multiple times");
    });
  });

  describe("Scenario: Schema validation failure (422)", () => {
    it("diagnoses field validation error on 422", async () => {
      const buffer = createRingBuffer();
      const now = Date.now();

      buffer.push(makeEvent({
        timestamp: now - 1000,
        level: "error",
        message: "POST /api/ingredients 422 Unprocessable Entity",
        context: { http_status: 422 },
      }));

      const result = await handleGetCrossLayerDiagnosis(buffer, {}, "/tmp");
      const parsed = JSON.parse((result.content[0] as { text: string }).text);

      const diag = parsed.diagnoses.find((d: { pattern_id: string }) => d.pattern_id === "schema-validation");
      expect(diag).toBeDefined();
      expect(diag.confidence).toBeGreaterThanOrEqual(85);
      expect(diag.proposed_fix).toBeTruthy();
    });
  });

  describe("Scenario: Auth token expired (401)", () => {
    it("diagnoses authentication failure on 401", async () => {
      const buffer = createRingBuffer();
      const now = Date.now();

      buffer.push(makeEvent({
        timestamp: now - 2000,
        level: "error",
        message: "GET /api/me 401 Unauthorized",
        context: { http_status: 401 },
      }));

      const result = await handleGetCrossLayerDiagnosis(buffer, {}, "/tmp");
      const parsed = JSON.parse((result.content[0] as { text: string }).text);

      const diag = parsed.diagnoses.find((d: { pattern_id: string }) => d.pattern_id === "auth-expired");
      expect(diag).toBeDefined();
      expect(diag.confidence).toBeGreaterThanOrEqual(80);
    });
  });

  describe("Scenario: No signals in time window", () => {
    it("returns helpful no_diagnosis_reason when server is idle", async () => {
      const buffer = createRingBuffer();
      const result = await handleGetCrossLayerDiagnosis(buffer, { time_window_seconds: 5 }, "/tmp");
      const parsed = JSON.parse((result.content[0] as { text: string }).text);

      expect(parsed.diagnoses).toEqual([]);
      expect(parsed.no_diagnosis_reason).toContain("No signals");
      expect(parsed.missing_signals).toContain("backend");
    });
  });

  describe("Scenario: Response includes snapshot metadata", () => {
    it("always includes snapshot_timestamp and missing_signals", async () => {
      const buffer = createRingBuffer();
      const now = Date.now();
      buffer.push(makeEvent({ timestamp: now - 1000, level: "error", message: "err" }));

      const result = await handleGetCrossLayerDiagnosis(buffer, {}, "/tmp");
      const parsed = JSON.parse((result.content[0] as { text: string }).text);

      expect(parsed.snapshot_timestamp).toBeTruthy();
      expect(parsed.missing_signals).toBeDefined();
      expect(Array.isArray(parsed.missing_signals)).toBe(true);
    });
  });
});
