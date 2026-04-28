/**
 * File change tracker for correlating errors with recent saves.
 *
 * Tracks which files triggered hot-reload events. When a build error
 * appears, the agent can see which file was most recently saved.
 */

/** Tracked file change. */
export interface FileChange {
  readonly file: string;
  readonly timestamp: number;
}

/**
 * Create a file change tracker.
 *
 * Extracts file paths from hot-reload event messages and stores them.
 */
export function createFileChangeTracker(): {
  track(message: string, timestamp: number): void;
  getRecent(limit?: number): FileChange[];
} {
  const changes: FileChange[] = [];

  /** Patterns that extract file paths from hot-reload messages. */
  const FILE_PATTERNS = [
    /hmr update\s+(\S+)/i,                    // Vite HMR: [vite] hmr update /src/App.tsx
    /detected changes in\s+"?([^"]+)"?/i,     // uvicorn: WatchFiles detected changes in "auth.py"
    /restarting due to changes.*?(\S+\.\w+)/i, // nodemon: restarting due to changes... app.js
    /compiling\s+(\/\S+)/i,                    // Next.js: Compiling /api/users
  ];

  return {
    track(message: string, timestamp: number): void {
      for (const p of FILE_PATTERNS) {
        const match = message.match(p);
        if (match) {
          changes.push({ file: match[1], timestamp });
          if (changes.length > 50) changes.shift();
          return;
        }
      }
    },

    getRecent(limit: number = 5): FileChange[] {
      return changes.slice(-limit).reverse();
    },
  };
}
