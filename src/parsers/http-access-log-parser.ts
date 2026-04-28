/**
 * HTTP access log parser for TracePulse.
 *
 * Parses HTTP request log lines from uvicorn, express/morgan, and nginx
 * into structured events with method, path, status code, and duration.
 * Enables status_code_min filtering and request-level queries.
 *
 * @see src/types/parsers.ts for ErrorParser interface
 */

import type { ErrorParser, ParsedError } from "@/types/parsers.js";
import type { LogLevel } from "@/types/events.js";

/** uvicorn: INFO:     127.0.0.1:54321 - "GET /api/users HTTP/1.1" 200 */
const UVICORN_PATTERN = /"(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+(\S+)\s+HTTP\/[\d.]+"\s+(\d{3})/;

/** express/morgan: GET /api/users 200 15.234 ms */
const EXPRESS_PATTERN = /^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+(\S+)\s+(\d{3})\s+([\d.]+)\s*ms/;

/** nginx combined: ... "GET /api/users HTTP/1.1" 200 1234 */
const NGINX_PATTERN = /"\s*(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+(\S+)\s+HTTP\/[\d.]+"\s+(\d{3})\s+\d+/;

/** Duration patterns for extraction after main match. */
const DURATION_PATTERNS = [
  /(\d+\.?\d*)\s*ms/,           // express: 15.234 ms
  /(\d+\.?\d*)\s*s(?:ec)?/,     // uvicorn: 0.045s or 1.2sec
];

/** Threshold for slow request warning (ms). */
const SLOW_REQUEST_THRESHOLD_MS = 1000;

/** Extract duration in ms from a log line. */
function extractDurationMs(line: string): number | undefined {
  for (const p of DURATION_PATTERNS) {
    const m = line.match(p);
    if (m) {
      const val = parseFloat(m[1]);
      // If matched "s" pattern, convert to ms
      if (p.source.includes("s(?:ec)?")) return Math.round(val * 1000);
      return Math.round(val);
    }
  }
  return undefined;
}

/** Determine log level from HTTP status code and duration. */
function levelFromStatus(status: number, durationMs?: number): LogLevel {
  if (status >= 500) return "error";
  if (status >= 400) return "warn";
  if (durationMs !== undefined && durationMs >= SLOW_REQUEST_THRESHOLD_MS) return "warn";
  return "info";
}

/** Detect which framework produced the log line. */
function detectFramework(line: string): string {
  if (line.includes("INFO:") && line.includes("HTTP/")) return "uvicorn";
  if (/^\w+\s+\//.test(line) && /\d+\.\d+\s*ms/.test(line)) return "express";
  return "nginx";
}

export const httpAccessLogParser: ErrorParser = {
  name: "http-access-log",

  canParse(line: string): boolean {
    return UVICORN_PATTERN.test(line) || EXPRESS_PATTERN.test(line) || NGINX_PATTERN.test(line);
  },

  parse(line: string): ParsedError | null {
    let method: string, path: string, statusStr: string;

    const uvMatch = line.match(UVICORN_PATTERN);
    if (uvMatch) {
      [, method, path, statusStr] = uvMatch;
    } else {
      const exMatch = line.match(EXPRESS_PATTERN);
      if (exMatch) {
        [, method, path, statusStr] = exMatch;
      } else {
        const ngMatch = line.match(NGINX_PATTERN);
        if (ngMatch) {
          [, method, path, statusStr] = ngMatch;
        } else {
          return null;
        }
      }
    }

    const status = parseInt(statusStr, 10);
    const durationMs = extractDurationMs(line);
    const isSlow = durationMs !== undefined && durationMs >= SLOW_REQUEST_THRESHOLD_MS;

    return {
      message: durationMs !== undefined
        ? `${method} ${path} ${status} ${durationMs}ms${isSlow ? " [SLOW]" : ""}`
        : `${method} ${path} ${status}`,
      level: levelFromStatus(status, durationMs),
      context: {
        file: path,
        http_status: status,
        framework: detectFramework(line),
      },
      scoring_hints: {
        http_status: status,
        is_user_code: isSlow,
      },
    };
  },
};
