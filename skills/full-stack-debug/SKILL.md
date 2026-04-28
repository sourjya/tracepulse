# Full-Stack Debug

Structured workflow for debugging errors across backend and frontend using TracePulse + Chrome DevTools MCP.

## When to Use

Use this skill when you need to trace an error from the browser through to the backend, or when a user reports a frontend issue that may have a backend cause.

## Workflow

### Step 1: Check Backend Errors
```
get_errors(limit: 10)
```
Get recent backend errors sorted by signal score.

### Step 2: Check Browser Console
Using Chrome DevTools MCP:
```
list_console_messages(types: ["error", "warn"])
```
Look for JavaScript errors or failed network requests in the browser.

### Step 3: Check Network Requests
Using Chrome DevTools MCP:
```
list_network_requests(resourceTypes: ["fetch", "xhr"])
```
Find failed API calls (4xx/5xx status codes).

### Step 4: Correlate Frontend and Backend
```
get_correlated_errors(url: "/api/endpoint")
```
Match browser HTTP failures with backend stack traces. Check `correlation_confidence` and `match_method`.

### Step 5: Check Git Changes
```
correlate_with_diff()
```
Link errors to recent code changes. Focus on files that appear in both the error and the diff.

### Step 6: Fix and Verify
1. Edit the code to fix the root cause
2. `watch_for_errors(15)` — verify backend is clean
3. Using Chrome DevTools MCP:
   - `navigate_page(type: "reload")` — reload the page
   - `wait_for("expected content")` — verify the page loads correctly
   - `list_console_messages(types: ["error"])` — verify no new browser errors

## Tool Reference

| Tool | Source | Purpose |
|------|--------|---------|
| `get_errors` | TracePulse | Backend errors |
| `get_correlated_errors` | TracePulse | Frontend-backend correlation |
| `watch_for_errors` | TracePulse | Post-fix verification |
| `correlate_with_diff` | TracePulse | Link errors to git changes |
| `list_console_messages` | Chrome DevTools MCP | Browser console errors |
| `list_network_requests` | Chrome DevTools MCP | Failed API calls |
| `take_snapshot` | Chrome DevTools MCP | Page content verification |
