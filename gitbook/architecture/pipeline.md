# Data Pipeline

## Stage 1: ANSI Stripping
Remove color codes from dev server output.

## Stage 2: Secret Redaction
Replace API keys, tokens, passwords with [REDACTED]. 13 patterns.

## Stage 3: Hot-Reload Check
Match against 11 dev tool patterns. Inject synthetic marker events.

## Stage 4: Multi-Line Accumulation
Buffer consecutive lines that form a traceback block (Python, Go, Java). Feed as single string to parsers.

## Stage 5: Parser Registry
Try 18 parsers in priority order. First match wins. Unmatched lines become raw info events.

## Stage 6: Normalization
Convert to RuntimeEvent: truncate message (500 chars), stack trace (15 frames), raw (1000 chars).

## Stage 7: Signal Scoring
Additive 0-100 scoring based on error type, stack trace, user code, HTTP status, etc.

## Stage 8: Fingerprinting
SHA-256 hash of source + normalized message + file:line. Same error = same fingerprint.

## Stage 9: Ring Buffer
Store up to 500 events. Duplicate fingerprints update occurrence count. FIFO eviction when full.

## Stage 10: Crash Loop Detection
Count restart events in sliding window. 3+ in 60s = crash loop alert.
