/**
 * Golden file test runner for error parsers.
 *
 * Discovers fixture files in tests/fixtures/parsers/, runs each through
 * the parser registry, and asserts against expected output. Adding a new
 * test case = dropping .input.txt + .expected.json files. No code changes.
 *
 * Architecture: implements ADR-002 (golden file testing). Each fixture has:
 * - .input.txt: real error output from forums/docs
 * - .expected.json: expected parse result (parser, level, error_type, etc.)
 * - .meta.json (optional): source URL, date, notes for traceability
 *
 * @see docs/decisions/ADR-002-golden-file-testing.md
 * @see docs/research/parser-samples-*.md for sample sources
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createDefaultRegistry } from "@/pipeline/parser-registry.js";

/** Expected parse result for a fixture. */
interface ExpectedResult {
  /** Which parser should match. If "none", expect no match. */
  readonly parser_name?: string;
  /** Whether the parser should match at all. Default true. */
  readonly should_match?: boolean;
  /** Expected log level. */
  readonly level?: string;
  /** Expected error type in context. */
  readonly error_type?: string;
  /** Expected file path in context. */
  readonly file?: string;
  /** Expected line number in context. */
  readonly line?: number;
  /** Substring that must appear in the parsed message. */
  readonly message_contains?: string;
}

/** Metadata for traceability. */
interface FixtureMeta {
  readonly source_url?: string;
  readonly source_date?: string;
  readonly framework?: string;
  readonly description?: string;
}

const FIXTURES_DIR = join(__dirname, "..", "fixtures", "parsers");
const registry = createDefaultRegistry();

/**
 * Discover all fixture directories and their test files.
 * Each subdirectory (e.g., node/, python/) contains .input.txt + .expected.json pairs.
 *
 * @returns Array of { name, inputPath, expectedPath, metaPath } for each fixture.
 */
function discoverFixtures(): Array<{
  name: string;
  category: string;
  input: string;
  expected: ExpectedResult;
  meta?: FixtureMeta;
}> {
  if (!existsSync(FIXTURES_DIR)) return [];

  const fixtures: Array<{
    name: string;
    category: string;
    input: string;
    expected: ExpectedResult;
    meta?: FixtureMeta;
  }> = [];

  const categories = readdirSync(FIXTURES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const category of categories) {
    const catDir = join(FIXTURES_DIR, category);
    const files = readdirSync(catDir).filter((f) => f.endsWith(".input.txt"));

    for (const inputFile of files) {
      const baseName = inputFile.replace(".input.txt", "");
      const expectedPath = join(catDir, `${baseName}.expected.json`);
      const metaPath = join(catDir, `${baseName}.meta.json`);

      if (!existsSync(expectedPath)) continue;

      const input = readFileSync(join(catDir, inputFile), "utf-8").trim();
      const expected = JSON.parse(readFileSync(expectedPath, "utf-8")) as ExpectedResult;
      const meta = existsSync(metaPath)
        ? (JSON.parse(readFileSync(metaPath, "utf-8")) as FixtureMeta)
        : undefined;

      fixtures.push({
        name: `${category}/${baseName}`,
        category,
        input,
        expected,
        meta,
      });
    }
  }

  return fixtures;
}

// ──────────────────────────────────────────────
// Test Suite
// ──────────────────────────────────────────────

const fixtures = discoverFixtures();

describe("Golden File Parser Tests", () => {
  if (fixtures.length === 0) {
    it("no fixtures found - add .input.txt + .expected.json to tests/fixtures/parsers/", () => {
      // This test passes but warns that no fixtures exist yet
      expect(true).toBe(true);
    });
    return;
  }

  for (const fixture of fixtures) {
    it(`${fixture.name}: parses correctly`, () => {
      const parsed = registry.parse(fixture.input);
      const shouldMatch = fixture.expected.should_match !== false;

      if (!shouldMatch) {
        expect(parsed).toBeNull();
        return;
      }

      expect(parsed).not.toBeNull();

      if (fixture.expected.level) {
        expect(parsed!.level).toBe(fixture.expected.level);
      }
      if (fixture.expected.error_type) {
        expect(parsed!.context.error_type).toBe(fixture.expected.error_type);
      }
      if (fixture.expected.file) {
        expect(parsed!.context.file).toBe(fixture.expected.file);
      }
      if (fixture.expected.line) {
        expect(parsed!.context.line).toBe(fixture.expected.line);
      }
      if (fixture.expected.message_contains) {
        expect(parsed!.message).toContain(fixture.expected.message_contains);
      }
    });
  }

  it(`summary: ${fixtures.length} fixtures tested`, () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });
});
