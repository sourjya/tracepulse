# Backend Error Triage

Structured workflow for investigating and fixing backend errors using TracePulse.

## When to Use

Use this skill when TracePulse reports backend errors and you need to investigate, understand, and fix them.

## Workflow

### Step 1: Check Status
```
get_runtime_status()
```
Verify the dev server is connected and check error count.

### Step 2: Get New Errors
```
get_new_errors(limit: 5)
```
Focus on errors with fingerprints not seen in previous sessions. These are the most likely to be caused by recent changes.

### Step 3: Deep-Dive Context
For each high-signal error:
```
get_error_context(fingerprint: "<fingerprint>")
```
Review the error details, surrounding logs (±5 seconds), and occurrence count.

### Step 4: Read Source Code
Open the file and line from `context.file` and `context.line`. Understand the code path that produced the error.

### Step 5: Check Trends
```
get_error_trends(fingerprint: "<fingerprint>")
```
Is this a new error or a recurring one? How many sessions has it appeared in?

### Step 6: Correlate with Changes
```
correlate_with_diff()
```
Link errors to recent git changes. Focus on errors in files you recently modified.

### Step 7: Fix and Verify
1. Edit the code to fix the root cause
2. `watch_for_errors(15)` - wait for hot-reload
3. If errors persist, repeat from Step 3

## Decision Tree

- **High signal (score ≥ 50)**: Investigate immediately - likely a crash or unhandled exception
- **Medium signal (20-49)**: Check after high-signal errors are resolved
- **Low signal (< 20)**: Usually informational - review if time permits
