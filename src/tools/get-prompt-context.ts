/**
 * Pre-assembled reasoning packet for error investigation.
 *
 * Assembles error + stack trace + surrounding logs + file snippet + git diff
 * into a single token-budgeted context block. The agent gets everything it needs
 * to reason about an error in one call instead of 4-5.
 *
 * Priority order for token budget: error > stack > file snippet > diff > logs.
 *
 * @see .kiro/specs/m26-intelligent-feedback/requirements.md Feature 2
 * @see Deep Research §6.8 — "pre-assembled reasoning packet"
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { EventBuffer } from "@/types/collectors.js";
import { jsonResult, errorResult } from "@/mcp/response-helpers.js";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

/** Input for context assembly (gathered by the handler). */
export interface PromptContextInput {
  /** The error to investigate. */
  readonly error: { message: string; stack_trace?: string };
  /** Log lines surrounding the error (±5s window). */
  readonly surroundingLogs: readonly string[];
  /** Source file snippet around the error line. */
  readonly fileSnippet: { file: string; startLine: number; content: string } | null;
  /** Git diff match if the error file was recently modified. */
  readonly diffMatch: { file: string; summary: string } | null;
  /** Maximum token budget for the assembled context. */
  readonly maxTokens: number;
}

/** Result of context assembly. */
export interface PromptContextResult {
  /** The assembled context string, ready for agent reasoning. */
  readonly context: string;
  /** Estimated token count (~4 chars per token). */
  readonly token_estimate: number;
  /** Which data sources were included. */
  readonly sources: string[];
}

// ──────────────────────────────────────────────
// Pure context assembly (testable without I/O)
// ──────────────────────────────────────────────

/** Rough token estimate: ~4 characters per token. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Assemble a token-budgeted context block from error investigation data.
 *
 * Sections are added in priority order. If budget is exceeded, lower-priority
 * sections are truncated or omitted.
 *
 * @param input - Error data, logs, file snippet, diff match.
 * @returns Assembled context with token estimate and source list.
 */
export function assembleContext(input: PromptContextInput): PromptContextResult {
  const { error, surroundingLogs, fileSnippet, diffMatch, maxTokens } = input;
  const sections: string[] = [];
  const sources: string[] = [];
  let budget = maxTokens;

  // Priority 1: Error message + stack trace (always included)
  const errorSection = error.stack_trace
    ? `## Error\n${error.message}\n\n## Stack Trace\n${error.stack_trace}`
    : `## Error\n${error.message}`;
  sections.push(errorSection);
  sources.push("error");
  if (error.stack_trace) sources.push("stack_trace");
  budget -= estimateTokens(errorSection);

  // Priority 2: File snippet (if available and budget allows)
  if (fileSnippet && budget > 50) {
    const snippetSection = `## Source (${fileSnippet.file}:${fileSnippet.startLine})\n${fileSnippet.content}`;
    const cost = estimateTokens(snippetSection);
    if (cost <= budget) {
      sections.push(snippetSection);
      sources.push("file_snippet");
      budget -= cost;
    }
  }

  // Priority 3: Git diff match (if available and budget allows)
  if (diffMatch && budget > 30) {
    const diffSection = `## Recent Change\n${diffMatch.file}: ${diffMatch.summary}\n\n## Investigate\nCheck ${diffMatch.file} — recently modified and matches error location.`;
    const cost = estimateTokens(diffSection);
    if (cost <= budget) {
      sections.push(diffSection);
      sources.push("git_diff");
      budget -= cost;
    }
  }

  // Priority 4: Surrounding logs (if available and budget allows)
  if (surroundingLogs.length > 0 && budget > 30) {
    const logLines = surroundingLogs.slice(0, 10).join("\n");
    const logSection = `## Surrounding Logs\n${logLines}`;
    const cost = estimateTokens(logSection);
    if (cost <= budget) {
      sections.push(logSection);
      sources.push("logs");
      budget -= cost;
    }
  }

  const context = sections.join("\n\n");
  return {
    context,
    token_estimate: estimateTokens(context),
    sources,
  };
}

// ──────────────────────────────────────────────
// MCP Tool Handler
// ──────────────────────────────────────────────

/**
 * Handle get_prompt_context MCP tool call.
 *
 * Gathers error data, surrounding logs, file snippet, and git diff,
 * then assembles into a token-budgeted context block.
 *
 * @param buffer - Event buffer to find the error and surrounding logs.
 * @param args - { fingerprint, max_tokens? }
 * @returns Assembled context or error if fingerprint not found.
 */
export async function handleGetPromptContext(
  buffer: EventBuffer,
  args: Record<string, unknown>,
  cwd?: string,
): Promise<CallToolResult> {
  const fingerprint = args.fingerprint as string | undefined;
  const maxTokens = (args.max_tokens as number | undefined) ?? 3000;

  if (!fingerprint) {
    return errorResult("fingerprint parameter is required. Get it from get_errors.");
  }

  // Find the error in the buffer
  const allEvents = buffer.query({ level: "warn" });
  const target = allEvents.find((e) => e.fingerprint === fingerprint);
  if (!target) {
    return errorResult(`Error with fingerprint "${fingerprint}" not found in buffer. It may have been evicted.`);
  }

  // Get surrounding logs (±5s window)
  const windowMs = 5000;
  const surroundingLogs = buffer.query({ since: target.timestamp - windowMs })
    .filter((e) => e.timestamp <= target.timestamp + windowMs && e.id !== target.id)
    .map((e) => `[${e.level.toUpperCase()}] ${e.message}`)
    .slice(0, 10);

  // Assemble context (file snippet and diff require filesystem access — skip in pure handler)
  const input: PromptContextInput = {
    error: { message: target.message, stack_trace: target.stack_trace },
    surroundingLogs,
    fileSnippet: null, // Would require fs.readFile — deferred to CLI layer
    diffMatch: null, // Would require git operations — deferred to CLI layer
    maxTokens,
  };

  const result = assembleContext(input);
  return jsonResult(result);
}
