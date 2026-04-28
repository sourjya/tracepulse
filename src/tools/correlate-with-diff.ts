/**
 * MCP tool handler for correlate_with_diff.
 *
 * Links recent errors to git changes by matching error file locations
 * with changed files in the working tree.
 *
 * @see src/correlation/git-diff-correlator.ts for git operations
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { EventBuffer } from "@/types/collectors.js";
import {
  detectGitRoot,
  execGit,
  parseChangedFiles,
  parseDiffHunks,
  matchErrorToFile,
} from "@/correlation/git-diff-correlator.js";

/**
 * Handle correlate_with_diff MCP tool call.
 *
 * @param buffer - Backend event buffer.
 * @param cwd - Current working directory for git operations.
 * @returns MCP CallToolResult with diff correlations.
 */
export async function handleCorrelateWithDiff(
  buffer: EventBuffer,
  cwd: string,
): Promise<CallToolResult> {
  // Detect git repo
  const gitRoot = await detectGitRoot(cwd);
  if (!gitRoot) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            correlations: [],
            message: "No git repository detected",
          }),
        },
      ],
    };
  }

  // Get changed files
  const nameOnly = await execGit(["diff", "--name-only", "HEAD"], gitRoot);
  if (!nameOnly) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            correlations: [],
            message: "Could not get git diff",
          }),
        },
      ],
    };
  }

  const changedFiles = parseChangedFiles(nameOnly);
  if (changedFiles.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            correlations: [],
            message: "No uncommitted changes",
          }),
        },
      ],
    };
  }

  // Get errors with file context
  const errors = buffer.query({ level: "warn" });
  const correlations: Array<{
    error_fingerprint: string;
    error_message: string;
    error_file: string;
    changed_file: string;
    signal_score: number;
  }> = [];

  for (const error of errors) {
    const match = matchErrorToFile(error.context.file, changedFiles);
    if (match) {
      correlations.push({
        error_fingerprint: error.fingerprint,
        error_message: error.message,
        error_file: error.context.file!,
        changed_file: match,
        signal_score: error.signal_score,
      });
    }
  }

  // Sort by signal_score descending
  correlations.sort((a, b) => b.signal_score - a.signal_score);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          correlations,
          changed_files: changedFiles.length,
        }),
      },
    ],
  };
}
