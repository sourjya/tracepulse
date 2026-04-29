# Browser Error Capture

Catch frontend JavaScript errors by injecting a tiny error reporter into the browser.

## How It Works

TracePulse's log collector already runs on port 9801 and accepts `POST /api/v1/errors`. This skill teaches the agent to inject a browser-side error catcher using Chrome DevTools MCP.

## Step 1: Inject the error catcher

Using Chrome DevTools MCP at the start of a debugging session:

```
evaluate_script({
  function: "() => {
    if (window.__tpErrorCatcher) return 'already installed';
    window.__tpErrorCatcher = true;
    window.addEventListener('error', (e) => {
      fetch('http://127.0.0.1:9801/api/v1/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: location.href,
          method: 'JS_ERROR',
          statusCode: 0,
          statusText: e.message,
          responseHeaders: {},
          responseBodySnippet: e.filename + ':' + e.lineno + ':' + e.colno
        })
      }).catch(() => {});
    });
    window.addEventListener('unhandledrejection', (e) => {
      fetch('http://127.0.0.1:9801/api/v1/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: location.href,
          method: 'PROMISE_REJECTION',
          statusCode: 0,
          statusText: String(e.reason),
          responseHeaders: {}
        })
      }).catch(() => {});
    });
    return 'error catcher installed';
  }"
})
```

## Step 2: Errors flow to TracePulse

After injection, any `ReferenceError`, `TypeError`, or unhandled promise rejection in the browser automatically POSTs to TracePulse's log collector. They appear in:

- `get_correlated_errors()` - matched with backend errors
- `get_errors(message_contains: "readOnly")` - searchable

## Step 3: Debug normally

```
get_errors(limit: 5)
```

Now shows both backend AND frontend errors.

## When to Use

- At the start of any debugging session involving frontend code
- When the user reports "the page is broken" and you suspect a JS error
- After deploying frontend changes

## Limitations

- Must be re-injected after page reload (the script doesn't persist)
- Only catches errors on the current page
- Requires Chrome DevTools MCP to be connected
