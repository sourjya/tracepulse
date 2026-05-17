# DevLoop Agent — Cross-Layer Correlation

## Overview

A correlation engine that watches signals from all layers of the dev stack simultaneously (backend logs, browser console, git state, build output, process state) and produces actionable diagnoses instead of requiring the agent to manually triangulate across 3-4 separate tools.

## User Stories

### US-1: Cross-Layer Diagnosis

**As** a coding agent debugging a failure,
**I want** to call `get_cross_layer_diagnosis` and receive a single actionable diagnosis,
**So that** I don't waste 30 minutes chasing the wrong layer.

**Acceptance Criteria:**
- Tool returns a diagnosis with confidence score (0-100)
- Diagnosis includes: which layers are involved, what the root cause likely is, and a suggested fix
- Response is under 500 tokens
- Returns "no diagnosis" gracefully when signals don't match any known pattern

### US-2: Backend OK + Frontend Error

**As** a coding agent seeing a 200 OK in TracePulse but a browser error,
**I want** the diagnosis to say "response format mismatch" or "auth token expired",
**So that** I don't waste time debugging the backend when the issue is frontend parsing.

**Acceptance Criteria:**
- Pattern matches when: backend HTTP 200 + frontend TypeError/error within 5s window
- Diagnosis distinguishes auth issues (401/403 in response body) from parsing issues (TypeError on response field)
- Confidence ≥ 70 for this pattern

### US-3: Stale Server Detection

**As** a coding agent that just edited code,
**I want** to be told "server running old code — restart required",
**So that** I don't debug logic that isn't even running.

**Acceptance Criteria:**
- Detects when: file changed (git diff) + no hot-reload event detected + no new process spawn
- Time window: file change within last 60s, no restart within last 30s
- Confidence ≥ 80 for this pattern

### US-4: Rate Limit Awareness

**As** a coding agent hitting 429 errors,
**I want** to be told "rate limiter bucket full from recent burst — wait or reset",
**So that** I don't try to "fix" code that isn't broken.

**Acceptance Criteria:**
- Pattern matches when: 429 status code + high request volume in preceding 5 minutes
- Diagnosis includes estimated wait time if available from headers
- Confidence ≥ 75 for this pattern

### US-5: Repeated Error Escalation

**As** a coding agent seeing the same error 3+ times,
**I want** to be told "not transient — root cause investigation needed",
**So that** I stop retrying and start investigating.

**Acceptance Criteria:**
- Triggers when same fingerprint appears 3+ times within 5 minutes
- Diagnosis includes the fingerprint and occurrence count
- Suggests looking at the specific file:line from context

### US-6: Schema Validation Failure

**As** a coding agent seeing a 422 response,
**I want** to be told which field failed validation and why,
**So that** I can fix the request payload directly.

**Acceptance Criteria:**
- Pattern matches when: 422 status + validation error in backend logs
- Extracts field name and constraint from error message
- Confidence ≥ 85 for this pattern (high because 422 is unambiguous)

## Non-Functional Requirements

### NFR-1: Performance
- Diagnosis must complete in < 50ms (in-memory pattern matching only)
- No external I/O during diagnosis (reads from existing buffers)

### NFR-2: Token Efficiency
- Response under 500 tokens for single diagnosis
- Under 1000 tokens for multi-diagnosis response

### NFR-3: Extensibility
- New patterns can be added without modifying the engine
- Pattern library is a data structure, not hardcoded if/else chains

### NFR-4: Graceful Degradation
- If a signal source is unavailable (e.g., no git, no browser), engine works with available signals
- Never errors — returns empty diagnosis with explanation of what's missing

## Out of Scope

- **Learning/ML**: No pattern weight adjustment in v1. Patterns are static.
- **Auto-intervention**: No automatic fix application. Diagnosis only.
- **External API calls**: No calls to LLMs or external services for diagnosis.
- **Browser signal ingestion**: Uses existing frontend error buffer (Phase 4). Does not add new CDP connections.
