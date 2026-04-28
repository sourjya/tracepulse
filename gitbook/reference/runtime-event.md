# RuntimeEvent Schema

Every error, warning, or log line becomes a RuntimeEvent.

```typescript
{
  id: string,              // UUIDv4
  timestamp: number,       // Unix ms
  source: string,          // "server-stdout" | "server-stderr" | "build-error"
  service: string,         // "main" | "api" | "worker"
  level: string,           // "error" | "warn" | "info" | "debug"
  message: string,         // max 500 chars
  stack_trace?: string,    // max 15 frames
  fingerprint: string,     // SHA-256 dedup key
  signal_score: number,    // 0-100
  signal_strength: string, // "high" | "medium" | "low"
  context: {
    file?: string,
    line?: number,
    column?: number,
    framework?: string,
    error_type?: string,
    http_status?: number,
    trace_id?: string
  },
  raw: string,             // max 1000 chars
  first_seen: number,
  occurrence_count: number
}
```
