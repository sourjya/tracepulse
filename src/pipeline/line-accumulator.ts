/**
 * Multi-line accumulator for the event pipeline.
 *
 * Buffers consecutive lines that form a multi-line error block (e.g., Python
 * tracebacks) and emits them as a single joined string when the block ends.
 * Single lines that don't start a block are emitted immediately.
 *
 * This solves the problem where readline splits a Python traceback into
 * individual lines, preventing the Python parser from extracting file:line
 * from the stack frames.
 *
 * @see src/parsers/python-parser.ts for the parser that needs multi-line input
 */

/** Patterns that start a multi-line block. */
const BLOCK_STARTERS = [
  "Traceback (most recent call last):",  // Python
  "panic:",                               // Go
  "Exception in thread",                  // Java
];

/** Patterns that indicate a line is a continuation of a block (indented or frame). */
const CONTINUATION_PATTERNS = [
  /^\s+File "/,       // Python frame
  /^\s+at /,          // Node.js/Java frame
  /^\s+\.\.\./,       // Java "... N more"
  /^\s+goroutine/,    // Go goroutine
  /^\s/,              // Any indented line (continuation)
];

/** Max lines to buffer before force-flushing (prevents unbounded memory). */
const MAX_BUFFER_LINES = 50;

/**
 * Create a line accumulator that joins multi-line error blocks.
 *
 * @param emit - Callback invoked with each complete line or joined block.
 * @returns A function to feed individual lines into.
 */
export function createLineAccumulator(
  emit: (joined: string) => void,
): (line: string) => void {
  let buffer: string[] = [];
  let inBlock = false;

  function flush(): void {
    if (buffer.length > 0) {
      emit(buffer.join("\n"));
      buffer = [];
    }
    inBlock = false;
  }

  return (line: string): void => {
    // If the line already contains newlines and a block starter,
    // it's a pre-joined multi-line block - emit immediately.
    if (line.includes("\n") && BLOCK_STARTERS.some((s) => line.includes(s))) {
      flush();
      emit(line);
      return;
    }

    const isStarter = BLOCK_STARTERS.some((s) => line.includes(s));
    const isContinuation = CONTINUATION_PATTERNS.some((p) => p.test(line));

    if (isStarter) {
      // Flush any previous block, start new one
      flush();
      buffer.push(line);
      inBlock = true;
      return;
    }

    if (inBlock) {
      if (isContinuation || line.trim().length === 0) {
        // Still in the block
        buffer.push(line);
        if (buffer.length >= MAX_BUFFER_LINES) flush();
        return;
      }
      // Non-continuation line - this is likely the exception message at the end
      // or the first line after the block
      buffer.push(line);
      flush();
      return;
    }

    // Not in a block - emit immediately
    emit(line);
  };
}
