/**
 * Docker log collector for tailing container logs via Docker Engine API.
 *
 * Connects to the Docker Engine API via Unix socket to tail container logs.
 * Parses the Docker multiplexed stream format (8-byte header + payload)
 * and tags each line with the compose service name.
 *
 * Exported utilities (parseDockerLogFrame, extractServiceFromLabels) are
 * unit-testable without a Docker socket.
 *
 * @see .kiro/specs/phase3-multi-process/design.md for Docker integration design
 */

import type { EventSource } from "@/constants/events.js";

/** Parsed result from a Docker log frame. */
export interface DockerLogLine {
  /** Event source derived from stream type. */
  readonly source: EventSource;
  /** Log line text (newline stripped). */
  readonly line: string;
}

/**
 * Parse a Docker multiplexed log frame.
 *
 * Docker log streams use an 8-byte header:
 *   [stream_type(1), 0, 0, 0, size(4 big-endian)]
 * Stream types: 0=stdin, 1=stdout, 2=stderr.
 *
 * @param frame - Raw buffer containing header + payload.
 * @returns Parsed line with source, or null if frame is invalid.
 */
export function parseDockerLogFrame(frame: Buffer): DockerLogLine | null {
  if (frame.length < 8) return null;

  const streamType = frame[0];
  const payloadSize = frame.readUInt32BE(4);
  const payload = frame.subarray(8, 8 + payloadSize).toString("utf-8").replace(/\n$/, "");

  const source: EventSource =
    streamType === 2 ? "server-stderr" : "server-stdout";

  return { source, line: payload };
}

/**
 * Extract the Docker Compose service name from container labels.
 *
 * @param labels - Container labels object from Docker API.
 * @returns Service name, or undefined if not a compose container.
 */
export function extractServiceFromLabels(
  labels: Record<string, string>,
): string | undefined {
  return labels["com.docker.compose.service"];
}
