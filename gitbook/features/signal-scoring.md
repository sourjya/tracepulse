# Signal Scoring

Every event gets a `signal_score` (0-100) and `signal_strength` (high/medium/low).

## How It Works

Scoring is additive. Each matching condition adds points:

| Condition | Points |
|-----------|--------|
| Unhandled exception / crash | +40 |
| Stack trace present | +20 |
| File:line in user code (not node_modules) | +15 |
| HTTP 5xx server error | +15 |
| Error-level log | +10 |
| First occurrence of this fingerprint | +10 |
| HTTP 4xx client error | +10 |
| Warning-level log | +5 |
| Seen 3+ times (noise reduction) | -5 |

Final score is clamped to [0, 100].

## Signal Strength Tiers

| Tier | Score Range | Meaning |
|------|------------|---------|
| **high** | >= 50 | Crash, unhandled exception, clear stack trace in user code |
| **medium** | 20-49 | Error without stack trace, HTTP 4xx, caught exception |
| **low** | < 20 | Warning, deprecation, info log, hot-reload marker |

## Why It Matters

The agent sees errors sorted by signal score (highest first). A crash with a user-code stack trace (score ~85) appears before a deprecation warning (score ~5). The agent triages like a senior developer — most important first.

## Infrastructure Boost

Infrastructure errors get additional scoring:

| Pattern | Boost |
|---------|-------|
| Out of memory | +30 |
| Disk full | +30 |
| Connection pool exhausted | +25 |
| Connection refused | +20 |
| DNS failure | +15 |
| Slow request (>1s) | +15 |
| Crash loop (3+ restarts in 60s) | Score: 95 |
