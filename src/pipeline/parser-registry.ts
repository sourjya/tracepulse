/**
 * Parser registry for the error parsing pipeline.
 *
 * Maintains an ordered list of ErrorParser implementations and tries each
 * in sequence. The first parser whose canParse returns true AND whose parse
 * returns a non-null result wins. Parser exceptions are caught and logged
 * to stderr so a single broken parser never takes down the pipeline.
 *
 * @see src/types/parsers.ts for the ErrorParser interface
 * @see src/parsers/ for individual parser implementations
 */

import type { ErrorParser, ParsedError } from '@/types/parsers.js';
import { jsonLogParser } from '@/parsers/json-log-parser.js';
import { structlogParser } from '@/parsers/structlog-parser.js';
import { nodeParser } from '@/parsers/node-parser.js';
import { pythonParser } from '@/parsers/python-parser.js';
import { goParser } from '@/parsers/go-parser.js';
import { javaParser } from '@/parsers/java-parser.js';
import { rustParser } from '@/parsers/rust-parser.js';
import { typescriptParser } from '@/parsers/build/typescript-parser.js';
import { eslintParser } from '@/parsers/build/eslint-parser.js';
import { viteWebpackParser } from '@/parsers/build/vite-webpack-parser.js';

// ──────────────────────────────────────────────
// Parser Registry Interface
// ──────────────────────────────────────────────

/** Public API returned by createParserRegistry. */
export interface ParserRegistry {
  /**
   * Try each registered parser in order against the given line.
   * Returns the first successful ParsedError, or null if none match.
   */
  parse(line: string): ParsedError | null;
}

// ──────────────────────────────────────────────
// Factory — Custom Registry
// ──────────────────────────────────────────────

/**
 * Create a parser registry from an explicit list of parsers.
 * Parsers are tried in array order; first successful match wins.
 *
 * @param parsers - Ordered array of ErrorParser implementations
 * @returns A ParserRegistry whose parse method iterates the list
 */
export function createParserRegistry(parsers: readonly ErrorParser[]): ParserRegistry {
  return {
    parse(line: string): ParsedError | null {
      for (const parser of parsers) {
        try {
          if (!parser.canParse(line)) continue;
          const result = parser.parse(line);
          if (result !== null) return result;
        } catch (err) {
          // Log to stderr — stdout is reserved for MCP JSON-RPC protocol messages
          const msg = err instanceof Error ? err.message : String(err);
          process.stderr.write(`[tracepulse] parser "${parser.name}" threw: ${msg}\n`);
        }
      }
      return null;
    },
  };
}

// ──────────────────────────────────────────────
// Factory — Default Registry (all 6 parsers)
// ──────────────────────────────────────────────

/**
 * Create a registry pre-loaded with all built-in parsers in priority order:
 * JSON (most specific structured format) → Node → Python → Go → Java → Rust →
 * TypeScript compiler → ESLint → Vite/webpack (build parsers last since they
 * match specific build tool output that runtime parsers won't match).
 *
 * JSON is first because structured JSON logs are unambiguous and should be
 * captured before any regex-based parser can partially match them.
 */
export function createDefaultRegistry(): ParserRegistry {
  return createParserRegistry([
    jsonLogParser,
    structlogParser,
    nodeParser,
    pythonParser,
    goParser,
    javaParser,
    rustParser,
    typescriptParser,
    eslintParser,
    viteWebpackParser,
  ]);
}
