# ADR-002: Golden File Testing for Error Parsers

**Status:** Accepted
**Date:** 2026-05-01
**Context:** TracePulse has 25 error parsers. Testing them against real-world output is humanly impossible to maintain manually. We need an automated, traceable system.

## Decision

Adopt golden file (snapshot-based) testing for all error parsers. Each test case is a fixture file containing real error output sourced from forums, blogs, and official docs, with metadata linking to the original source.

## Rationale

1. **Traceability:** Every test fixture links to its source (Stack Overflow, GitHub issue, official docs). When a parser fails, we know exactly which real-world pattern broke.
2. **Scalability:** Adding a new test case = dropping a `.txt` file + a `.expected.json` file. No code changes needed.
3. **Regression detection:** Expected output is snapshotted. Any parser change that alters output requires explicit approval.
4. **Community contribution:** Anyone can submit a fixture from their real project without writing test code.

## Structure

```
tests/fixtures/parsers/
  node/
    type-error-v8.input.txt           # Real captured output
    type-error-v8.expected.json       # Expected parse result
    type-error-v8.meta.json           # Source URL, date, notes
  python/
    traceback-chained.input.txt
    traceback-chained.expected.json
    traceback-chained.meta.json
  ...
```

### meta.json format
```json
{
  "source_url": "https://stackoverflow.com/questions/12345",
  "source_date": "2026-03-15",
  "framework": "node",
  "framework_version": "22.x",
  "description": "TypeError from V8 with new error message format",
  "contributed_by": "sourjya"
}
```

### expected.json format
```json
{
  "parser_name": "node",
  "should_match": true,
  "level": "error",
  "error_type": "TypeError",
  "file": "src/auth.ts",
  "line": 42,
  "message_contains": "Cannot read properties of null"
}
```

## Test Runner

A single test file (`tests/fixtures/run-parser-fixtures.test.ts`) discovers all fixture directories, loads each `.input.txt`, runs it through the parser registry, and asserts against `.expected.json`. No per-parser test code needed.

## Alternatives Considered

1. **Inline test strings** (current approach) - works but doesn't scale, no traceability to real sources
2. **Snapshot testing only** (vitest snapshots) - no traceability, snapshots are opaque
3. **Property-based testing** (fast-check) - good for edge cases but can't test real-world format variations

## Consequences

- Every parser change must pass all golden files
- New parsers require at least 3 golden files before merge
- Source URLs must be verified annually (links rot)
- The 4 untested parsers (coverage, migration, npm-audit, build-stats) get immediate coverage
