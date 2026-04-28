/**
 * Unit tests for fingerprint persistence store.
 *
 * Tests load/save of fingerprint data to JSON files, including
 * missing file handling, corrupted file recovery, and LRU eviction.
 *
 * @see src/persistence/fingerprint-store.ts for the implementation
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  loadFingerprints,
  saveFingerprints,
  type PersistedFingerprintEntry,
} from "@/persistence/fingerprint-store.js";
import * as node_fs from "node:fs";

vi.mock("node:fs");
const mockFs = vi.mocked(node_fs);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("loadFingerprints", () => {
  it("reads valid JSON file and returns entries", () => {
    const data = {
      version: 1,
      written_at: Date.now(),
      entries: [
        { fingerprint: "fp:1", first_seen: 1000, last_seen: 2000, total_count: 5 },
      ],
    };
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify(data));

    const result = loadFingerprints("/path/fp.json");
    expect(result).toHaveLength(1);
    expect(result[0].fingerprint).toBe("fp:1");
  });

  it("missing file returns empty array", () => {
    mockFs.existsSync.mockReturnValue(false);
    expect(loadFingerprints("/missing.json")).toEqual([]);
  });

  it("corrupted file logs warning and returns empty array", () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue("not json{{{");

    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const result = loadFingerprints("/corrupt.json");
    expect(result).toEqual([]);
    expect(stderrSpy).toHaveBeenCalled();
    stderrSpy.mockRestore();
  });
});

describe("saveFingerprints", () => {
  it("writes valid JSON with version and written_at", () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.writeFileSync.mockImplementation(() => {});

    const entries: PersistedFingerprintEntry[] = [
      { fingerprint: "fp:1", first_seen: 1000, last_seen: 2000, total_count: 3 },
    ];

    saveFingerprints("/path/fp.json", entries);

    expect(mockFs.writeFileSync).toHaveBeenCalled();
    const written = JSON.parse(
      (mockFs.writeFileSync as any).mock.calls[0][1] as string,
    );
    expect(written.version).toBe(1);
    expect(written.written_at).toBeGreaterThan(0);
    expect(written.entries).toHaveLength(1);
  });

  it("creates directory if it does not exist", () => {
    mockFs.existsSync.mockReturnValue(false);
    mockFs.mkdirSync.mockImplementation(() => undefined as any);
    mockFs.writeFileSync.mockImplementation(() => {});

    saveFingerprints("/new-dir/fp.json", []);
    expect(mockFs.mkdirSync).toHaveBeenCalled();
  });

  it("caps entries at MAX_PERSISTED_FINGERPRINTS, evicting oldest by last_seen", () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.writeFileSync.mockImplementation(() => {});

    // Create 5001 entries
    const entries: PersistedFingerprintEntry[] = [];
    for (let i = 0; i < 5001; i++) {
      entries.push({
        fingerprint: `fp:${i}`,
        first_seen: 1000,
        last_seen: i, // oldest have lowest last_seen
        total_count: 1,
      });
    }

    saveFingerprints("/path/fp.json", entries);

    const written = JSON.parse(
      (mockFs.writeFileSync as any).mock.calls[0][1] as string,
    );
    expect(written.entries).toHaveLength(5000);
    // Oldest (last_seen=0) should be evicted
    expect(written.entries.find((e: any) => e.fingerprint === "fp:0")).toBeUndefined();
  });

  it("entries contain only fingerprint, first_seen, last_seen, total_count", () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.writeFileSync.mockImplementation(() => {});

    saveFingerprints("/path/fp.json", [
      { fingerprint: "fp:1", first_seen: 1000, last_seen: 2000, total_count: 3 },
    ]);

    const written = JSON.parse(
      (mockFs.writeFileSync as any).mock.calls[0][1] as string,
    );
    const entry = written.entries[0];
    expect(Object.keys(entry).sort()).toEqual(
      ["fingerprint", "first_seen", "last_seen", "total_count"].sort(),
    );
  });

  it("save failure logs warning but does not throw", () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.writeFileSync.mockImplementation(() => {
      throw new Error("disk full");
    });

    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    expect(() => saveFingerprints("/path/fp.json", [])).not.toThrow();
    expect(stderrSpy).toHaveBeenCalled();
    stderrSpy.mockRestore();
  });
});
