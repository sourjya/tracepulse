/**
 * Unit tests for fingerprint history manager.
 *
 * @see src/persistence/fingerprint-history.ts for the implementation
 */

import { describe, it, expect } from "vitest";
import { createFingerprintHistory } from "@/persistence/fingerprint-history.js";

describe("fingerprint history manager", () => {
  it("isNewFingerprint returns true for unknown fingerprint", () => {
    const mgr = createFingerprintHistory();
    expect(mgr.isNew("fp:unknown")).toBe(true);
  });

  it("isNewFingerprint returns false for known fingerprint", () => {
    const mgr = createFingerprintHistory();
    mgr.record("fp:known", Date.now());
    expect(mgr.isNew("fp:known")).toBe(false);
  });

  it("record increments total_occurrences", () => {
    const mgr = createFingerprintHistory();
    mgr.record("fp:a", 1000);
    mgr.record("fp:a", 2000);
    mgr.record("fp:a", 3000);
    const rec = mgr.getRecord("fp:a");
    expect(rec).not.toBeNull();
    expect(rec!.total_occurrences).toBe(3);
  });

  it("record updates last_seen timestamp", () => {
    const mgr = createFingerprintHistory();
    mgr.record("fp:a", 1000);
    mgr.record("fp:a", 5000);
    expect(mgr.getRecord("fp:a")!.last_seen).toBe(5000);
  });

  it("record creates new record for first occurrence", () => {
    const mgr = createFingerprintHistory();
    mgr.record("fp:new", 1000);
    const rec = mgr.getRecord("fp:new");
    expect(rec).not.toBeNull();
    expect(rec!.first_seen).toBe(1000);
    expect(rec!.total_occurrences).toBe(1);
  });

  it("getRecord returns null for unknown fingerprint", () => {
    const mgr = createFingerprintHistory();
    expect(mgr.getRecord("fp:nope")).toBeNull();
  });

  it("loadEntries populates history from persisted data", () => {
    const mgr = createFingerprintHistory();
    mgr.loadEntries([
      { fingerprint: "fp:old", first_seen: 100, last_seen: 200, total_count: 5 },
    ]);
    expect(mgr.isNew("fp:old")).toBe(false);
    expect(mgr.getRecord("fp:old")!.total_occurrences).toBe(5);
  });

  it("exportEntries returns all records", () => {
    const mgr = createFingerprintHistory();
    mgr.record("fp:a", 1000);
    mgr.record("fp:b", 2000);
    const entries = mgr.exportEntries();
    expect(entries).toHaveLength(2);
  });
});
