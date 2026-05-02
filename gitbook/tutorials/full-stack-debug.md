# Full-Stack Debugging

When a user reports "the page is broken," the bug could be anywhere: backend crash, browser error, visual glitch, or a combination. This tutorial shows how to use TracePulse + Chrome DevTools MCP together to find it fast.

## The Scenario

User reports: "The page shows a blank state." You need to find out why.

## Step 1: Check the backend first

```
get_errors(limit: 5)
```

If TracePulse shows a 500 error with a stack trace, you found it. The error includes the exact file, line number, and error type. Fix the backend code and skip to Step 6.

If TracePulse returns empty, the backend is clean. The problem is on the frontend side. TracePulse will suggest where to look next:

```json
{
  "errors": [],
  "diagnostics": "No backend errors.",
  "suggested_next": ["Chrome DevTools MCP: list_console_messages(types: ['error'])"]
}
```

## Step 2: Check the browser

Use Chrome DevTools MCP to look for JavaScript errors and failed API calls:

```
list_console_messages(types: ["error"])
list_network_requests(resourceTypes: ["fetch", "xhr"])
```

A failed API call (4xx/5xx) means the frontend tried to fetch data and the server rejected it. A console error means the JavaScript crashed.

## Step 3: Correlate frontend and backend

If you found a failed request in the browser AND a backend error in TracePulse:

```
get_correlated_errors(url: "/api/users")
```

This matches the browser HTTP failure with the backend stack trace, showing you both sides of the same bug.

## Step 4: Deep-dive into the error

```
get_error_context(fingerprint: "<from step 1>")
```

Returns the full error, surrounding log events from 5 seconds before and after, occurrence count, and a fix suggestion if the error matches a known pattern.

## Step 5: Check if your recent changes caused it

```
correlate_with_diff()
```

Links errors to your uncommitted git changes. If the error is in a file you recently edited, this tells you immediately.

## Step 6: Fix and verify both layers

Verify the backend:
```
verify_fix(fingerprint: "<error fingerprint>", duration_seconds: 5)
```

Verify the browser:
```
Chrome DevTools MCP: navigate_page(type: "reload")
Chrome DevTools MCP: wait_for("expected content")
Chrome DevTools MCP: list_console_messages(types: ["error"])
```

If both are clean, the fix is confirmed end-to-end.

## Quick Reference

| What you need | Which tool |
|---------------|-----------|
| Backend exceptions, stack traces | TracePulse `get_errors` |
| Browser console errors | Chrome DevTools MCP `list_console_messages` |
| Failed HTTP requests from browser | Chrome DevTools MCP `list_network_requests` |
| Request/response headers and body | Chrome DevTools MCP `get_network_request` |
| Match browser failure to backend error | TracePulse `get_correlated_errors` |
| Link error to recent code changes | TracePulse `correlate_with_diff` |
| Verify backend fix | TracePulse `verify_fix` |
| Verify browser fix | Chrome DevTools MCP `take_snapshot` |

> **Tool Reference:** See all [36 MCP Tools](../features/mcp-tools.md) for complete parameter details.
