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
const EXPRESS_PATTERN = /^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+(\S+)\s+(\d{3})\s+[\d.]+\s*ms/;

/** nginx combined: ... "GET /api/users HTTP/1.1" 200 1234 */
const NGINX_PATTERN = /"\s*(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+(\S+)\s+HTTP\/[\d.]+"\s+(\d{3})\s+\d+/;

/** Determine log level from HTTP status code. */
function levelFromStatus(status: number): LogLevel {
  if (status >= 500) return "error";
  if (status >= 400) return "warn";
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

    return {
      message: `${method} ${path} ${status}`,
      level: levelFromStatus(status),
      context: {
        file: path,
        http_status: status,
        framework: detectFramework(line),
      },
      scoring_hints: {
        http_status: status,
      },
    };
  },
};
