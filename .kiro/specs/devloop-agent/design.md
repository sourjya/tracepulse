# DevLoop Agent — Design

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    get_cross_layer_diagnosis                      │
│                         (MCP Tool)                               │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Correlation Engine                            │
│                                                                  │
│  1. Collect signals from all layers (SignalAggregator)           │
│  2. Match signal combinations against pattern library            │
│  3. Rank diagnoses by confidence                                 │
│  4. Return top diagnosis with explanation                        │
└──────────────────────────────┬──────────────────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
┌──────────────────┐ ┌─────────────────┐ ┌──────────────────┐
│  Backend Signals │ │ Frontend Signals│ │  Context Signals │
│  (ring buffer)   │ │ (FE error buf) │ │  (git, process)  │
└──────────────────┘ └─────────────────┘ └──────────────────┘
```

## Data Model

### LayerSignal

A normalized signal from any layer, used as input to pattern matching.

```typescript
interface LayerSignal {
  readonly layer: "backend" | "frontend" | "build" | "git" | "process";
  readonly type: string;        // e.g., "http-200", "type-error", "file-changed"
  readonly timestamp: number;   // Unix ms
  readonly detail: string;      // Human-readable detail
  readonly metadata: Record<string, unknown>; // Layer-specific data
}
```

### CrossLayerPattern

A known failure signature that spans multiple layers.

```typescript
interface CrossLayerPattern {
  readonly id: string;                    // e.g., "backend-ok-frontend-error"
  readonly name: string;                  // Human-readable name
  readonly description: string;           // What this pattern means
  readonly requiredSignals: SignalMatcher[]; // All must match
  readonly optionalSignals?: SignalMatcher[]; // Boost confidence if present
  readonly baseConfidence: number;        // 0-100
  readonly diagnosisTemplate: string;     // Template with {placeholders}
  readonly suggestedFix: string;          // Template with {placeholders}
  readonly timeWindowMs: number;          // Max time span for signals to correlate
}

interface SignalMatcher {
  readonly layer: LayerSignal["layer"];
  readonly type: string | RegExp;
  readonly metadataMatch?: Record<string, unknown>;
}
```

### Diagnosis

The output of the correlation engine.

```typescript
interface Diagnosis {
  readonly pattern_id: string;
  readonly confidence: number;          // 0-100
  readonly diagnosis: string;           // Filled template
  readonly suggested_fix: string;       // Filled template
  readonly signals_used: LayerSignal[]; // Which signals matched
  readonly layers_involved: string[];   // Which layers participated
}
```

## Component Design

### 1. SignalAggregator (`src/correlation/cross-layer/signal-aggregator.ts`)

Collects signals from all available sources into a unified `LayerSignal[]`:

| Source | How | Signal Types |
|--------|-----|-------------|
| Backend errors | Read from ring buffer | `http-4xx`, `http-5xx`, `exception`, `timeout` |
| Backend success | Read from ring buffer (info level) | `http-200`, `http-201` |
| Frontend errors | Read from frontend error buffer | `type-error`, `network-error`, `http-failure` |
| Git state | Call `execGit` (existing) | `file-changed`, `no-recent-changes` |
| Process state | Read from process spawner | `server-running`, `no-restart-detected`, `hot-reload` |
| Build state | Read from ring buffer (build-error source) | `build-error`, `build-success` |

**Time window:** Only collects signals from the last 60 seconds by default.

### 2. PatternLibrary (`src/correlation/cross-layer/pattern-library.ts`)

Static array of `CrossLayerPattern` objects. Patterns are ordered by specificity (most specific first). Initial patterns:

1. **backend-ok-frontend-error** — Backend 200 + Frontend TypeError → response format mismatch
2. **stale-server** — File changed + no restart → server running old code
3. **rate-limited** — 429 status → rate limiter bucket full
4. **repeated-error** — Same fingerprint 3x in 5min → not transient
5. **schema-validation** — 422 status + validation message → field constraint failure
6. **build-error-runtime** — Build error + runtime error → code not compiled
7. **auth-expired** — 401/403 + recent success → token expired

### 3. CorrelationMatcher (`src/correlation/cross-layer/correlation-matcher.ts`)

Pure function that takes `LayerSignal[]` and `CrossLayerPattern[]`, returns `Diagnosis[]`:

1. For each pattern, check if all `requiredSignals` match within `timeWindowMs`
2. If matched, check `optionalSignals` to boost confidence
3. Fill diagnosis and fix templates with signal details
4. Return all matching diagnoses sorted by confidence descending

### 4. MCP Tool (`src/tools/get-cross-layer-diagnosis.ts`)

Exposes `get_cross_layer_diagnosis` to agents:

```typescript
// Input schema
{
  time_window_seconds?: number;  // Default 60, max 300
}

// Output
{
  diagnoses: Diagnosis[];        // Top 3, sorted by confidence
  signals_collected: number;     // How many signals were aggregated
  layers_active: string[];       // Which layers had signals
  no_diagnosis_reason?: string;  // If empty: "No signals in time window" etc.
}
```

## File Layout

```
src/correlation/cross-layer/
├── signal-aggregator.ts      // Collects LayerSignal[] from all sources
├── pattern-library.ts        // Static CrossLayerPattern[] definitions
├── correlation-matcher.ts    // Pure matching engine
├── types.ts                  // LayerSignal, CrossLayerPattern, Diagnosis
└── index.ts                  // Re-exports

src/tools/
└── get-cross-layer-diagnosis.ts  // MCP tool handler
```

## Integration Points

- **Ring buffer** (`src/store/ring-buffer.ts`): Read recent events
- **Frontend error buffer** (`src/correlation/frontend-error-buffer.ts`): Read browser errors
- **Git diff correlator** (`src/correlation/git-diff-correlator.ts`): Detect file changes
- **Process spawner** (`src/collectors/process-spawner.ts`): Check server state
- **Hot reload detector** (`src/watch/hot-reload-detector.ts`): Check for recent reloads
- **MCP server** (`src/mcp/server.ts`): Register the new tool

## MCP Tool Registration

Added to `src/mcp/server.ts` alongside existing tools. Schema:

```json
{
  "name": "get_cross_layer_diagnosis",
  "description": "Cross-layer failure diagnosis. Correlates backend logs, frontend errors, git state, and process state to identify root causes that span multiple layers.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "time_window_seconds": {
        "type": "number",
        "description": "How far back to look for signals (default 60, max 300)."
      }
    }
  }
}
```
