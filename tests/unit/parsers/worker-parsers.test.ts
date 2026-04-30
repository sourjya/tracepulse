/**
 * Tests for background worker parsers (Celery, Sidekiq, BullMQ).
 */

import { describe, it, expect } from "vitest";
import { celeryParser } from "@/parsers/celery-parser.js";
import { sidekiqParser } from "@/parsers/sidekiq-parser.js";
import { bullmqParser } from "@/parsers/bullmq-parser.js";

describe("celeryParser", () => {
  it("parses task raised error", () => {
    const line = "Task myapp.tasks.send_email[abc-123] raised ValueError('Invalid email')";
    expect(celeryParser.canParse(line)).toBe(true);
    const result = celeryParser.parse(line);
    expect(result).not.toBeNull();
    expect(result!.level).toBe("error");
    expect(result!.context.framework).toBe("celery");
    // task name is in message.toBe("myapp.tasks.send_email");
    expect(result!.message).toContain("raised");
  });

  it("parses task retry", () => {
    const line = "Task myapp.tasks.process[def-456] retry";
    expect(celeryParser.canParse(line)).toBe(true);
    const result = celeryParser.parse(line);
    expect(result!.level).toBe("warn");
  });

  it("parses task timeout", () => {
    const line = "TimeLimitExceeded: Task myapp.tasks.heavy_job";
    expect(celeryParser.canParse(line)).toBe(true);
    const result = celeryParser.parse(line);
    expect(result!.level).toBe("error");
    expect(result!.context.error_type).toBe("TimeLimitExceeded");
  });

  it("parses task succeeded", () => {
    const line = "Task myapp.tasks.send_email[abc-123] succeeded in 0.5s";
    expect(celeryParser.canParse(line)).toBe(true);
    const result = celeryParser.parse(line);
    expect(result!.level).toBe("info");
  });

  it("ignores unrelated lines", () => {
    expect(celeryParser.canParse("GET /api/users 200")).toBe(false);
  });
});

describe("sidekiqParser", () => {
  it("parses WARN job error", () => {
    const line = "WARN: MyWorker::SendEmail JID-abc123def456 Error: connection refused";
    expect(sidekiqParser.canParse(line)).toBe(true);
    const result = sidekiqParser.parse(line);
    expect(result).not.toBeNull();
    expect(result!.level).toBe("warn");
    expect(result!.context.framework).toBe("sidekiq");
  });

  it("parses FATAL job error", () => {
    const line = "FATAL: MyWorker::Process JID-abc123 Segfault in native extension";
    expect(sidekiqParser.canParse(line)).toBe(true);
    const result = sidekiqParser.parse(line);
    expect(result!.level).toBe("error");
  });

  it("parses job done", () => {
    const line = "MyWorker::SendEmail JID-abc123def456 done: 1.234";
    expect(sidekiqParser.canParse(line)).toBe(true);
    const result = sidekiqParser.parse(line);
    expect(result!.level).toBe("info");
    expect(result!.message).toContain("done in 1.234s");
  });

  it("ignores unrelated lines", () => {
    expect(sidekiqParser.canParse("INFO: Starting processing")).toBe(false);
  });
});

describe("bullmqParser", () => {
  it("parses job failed", () => {
    const line = "[email] Job 42 failed with Error: SMTP timeout";
    expect(bullmqParser.canParse(line)).toBe(true);
    const result = bullmqParser.parse(line);
    expect(result).not.toBeNull();
    expect(result!.level).toBe("error");
    expect(result!.context.framework).toBe("bullmq");
    expect(result!.message).toContain("queue: email");
  });

  it("parses job failed without queue prefix", () => {
    const line = "Job abc-123 failed";
    expect(bullmqParser.canParse(line)).toBe(true);
    const result = bullmqParser.parse(line);
    expect(result!.message).toContain("queue: default");
  });

  it("parses job stalled", () => {
    const line = "[payments] Job 99 stalled";
    expect(bullmqParser.canParse(line)).toBe(true);
    const result = bullmqParser.parse(line);
    expect(result!.level).toBe("warn");
    expect(result!.context.error_type).toBe("BullMQJobStalled");
  });

  it("parses job completed", () => {
    const line = "[email] Job 42 completed";
    expect(bullmqParser.canParse(line)).toBe(true);
    const result = bullmqParser.parse(line);
    expect(result!.level).toBe("info");
  });

  it("parses bullmq error", () => {
    const line = "BullMQ Error: Redis connection lost";
    expect(bullmqParser.canParse(line)).toBe(true);
    const result = bullmqParser.parse(line);
    expect(result!.level).toBe("error");
  });

  it("ignores unrelated lines", () => {
    expect(bullmqParser.canParse("GET /api/jobs 200")).toBe(false);
  });
});
