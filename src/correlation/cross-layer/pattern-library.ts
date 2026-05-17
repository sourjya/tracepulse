/**
 * Cross-layer pattern library — known failure signatures.
 *
 * Each pattern defines a combination of signals from different layers
 * that, when observed together within a time window, indicate a specific
 * root cause. Patterns are ordered by specificity (most specific first)
 * so the matcher can short-circuit on the best match.
 *
 * @see .kiro/specs/devloop-agent/design.md for pattern design
 * @see .kiro/specs/devloop-agent/requirements.md for user stories driving each pattern
 */

import type { CrossLayerPattern } from "@/correlation/cross-layer/types.js";

/**
 * Static pattern library. New patterns are added here.
 * Order matters: more specific patterns should come first.
 */
export const PATTERNS: readonly CrossLayerPattern[] = [
  // ──────────────────────────────────────────────
  // Pattern 1: Backend OK but frontend error (US-2)
  // ──────────────────────────────────────────────
  {
    id: "backend-ok-frontend-error",
    name: "Backend OK + Frontend Error",
    description: "Backend returned success but frontend threw an error — likely response format mismatch or auth token issue.",
    requiredSignals: [
      { layer: "backend", type: "http-200" },
      { layer: "frontend", type: "type-error" },
    ],
    optionalSignals: [
      { layer: "frontend", type: "http-failure" },
    ],
    baseConfidence: 75,
    diagnosisTemplate: "Backend returned 200 OK but frontend threw a TypeError. The response likely has an unexpected shape — check if the API client unwraps the response or if a field name changed.",
    suggestedFix: "Check the response structure at the frontend call site. Common causes: API client auto-unwraps (use resp.field not resp.data.field), or a field was renamed/removed in the backend response.",
    timeWindowMs: 10_000,
  },

  // ──────────────────────────────────────────────
  // Pattern 2: Stale server (US-3)
  // ──────────────────────────────────────────────
  {
    id: "stale-server",
    name: "Stale Server — Code Changed, No Restart",
    description: "Files were edited but the server hasn't restarted. The running code is stale.",
    requiredSignals: [
      { layer: "git", type: "file-changed" },
      { layer: "process", type: "no-restart-detected" },
    ],
    optionalSignals: [
      { layer: "backend", type: "exception" },
    ],
    baseConfidence: 80,
    diagnosisTemplate: "Code was changed but the server has not restarted. Your edits are not live — the server is running old code.",
    suggestedFix: "Restart the dev server to pick up the changes. If using a hot-reload tool (nodemon, uvicorn --reload), check that it's watching the correct directory.",
    timeWindowMs: 60_000,
  },

  // ──────────────────────────────────────────────
  // Pattern 3: Rate limited (US-4)
  // ──────────────────────────────────────────────
  {
    id: "rate-limited",
    name: "Rate Limited",
    description: "Receiving 429 responses — rate limiter bucket is full.",
    requiredSignals: [
      { layer: "backend", type: "http-429" },
    ],
    optionalSignals: [
      { layer: "frontend", type: "http-failure", metadataMatch: { statusCode: 429 } },
    ],
    baseConfidence: 85,
    diagnosisTemplate: "Rate limiter is rejecting requests (429 Too Many Requests). The bucket is likely full from a recent burst of requests.",
    suggestedFix: "Wait for the rate limit window to reset, or increase the rate limit threshold in your configuration. If this was caused by a test/eval run, the bucket will refill automatically.",
    timeWindowMs: 30_000,
    minSignals: 1, // 429 is unambiguous — single signal is sufficient
  },

  // ──────────────────────────────────────────────
  // Pattern 4: Repeated error (US-5)
  // ──────────────────────────────────────────────
  {
    id: "repeated-error",
    name: "Repeated Error — Not Transient",
    description: "Same error occurring repeatedly. This is not a transient failure — root cause investigation needed.",
    requiredSignals: [
      { layer: "backend", type: "repeated-error" },
    ],
    baseConfidence: 70,
    diagnosisTemplate: "The same error has occurred multiple times. This is not transient — investigate the root cause rather than retrying.",
    suggestedFix: "Look at the file:line in the error context. The issue is systematic, not a one-off. Check recent code changes that might have introduced the regression.",
    timeWindowMs: 300_000, // 5 minutes
    minSignals: 1, // Repetition itself is the corroboration
  },

  // ──────────────────────────────────────────────
  // Pattern 5: Schema validation failure (US-6)
  // ──────────────────────────────────────────────
  {
    id: "schema-validation",
    name: "Schema Validation Failure",
    description: "Request rejected with 422 — a field failed validation.",
    requiredSignals: [
      { layer: "backend", type: "http-422" },
    ],
    optionalSignals: [
      { layer: "frontend", type: "http-failure", metadataMatch: { statusCode: 422 } },
    ],
    baseConfidence: 85,
    diagnosisTemplate: "Request was rejected with 422 Unprocessable Entity. A field in the request payload failed validation.",
    suggestedFix: "Check the validation error details in the backend response body. Common causes: missing required field, value exceeds max_length, wrong type, or enum value not in allowed set.",
    timeWindowMs: 10_000,
    minSignals: 1, // 422 is unambiguous — single signal is sufficient
  },

  // ──────────────────────────────────────────────
  // Pattern 6: Build error causing runtime error
  // ──────────────────────────────────────────────
  {
    id: "build-error-runtime",
    name: "Build Error + Runtime Error",
    description: "Build failed and runtime errors are occurring — the code didn't compile correctly.",
    requiredSignals: [
      { layer: "backend", type: "exception" },
      { layer: "git", type: "file-changed" },
    ],
    optionalSignals: [
      { layer: "process", type: "hot-reload" },
    ],
    baseConfidence: 65,
    diagnosisTemplate: "Runtime exception after recent code change. The error may be in the recently modified files.",
    suggestedFix: "Check the error's file:line against your recent changes. Run the type checker (tsc --noEmit) to catch compile-time issues.",
    timeWindowMs: 30_000,
  },

  // ──────────────────────────────────────────────
  // Pattern 7: Auth expired
  // ──────────────────────────────────────────────
  {
    id: "auth-expired",
    name: "Authentication Expired",
    description: "Getting 401/403 responses — auth token likely expired.",
    requiredSignals: [
      { layer: "backend", type: "http-401" },
    ],
    optionalSignals: [
      { layer: "frontend", type: "http-failure", metadataMatch: { statusCode: 401 } },
    ],
    baseConfidence: 80,
    diagnosisTemplate: "Receiving 401 Unauthorized responses. The authentication token has likely expired or is invalid.",
    suggestedFix: "Re-authenticate to get a fresh token. If using JWT, check the token expiry. If using session cookies, the session may have been invalidated.",
    timeWindowMs: 10_000,
    minSignals: 1, // 401 is unambiguous — single signal is sufficient
  },
];
