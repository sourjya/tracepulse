/**
 * Infrastructure error pattern scoring rules.
 *
 * Detects infrastructure issues (DB connection failures, OOM, pool exhaustion)
 * from error messages and boosts their signal score.
 *
 * @see src/pipeline/signal-scorer.ts for the scoring pipeline
 */

/** An infrastructure pattern with category and score boost. */
export interface InfraPattern {
  readonly pattern: RegExp;
  readonly category: string;
  readonly score_boost: number;
}

/** Infrastructure patterns detected from log messages. */
export const INFRA_PATTERNS: readonly InfraPattern[] = [
  // Database connectivity
  { pattern: /connection refused/i, category: "db/connectivity", score_boost: 20 },
  { pattern: /too many connections/i, category: "db/pool", score_boost: 25 },
  { pattern: /connection pool exhausted/i, category: "db/pool", score_boost: 25 },
  { pattern: /database.*unavailable/i, category: "db/connectivity", score_boost: 20 },
  { pattern: /could not connect to server/i, category: "db/connectivity", score_boost: 20 },

  // Network
  { pattern: /ECONNREFUSED/i, category: "connectivity", score_boost: 20 },
  { pattern: /ETIMEDOUT/i, category: "connectivity", score_boost: 15 },
  { pattern: /ECONNRESET/i, category: "connectivity", score_boost: 15 },
  { pattern: /EHOSTUNREACH/i, category: "connectivity", score_boost: 15 },

  // Memory
  { pattern: /MemoryError/i, category: "memory", score_boost: 30 },
  { pattern: /Cannot allocate memory/i, category: "memory", score_boost: 30 },
  { pattern: /out of memory/i, category: "memory", score_boost: 30 },
  { pattern: /heap out of memory/i, category: "memory", score_boost: 30 },

  // Disk
  { pattern: /No space left on device/i, category: "disk", score_boost: 30 },
  { pattern: /disk full/i, category: "disk", score_boost: 30 },
  { pattern: /ENOSPC/i, category: "disk", score_boost: 30 },

  // Redis
  { pattern: /Redis connection/i, category: "redis", score_boost: 20 },
  { pattern: /WRONGPASS/i, category: "redis", score_boost: 20 },

  // TLS/SSL
  { pattern: /SSL.*error|certificate.*expired|self.signed/i, category: "tls", score_boost: 15 },

  // DNS
  { pattern: /NXDOMAIN|getaddrinfo.*ENOTFOUND/i, category: "dns", score_boost: 15 },
];

/**
 * Check a message against infrastructure patterns.
 *
 * @param message - Error message to check.
 * @returns Matching pattern or undefined.
 */
export function matchInfraPattern(message: string): InfraPattern | undefined {
  return INFRA_PATTERNS.find((p) => p.pattern.test(message));
}
