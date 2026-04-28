# Debugger Mode

Structured debugging workflow triggered by "enter debugger mode" or "debug this". Goes from "something broke" to "here's the fix" systematically.

## When to Use

When the user says something is broken and you need to investigate.

## Workflow

### Step 1: Assess
```
get_runtime_status()
```
Is the server running? How many errors?

### Step 2: Identify
```
get_errors(limit: 5)
```
What are the highest-signal errors?

### Step 3: Investigate
For the highest-signal error:
```
get_error_context(fingerprint: "<fingerprint>")
```
Get full details + surrounding logs.

### Step 4: Locate
Read the source file at `context.file:context.line`. Understand the code path.

### Step 5: Check browser (if frontend involved)
```
Chrome DevTools MCP: list_console_messages(types: ["error"])
Chrome DevTools MCP: list_network_requests(resourceTypes: ["fetch", "xhr"])
```

### Step 6: Correlate
```
correlate_with_diff()
```
Did your recent changes cause this?

### Step 7: Fix and verify
1. Edit the code
2. `watch_for_errors(duration_seconds: 15)` or `get_build_errors()`
3. If clean: done. If not: repeat from Step 2.

## Decision Tree

- **Signal >= 50 (HIGH)**: Crash or unhandled exception. Fix immediately.
- **Signal 20-49 (MEDIUM)**: Error without stack trace. Investigate after HIGH items.
- **Signal < 20 (LOW)**: Warning or noise. Review if time permits.
