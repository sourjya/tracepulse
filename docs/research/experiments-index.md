# TracePulse Experiments Index

Master index of all benchmarks, experiments, and validation tests. Updated as new experiments are added.

Last updated: 2026-05-02

---

## Experiment 1: Parser Accuracy Benchmark

**File:** `tests/benchmarks/parser-accuracy.test.ts`
**Samples:** 24 real-world error messages from Stack Overflow, GitHub issues, official docs
**Iterations:** 24 parser match tests + 3 signal scoring distribution tests = 28 total

### What it measures
- **Match rate:** Does the correct parser match each real-world sample?
- **Level accuracy:** Does the parser assign the correct severity (error/warn/info)?
- **Error type extraction:** Does the parser extract the correct error class name?
- **Signal scoring distribution:** Are crashes scored higher than warnings? 5xx > 4xx? First > recurring?

### Why it matters for token savings
If a parser misses an error, the agent sees raw unstructured text (~2,000 tokens) instead of structured JSON (~200 tokens). Every parser miss costs ~1,800 tokens. At 5 errors/session, a 90% match rate saves 9,000 tokens vs 80% saving 7,200 tokens. Parser accuracy directly multiplies token savings.

### Results (2026-05-02)
| Metric | Result |
|--------|--------|
| Match rate | 24/24 (100%) |
| Level accuracy | 22/24 (92%) |
| Error type accuracy | All tested samples correct |
| Signal scoring | 3/3 distribution tests pass |

### Known issues found
- **Go panic:** Matched but returns `info` instead of `error` (parser priority - a higher-priority parser matches first)
- **BullMQ job failed:** Same issue - matched but wrong level

### How to run
```bash
npx vitest run tests/benchmarks/parser-accuracy.test.ts
```

### How to add samples
Add entries to the `SAMPLES` array with `name`, `input`, `expectedParser`, and optional `expectedLevel`/`expectedErrorType`.

---

## Experiment 2: Pipeline Throughput Benchmark

**File:** `tests/perf/benchmark.test.ts`
**Iterations:** 10,000+ lines per run

### What it measures
- **End-to-end pipeline throughput:** lines/second through the full pipeline (ANSI strip -> redact -> parse -> normalize -> score -> fingerprint -> buffer)
- **Parser registry throughput:** lines/second through just the parser matching
- **Secret redaction throughput:** lines/second through the redaction patterns
- **Buffer query latency:** milliseconds per query on a full buffer

### Why it matters for token savings
Pipeline throughput determines whether TP can keep up with high-output dev servers. If TP falls behind, events are dropped and the agent misses errors (forcing manual log reading = more tokens). Sub-millisecond query latency means tool responses are instant - no waiting = fewer context switches = fewer tokens.

### Results (2026-04-29)
| Metric | Result |
|--------|--------|
| Full pipeline | 37,475 lines/sec |
| Parser registry | 92,375 lines/sec |
| Secret redaction | 258,443 lines/sec |
| Buffer query | 0.10 ms/query |

### How to run
```bash
npx vitest run tests/perf/benchmark.test.ts
```

---

## Experiment 3: Token Savings Simulation (PLANNED)

**Status:** Designed, not yet built

### What it would measure
- Simulate a 25-turn agent session with realistic tool call sequences
- Measure actual response sizes in tokens for each tool call
- Compare: "raw log reading" token cost vs "TP structured response" token cost
- Calculate per-session savings with real data

### Why it matters
Current savings estimates (90.6%) are calculated from measured session data but not from a controlled experiment. A simulation would provide reproducible, auditable numbers.

### Design
1. Generate 50 realistic error events (mix of types, severities)
2. Push them into a ring buffer
3. Simulate agent calling: get_project_health -> get_errors -> get_error_context -> verify_fix
4. Measure response sizes at each step
5. Compare with estimated "raw log" equivalent

---

## Planned Experiments

### Experiment 4: Error Type Histogram (SPEC BELOW)
Track which parsers match in production. Identify gaps where no parser catches an error.

### Experiment 5: Agent Behavior Analysis (SPEC BELOW)
Detect missed investigations, verification gaps, and tool usage patterns.

---

## Specs for New Features

### Spec: Error Type Histogram

**Problem:** We don't know which parsers are actually used in real sessions. The benchmark tests synthetic samples, but real-world usage may differ.

**Solution:** Track parser hit counts in the audit buffer during each session.

**Data model:**
```typescript
interface ParserStats {
  parser_name: string;
  hit_count: number;
  last_hit_at: number;
  sample_messages: string[];  // last 3 messages (truncated to 100 chars)
}
```

**Where it lives:** In-memory, attached to the audit buffer. Available via `get_audit_trail()` as a `parser_stats` field. No disk I/O.

**Implementation:**
1. In the pipeline's normalizer stage, after a parser matches, increment the counter
2. Store in a Map<string, ParserStats> alongside the audit buffer
3. Include in get_audit_trail response as `parser_stats: [...]`
4. Also track "unmatched" lines (no parser matched) with count

**Token savings relevance:** If a parser has 0 hits across many sessions, it's dead weight in the registry (adds latency). If "unmatched" count is high, there's a parser gap costing tokens.

**Effort:** Low (1 day). Wire into existing pipeline + audit buffer.

### Spec: Session Insights Tool (`get_session_insights`)

**Problem:** TP can't tell if the agent is using it effectively. Errors may sit uninvestigated, verification may be skipped, tools may be underused.

**Solution:** A new tool that analyzes the gap between what happened (events) and what the agent did (audit trail).

**Response:**
```json
{
  "uninvestigated_errors": [
    {
      "fingerprint": "abc...",
      "signal_score": 95,
      "message": "column does not exist",
      "age_minutes": 15,
      "occurrence_count": 42,
      "investigated": false
    }
  ],
  "verification_gaps": [
    {
      "hmr_event_at": 1714300000000,
      "verify_called": false,
      "gap_seconds": 300
    }
  ],
  "tool_usage": {
    "most_called": "run_and_watch (40x)",
    "least_called": "get_error_trends (0x)",
    "total_calls": 70,
    "session_duration_minutes": 120
  },
  "recommendations": [
    "Error 'column does not exist' (score 95) has been in buffer for 15 min without investigation. Call get_error_context('abc...') to investigate.",
    "3 HMR events occurred without subsequent verify_fix calls. Use verify_fix(3) after code changes."
  ]
}
```

**How it detects gaps:**
1. **Uninvestigated errors:** Compare event buffer (errors with signal_score >= 50) against audit trail (was get_error_context ever called with that fingerprint?). If not, it's uninvestigated.
2. **Verification gaps:** Compare file-change tracker / hot-reload events against audit trail (was verify_fix or get_build_errors called within 60s after?). If not, it's a gap.
3. **Tool usage:** Aggregate audit trail by tool name. Identify most/least called.
4. **Recommendations:** Generate actionable suggestions based on gaps.

**Token savings relevance:** 
- Uninvestigated high-signal errors mean the agent is blind to real bugs. When it eventually discovers them (via user report), it costs 5,000+ tokens of back-and-forth.
- Verification gaps mean the agent may be building on broken code. Each false-positive "fix" costs ~5,000 tokens when discovered later.
- Tool usage patterns reveal if the agent is using TP effectively or falling back to shell.

**Effort:** Medium (3-5 days). Needs cross-referencing audit buffer with event buffer and file-change tracker.

**Demo value:** HIGH. "Here's what the agent missed" is a compelling narrative for demos. Show get_session_insights at the end of a demo to reveal gaps.
