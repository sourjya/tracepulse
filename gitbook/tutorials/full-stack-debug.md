# Full-Stack Debugging

Debug errors that span frontend and backend using TracePulse + Chrome DevTools MCP.

## The Scenario

User reports: "The page shows a blank state." You need to find out why.

## Step 1: Check backend

```
get_errors(limit: 5)
```

If TracePulse shows a 500 error with a stack trace - you found it. Fix the backend.

## Step 2: Check browser

If TracePulse shows nothing, the problem is frontend-side. Use Chrome DevTools MCP:

```
list_console_messages(types: ["error"])
list_network_requests(resourceTypes: ["fetch", "xhr"])
```

Look for failed API calls (4xx/5xx status codes).

## Step 3: Correlate

If you find a failed request in the browser AND a backend error:

```
get_correlated_errors(url: "/api/users")
```

This matches the browser HTTP failure with the backend stack trace.

## Step 4: Investigate

```
get_error_context(fingerprint: "<from step 1>")
```

See the full error + surrounding logs +/-5 seconds.

## Step 5: Check git changes

```
correlate_with_diff()
```

See if the error is in a file you recently changed.

## Step 6: Fix and verify

```
verify_fix(10)
```

Then verify the browser:
```
Chrome DevTools MCP: navigate_page(type: "reload")
Chrome DevTools MCP: wait_for("expected content")
Chrome DevTools MCP: list_console_messages(types: ["error"])
```

## Tool Routing

| I need to see... | Use |
|-------------------|-----|
| Backend exceptions | TracePulse `get_errors` |
| Browser console errors | Chrome DevTools MCP `list_console_messages` |
| Failed HTTP requests | Chrome DevTools MCP `list_network_requests` |
| Request/response body | Chrome DevTools MCP `get_network_request` |
| Auth failures (401/403) | Chrome DevTools MCP `get_network_request` |
| Page content | Chrome DevTools MCP `take_snapshot` |
| Visual layout | Chrome DevTools MCP `take_screenshot` |
