/**
 * Git diff correlator for linking errors to recent code changes.
 *
 * Parses git diff output, matches changed files to error locations,
 * and generates human-readable summaries. Best-effort — never fails
 * if git is unavailable.
 *
 * @see .kiro/specs/phase5-proactive/design.md for git correlation design
 */

import { execFile } from "node:child_process";

/** A parsed diff hunk with file and line range. */
export interface DiffHunk {
  readonly file: string;
  readonly startLine: number;
  readonly lineCount: number;
  readonly header: string;
}

/**
 * Execute a git command safely. Returns null if git is unavailable or fails.
 *
 * Uses execFile (not exec) to prevent shell injection.
 *
 * @param args - Git command arguments.
 * @param cwd - Working directory.
 * @returns stdout string, or null on failure.
 */
export function execGit(args: string[], cwd: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = execFile("git", args, { cwd, timeout: 5000 }, (err, stdout) => {
      if (err) {
        resolve(null);
        return;
      }
      resolve(stdout);
    });
  });
}

/**
 * Detect the git repository root for a directory.
 *
 * @param cwd - Directory to check.
 * @returns Repo root path, or null if not a git repo.
 */
export async function detectGitRoot(cwd: string): Promise<string | null> {
  const result = await execGit(["rev-parse", "--show-toplevel"], cwd);
  return result?.trim() ?? null;
}

/**
 * Parse changed file list from `git diff --name-only` output.
 *
 * @param output - Raw git diff --name-only output.
 * @returns Array of changed file paths.
 */
export function parseChangedFiles(output: string): string[] {
  return output
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/**
 * Parse diff hunks from unified diff output.
 *
 * @param diffOutput - Raw git diff output.
 * @returns Array of DiffHunk objects.
 */
export function parseDiffHunks(diffOutput: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let currentFile = "";

  for (const line of diffOutput.split("\n")) {
    if (line.startsWith("+++ b/")) {
      currentFile = line.slice(6);
    } else if (line.startsWith("@@ ")) {
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@(.*)/);
      if (match && currentFile) {
        hunks.push({
          file: currentFile,
          startLine: parseInt(match[1], 10),
          lineCount: match[2] ? parseInt(match[2], 10) : 1,
          header: match[3]?.trim() ?? "",
        });
      }
    }
  }

  return hunks;
}

/**
 * Match an error's file location to a changed file.
 *
 * @param errorFile - File path from error context.
 * @param changedFiles - List of changed files from git diff.
 * @returns Matching changed file path, or null.
 */
export function matchErrorToFile(
  errorFile: string | undefined,
  changedFiles: string[],
): string | null {
  if (!errorFile) return null;
  // Normalize: strip leading ./ or /
  const normalized = errorFile.replace(/^\.?\//, "");
  return changedFiles.find((f) => f === normalized || f.endsWith(normalized) || normalized.endsWith(f)) ?? null;
}
