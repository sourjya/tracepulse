# DevLoop Agent — Tasks

## Phase 1: Types & Signal Aggregator

### Task 1.1: Define cross-layer types
- **Deliverable:** `src/correlation/cross-layer/types.ts`
- **RED:** Test that LayerSignal, CrossLayerPattern, Diagnosis types compile and validate
- **GREEN:** Type definitions with JSDoc

### Task 1.2: Signal aggregator - backend signals
- **Deliverable:** `src/correlation/cross-layer/signal-aggregator.ts`
- **RED:** Test that `collectBackendSignals(buffer, since)` returns LayerSignal[] from ring buffer events
- **GREEN:** Reads ring buffer, maps RuntimeEvent → LayerSignal with layer="backend"

### Task 1.3: Signal aggregator - frontend signals
- **RED:** Test that `collectFrontendSignals(feBuffer, since)` returns LayerSignal[] from frontend errors
- **GREEN:** Reads frontend error buffer, maps FrontendError → LayerSignal with layer="frontend"

### Task 1.4: Signal aggregator - git signals
- **RED:** Test that `collectGitSignals(cwd, since)` returns file-changed signals
- **GREEN:** Calls execGit for recent changes, returns LayerSignal with layer="git"

### Task 1.5: Signal aggregator - process signals
- **RED:** Test that `collectProcessSignals(spawner, reloadDetector, since)` returns process state
- **GREEN:** Checks spawner PID, last restart time, hot-reload events

### Task 1.6: Unified aggregator
- **RED:** Test that `aggregateSignals(deps, since)` combines all layer signals sorted by timestamp
- **GREEN:** Calls all collectors, merges, sorts, deduplicates

## Phase 2: Pattern Library

### Task 2.1: Pattern definitions
- **Deliverable:** `src/correlation/cross-layer/pattern-library.ts`
- **RED:** Test that PATTERNS array contains all 7 initial patterns with valid structure
- **GREEN:** Static array of CrossLayerPattern objects

### Task 2.2: Pattern validation
- **RED:** Test that each pattern has unique id, valid timeWindowMs, non-empty requiredSignals
- **GREEN:** Validation function for pattern integrity

## Phase 3: Correlation Matcher

### Task 3.1: Signal matching logic
- **Deliverable:** `src/correlation/cross-layer/correlation-matcher.ts`
- **RED:** Test that `matchPattern(signals, pattern)` returns true when all required signals present within time window
- **GREEN:** Pure function checking signal presence and time proximity

### Task 3.2: Template filling
- **RED:** Test that `fillTemplate(template, signals)` replaces {placeholders} with signal details
- **GREEN:** String interpolation from signal metadata

### Task 3.3: Full diagnosis pipeline
- **RED:** Test that `diagnose(signals, patterns)` returns sorted Diagnosis[] with confidence scores
- **GREEN:** Iterates patterns, matches, fills templates, sorts by confidence

### Task 3.4: Confidence boosting from optional signals
- **RED:** Test that optional signal matches increase confidence by 10 points
- **GREEN:** Check optional signals after required match, adjust score

## Phase 4: MCP Tool

### Task 4.1: Tool handler
- **Deliverable:** `src/tools/get-cross-layer-diagnosis.ts`
- **RED:** Test that handler returns diagnoses array with correct schema
- **GREEN:** Calls aggregator → matcher → formats response

### Task 4.2: Tool registration
- **RED:** Test that tool appears in MCP server tool list
- **GREEN:** Register in server.ts with schema

### Task 4.3: Edge cases
- **RED:** Test empty signals → graceful "no diagnosis" response
- **RED:** Test time_window_seconds validation (max 300)
- **GREEN:** Handle all edge cases

## Phase 5: Integration & Verification

### Task 5.1: End-to-end test with mock signals
- **RED:** Test full flow: inject events into buffer → call tool → get diagnosis
- **GREEN:** Integration test proving the pipeline works

### Task 5.2: Build verification
- Run `tsc --noEmit` — zero errors
- Run full test suite — all passing
- Verify tool description under 200 tokens

### Task 5.3: Documentation
- Update README tool table
- Update roadmap
