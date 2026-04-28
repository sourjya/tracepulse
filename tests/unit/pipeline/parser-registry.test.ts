/**
 * Unit tests for the parser registry.
 *
 * Uses mock ErrorParser objects to test registry behavior in isolation.
 * Real parsers are tested in their own test files under tests/unit/parsers/.
 */

import { describe, it, expect, vi } from 'vitest';
import type { ErrorParser, ParsedError } from '@/types/parsers';
import { createParserRegistry } from '@/pipeline/parser-registry';

// ──────────────────────────────────────────────
// Test Helpers
// ──────────────────────────────────────────────

/**
 * Create a mock ErrorParser with configurable canParse/parse behavior.
 * Defaults to a parser that never matches.
 */
function mockParser(
  name: string,
  overrides: {
    canParse?: (line: string) => boolean;
    parse?: (line: string) => ParsedError | null;
  } = {},
): ErrorParser {
  return {
    name,
    canParse: overrides.canParse ?? (() => false),
    parse: overrides.parse ?? (() => null),
  };
}

/** Minimal ParsedError for test assertions. */
function fakeParsedError(message: string): ParsedError {
  return {
    message,
    level: 'error',
    context: {},
    scoring_hints: {},
  };
}

// ──────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────

describe('ParserRegistry', () => {
  describe('parser ordering', () => {
    it('first matching parser wins', () => {
      const first = mockParser('first', {
        canParse: () => true,
        parse: () => fakeParsedError('from-first'),
      });
      const second = mockParser('second', {
        canParse: () => true,
        parse: () => fakeParsedError('from-second'),
      });

      const registry = createParserRegistry([first, second]);
      const result = registry.parse('some error');

      expect(result).not.toBeNull();
      expect(result!.message).toBe('from-first');
    });

    it('skips parsers that do not match and uses the first that does', () => {
      const noMatch = mockParser('no-match', { canParse: () => false });
      const match = mockParser('match', {
        canParse: () => true,
        parse: () => fakeParsedError('matched'),
      });

      const registry = createParserRegistry([noMatch, match]);
      const result = registry.parse('line');

      expect(result).not.toBeNull();
      expect(result!.message).toBe('matched');
    });
  });

  describe('no parser matches', () => {
    it('returns null when no parser matches', () => {
      const a = mockParser('a', { canParse: () => false });
      const b = mockParser('b', { canParse: () => false });

      const registry = createParserRegistry([a, b]);
      expect(registry.parse('unknown line')).toBeNull();
    });
  });

  describe('canParse true but parse returns null', () => {
    it('tries next parser when parse returns null', () => {
      const flaky = mockParser('flaky', {
        canParse: () => true,
        parse: () => null,
      });
      const fallback = mockParser('fallback', {
        canParse: () => true,
        parse: () => fakeParsedError('fallback-result'),
      });

      const registry = createParserRegistry([flaky, fallback]);
      const result = registry.parse('error line');

      expect(result).not.toBeNull();
      expect(result!.message).toBe('fallback-result');
    });
  });

  describe('parser throws exception', () => {
    it('catches canParse exception and tries next parser', () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

      const throwing = mockParser('throwing', {
        canParse: () => { throw new Error('canParse boom'); },
      });
      const safe = mockParser('safe', {
        canParse: () => true,
        parse: () => fakeParsedError('safe-result'),
      });

      const registry = createParserRegistry([throwing, safe]);
      const result = registry.parse('line');

      expect(result).not.toBeNull();
      expect(result!.message).toBe('safe-result');
      expect(stderrSpy).toHaveBeenCalled();

      stderrSpy.mockRestore();
    });

    it('catches parse exception and tries next parser', () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

      const throwing = mockParser('throwing', {
        canParse: () => true,
        parse: () => { throw new Error('parse boom'); },
      });
      const safe = mockParser('safe', {
        canParse: () => true,
        parse: () => fakeParsedError('safe-result'),
      });

      const registry = createParserRegistry([throwing, safe]);
      const result = registry.parse('line');

      expect(result).not.toBeNull();
      expect(result!.message).toBe('safe-result');
      expect(stderrSpy).toHaveBeenCalled();

      stderrSpy.mockRestore();
    });
  });

  describe('empty parser list', () => {
    it('returns null with no parsers registered', () => {
      const registry = createParserRegistry([]);
      expect(registry.parse('anything')).toBeNull();
    });
  });

  describe('createParserRegistry', () => {
    it('accepts a custom parser array', () => {
      const custom = mockParser('custom', {
        canParse: (line) => line.includes('CUSTOM'),
        parse: () => fakeParsedError('custom-parsed'),
      });

      const registry = createParserRegistry([custom]);

      expect(registry.parse('CUSTOM error')).not.toBeNull();
      expect(registry.parse('other error')).toBeNull();
    });
  });
});
