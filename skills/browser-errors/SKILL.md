# Browser Error Capture

Catch frontend JavaScript errors with zero project changes. Three approaches, pick based on your setup.

## Approach 1: Auto-inject error catcher (recommended, zero project changes)

At the start of any session involving frontend code, inject the error catcher once:

```
evaluate_script({
  function: "() => {
    if (window.__tpErrorCatcher) return 'already installed';
    window.__tpErrorCatcher = true;
    const send = (type, msg, extra) => {
      fetch('http://127.0.0.1:9801/api/v1/errors', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({url: location.href, method: type, statusCode: 0, statusText: msg, responseBodySnippet: extra})
      }).catch(() => {});
    };
    window.addEventListener('error', e => send('JS_ERROR', e.message, e.filename+':'+e.lineno));
    window.addEventListener('unhandledrejection', e => send('PROMISE_REJECTION', String(e.reason)));
    return 'installed';
  }"
})
```

After this, all JS errors flow to TracePulse automatically. They appear in `get_correlated_errors()` and are searchable via `get_errors(message_contains: "...")`.

**Re-inject after page reload** - the script doesn't persist across navigations.

## Approach 2: Check browser console directly (simplest, no injection needed)

Just ask Chrome DevTools MCP for errors whenever you check TracePulse:

```
# Backend check
get_errors(limit: 5)

# Frontend check (same session)
list_console_messages(types: ["error"])
```

This requires no injection, no project changes, nothing. The agent just makes two calls instead of one. The SKILL.md routing guide already documents this pattern.

## Approach 3: Combined check pattern (best practice)

After any code change that touches frontend AND backend:

```
1. verify_fix(10)                                    # Backend clean?
2. list_console_messages(types: ["error"])            # Browser clean?
3. If both clean: done
4. If backend error: get_error_context(fingerprint)
5. If browser error: read the console message, fix the JS
```

This is the recommended full-stack verification pattern. No injection, no project changes, no SDK. Just two tool calls from two MCP servers.

## When to use which

| Situation | Approach |
|-----------|----------|
| Quick check after a change | Approach 2 (two tool calls) |
| Long debugging session | Approach 1 (inject once, errors auto-flow) |
| Full-stack verification | Approach 3 (combined pattern) |
| Chrome DevTools MCP unavailable | No browser error visibility (TP limitation) |

## What TP sees vs doesn't see

| Error type | TP sees it? | How |
|-----------|:-----------:|-----|
| Backend 500 / exception | Yes | Parsed from server stdout/stderr |
| Backend 4xx | Yes | HTTP access log parser |
| Browser JS crash (ErrorBoundary) | With Approach 1 | Injected catcher POSTs to TP |
| Browser console error | With Approach 2 | Agent reads via Chrome DevTools MCP |
| Browser network failure (fetch 401) | No | Use Chrome DevTools MCP `list_network_requests` |
| Silent wrong data (200 but wrong) | No | Business logic - needs tests |
