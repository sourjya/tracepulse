/**
 * Auto-correlator for linking errors to recent file edits.
 *
 * When an error has file context, checks if that file was recently modified
 * (appears in git diff). Returns a LikelyCause object that can be attached
 * to get_errors responses without the agent needing to call correlate_with_diff.
 *
 * @see src/correlation/git-diff-correlator.ts for the underlying match logic
 * @see .kiro/specs/m26-intelligent-feedback/requirements.md Feature 5
 */

import { matchErrorToFile } from "@/correlation/git-diff-correlator.js";

/** Correlation result attached to errors in get_errors response. */
export interface LikelyCause {
  /** The changed file that matches the error's file context. */
  readonly file: string;
  /** Human-readable summary of why this file is the likely cause. */
  readonly change_summary: string;
}

/**
 * Check if an error's file context matches a recently changed file.
 *
 * Pure function — no I/O. The caller provides the changed files list
 * (from git diff or file-change tracker).
 *
 * @param errorContext - The error's context (needs at least `file`).
 * @param changedFiles - List of recently changed file paths.
 * @returns LikelyCause if a match is found, null otherwise.
 */
export function autoCorrelate(
  errorContext: { file?: string; line?: number },
  changedFiles: string[],
): LikelyCause | null {
  if (!errorContext.file || changedFiles.length === 0) return null;

  const match = matchErrorToFile(errorContext.file, changedFiles);
  if (!match) return null;

  const lineInfo = errorContext.line ? ` (line ${errorContext.line})` : "";
  return {
    file: match,
    change_summary: `Error in ${errorContext.file}${lineInfo} — file was recently modified`,
  };
}
