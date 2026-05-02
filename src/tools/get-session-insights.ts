/**
 * Session insights - detects missed investigations, verification gaps,
 * and tool usage patterns by cross-referencing the audit trail with
 * the event buffer and hot-reload events.
 *
 * Answers: "Is the agent using TracePulse effectively?"
 *
 * @see docs/research/experiments-index.md for the full spec
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { EventBuffer } from "@/types/collectors.js";
import type { AuditBuffer } from "@/store/audit-buffer.js";

/** Threshold: errors above this score should be investigated. */
const INVESTIGATE_THRESHOLD = 50;
/** Threshold: errors older than this (ms) without investigation are flagged. */
const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
/** Threshold: HMR events without verify within this window (ms) are flagged. */
const VERIFY_GAP_THRESHOLD_MS = 60 * 1000; // 60 seconds

/**
 * Handle get_session_insights MCP tool call.
 *
 * Cross-references the event buffer (what happened) with the audit trail
 * (what the agent did) to identify gaps in the agent's workflow.
 *
 * @param buffer - Event buffer with runtime errors.
 * @param auditBuffer - Audit trail of tool calls.
 * @returns Session insights with uninvestigated errors, verification gaps, and recommendations.
 */
export function handleGetSessionInsights(
  buffer: EventBuffer,
  auditBuffer: AuditBuffer,
): CallToolResult {
  const now = Date.now();
  const auditRecords = auditBuffer.query(500);

  // ── Uninvestigated errors ──
  // Find high-signal errors that the agent never called get_error_context on
  const highSignalErrors = buffer.query({ level: "error" })
    .filter((e) => e.signal_score >= INVESTIGATE_THRESHOLD);

  const investigatedFingerprints = new Set(
    auditRecords
      .filter((r) => r.tool === "get_error_context")
      .map((r) => (r.params as Record<string, unknown>).fingerprint as string)
      .filter(Boolean),
  );

  const uninvestigated = highSignalErrors
    .filter((e) => !investigatedFingerprints.has(e.fingerprint))
    .filter((e) => (now - e.timestamp) > STALE_THRESHOLD_MS)
    .slice(0, 5)
    .map((e) => ({
      fingerprint: e.fingerprint,
      signal_score: e.signal_score,
      message: e.message.slice(0, 100),
      age_minutes: Math.round((now - e.timestamp) / 60000),
      occurrence_count: e.occurrence_count,
    }));

  // ── Verification gaps ──
  // Find HMR/build events without a subsequent verify_fix or get_build_errors call
  const hmrEvents = buffer.query({})
    .filter((e) => e.fingerprint.startsWith("hotreload:"));

  const verifyTimestamps = auditRecords
    .filter((r) => r.tool === "verify_fix" || r.tool === "verify_build" || r.tool === "get_build_errors")
    .map((r) => r.timestamp);

  const verificationGaps = hmrEvents
    .filter((hmr) => {
      // Was there a verify call within VERIFY_GAP_THRESHOLD_MS after this HMR?
      return !verifyTimestamps.some((vt) => vt > hmr.timestamp && vt < hmr.timestamp + VERIFY_GAP_THRESHOLD_MS);
    })
    .slice(0, 5)
    .map((hmr) => ({
      hmr_event_at: hmr.timestamp,
      age_minutes: Math.round((now - hmr.timestamp) / 60000),
    }));

  // ── Tool usage ──
  const toolCounts = new Map<string, number>();
  for (const r of auditRecords) {
    toolCounts.set(r.tool, (toolCounts.get(r.tool) ?? 0) + 1);
  }
  const sorted = [...toolCounts.entries()].sort((a, b) => b[1] - a[1]);
  const mostCalled = sorted[0] ? `${sorted[0][0]} (${sorted[0][1]}x)` : "none";
  const leastCalled = sorted.length > 1 ? `${sorted[sorted.length - 1][0]} (${sorted[sorted.length - 1][1]}x)` : "none";

  // ── Parser stats ──
  // Count errors by parser/framework
  const parserCounts = new Map<string, number>();
  const allErrors = buffer.query({ level: "warn" });
  for (const e of allErrors) {
    const parser = e.context.framework ?? "unmatched";
    parserCounts.set(parser, (parserCounts.get(parser) ?? 0) + 1);
  }
  const parserStats = [...parserCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ parser: name, hits: count }));

  // ── Recommendations ──
  const recommendations: string[] = [];
  if (uninvestigated.length > 0) {
    const top = uninvestigated[0];
    recommendations.push(
      `Error '${top.message.slice(0, 50)}' (score ${top.signal_score}) uninvestigated for ${top.age_minutes} min. Call get_error_context('${top.fingerprint.slice(0, 12)}...').`,
    );
  }
  if (verificationGaps.length > 0) {
    recommendations.push(
      `${verificationGaps.length} HMR event(s) without subsequent verify_fix. Use verify_fix(3) after code changes.`,
    );
  }
  if (auditBuffer.totalInvocations === 0) {
    recommendations.push(
      "No TracePulse tools called this session. Start with get_project_health() for a full status check.",
    );
  }
  const sessionMinutes = Math.round((now - buffer.sessionStartedAt) / 60000);
  if (sessionMinutes > 30 && !auditRecords.some((r) => r.tool === "get_project_health")) {
    recommendations.push(
      "No get_project_health() call in this session. Use it as a health gate before major work.",
    );
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        uninvestigated_errors: uninvestigated,
        verification_gaps: verificationGaps,
        tool_usage: {
          most_called: mostCalled,
          least_called: leastCalled,
          total_calls: auditBuffer.totalInvocations,
          session_duration_minutes: sessionMinutes,
        },
        parser_stats: parserStats,
        recommendations,
      }),
    }],
  };
}
