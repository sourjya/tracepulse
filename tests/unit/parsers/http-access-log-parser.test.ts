/**
 * Unit tests for HTTP access log parser.
 *
 * @see src/parsers/http-access-log-parser.ts
 */

import { describe, it, expect } from "vitest";
import { httpAccessLogParser } from "@/parsers/http-access-log-parser.js";

describe("HTTP access log parser", () => {
  it("parses uvicorn format", () => {
    const line = 'INFO:     127.0.0.1:54321 - "GET /api/users HTTP/1.1" 200';
    expect(httpAccessLogParser.canParse(line)).toBe(true);
    const result = httpAccessLogParser.parse(line);
    expect(result).not.toBeNull();
    expect(result!.context.http_status).toBe(200);
    expect(result!.context.file).toBe("/api/users");
    expect(result!.context.framework).toBe("uvicorn");
    expect(result!.level).toBe("info");
  });

  it("parses uvicorn 500 as error level", () => {
    const line = 'INFO:     127.0.0.1:54321 - "POST /api/export HTTP/1.1" 500';
    const result = httpAccessLogParser.parse(line);
    expect(result).not.toBeNull();
    expect(result!.context.http_status).toBe(500);
    expect(result!.level).toBe("error");
    expect(result!.scoring_hints.http_status).toBe(500);
  });

  it("parses uvicorn 422 as warn level", () => {
    const line = 'INFO:     127.0.0.1:54321 - "PUT /api/users/1 HTTP/1.1" 422';
    const result = httpAccessLogParser.parse(line);
    expect(result).not.toBeNull();
    expect(result!.context.http_status).toBe(422);
    expect(result!.level).toBe("warn");
  });

  it("parses express/morgan format", () => {
    const line = "GET /api/users 200 15.234 ms";
    expect(httpAccessLogParser.canParse(line)).toBe(true);
    const result = httpAccessLogParser.parse(line);
    expect(result).not.toBeNull();
    expect(result!.context.http_status).toBe(200);
    expect(result!.context.file).toBe("/api/users");
    expect(result!.context.framework).toBe("express");
  });

  it("parses express 404", () => {
    const line = "GET /api/missing 404 2.100 ms";
    const result = httpAccessLogParser.parse(line);
    expect(result).not.toBeNull();
    expect(result!.context.http_status).toBe(404);
    expect(result!.level).toBe("warn");
  });

  it("parses nginx combined format", () => {
    const line = '127.0.0.1 - - [28/Apr/2026:10:00:00 +0000] "GET /api/users HTTP/1.1" 200 1234';
    expect(httpAccessLogParser.canParse(line)).toBe(true);
    const result = httpAccessLogParser.parse(line);
    expect(result).not.toBeNull();
    expect(result!.context.http_status).toBe(200);
    expect(result!.context.file).toBe("/api/users");
  });

  it("detects slow requests (>1000ms) as warnings", () => {
    const line = "GET /api/export 200 2345.678 ms";
    const result = httpAccessLogParser.parse(line);
    expect(result).not.toBeNull();
    expect(result!.level).toBe("warn");
    expect(result!.message).toContain("[SLOW]");
  });

  it("extracts duration from express format", () => {
    const line = "GET /api/users 200 15.234 ms";
    const result = httpAccessLogParser.parse(line);
    expect(result).not.toBeNull();
    expect(result!.message).toContain("15ms");
  });

  it("does not match non-HTTP lines", () => {
    expect(httpAccessLogParser.canParse("TypeError: Cannot read property")).toBe(false);
    expect(httpAccessLogParser.canParse("Server listening on port 3000")).toBe(false);
    expect(httpAccessLogParser.canParse("[vite] hmr update")).toBe(false);
  });

  it("has name 'http-access-log'", () => {
    expect(httpAccessLogParser.name).toBe("http-access-log");
  });
});
