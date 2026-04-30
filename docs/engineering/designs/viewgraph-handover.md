## ViewGraph Handover Design

### Routing hints in empty TP responses

When TP returns zero errors but the user reports a problem, TP should suggest where to look next:

```json
{
  "errors": [],
  "diagnostics": "No backend errors. If the page shows a blank state or visual bug, check the browser side:",
  "suggested_next": [
    "Chrome DevTools MCP: list_console_messages(types: ['error'])",
    "ViewGraph: request_capture() to inspect the DOM"
  ]
}
```

Extends existing why-empty diagnostics. Agent gets explicit routing instead of guessing.

### Shared error fingerprints via ErrorBoundary bridge

When ViewGraph captures a page with a React ErrorBoundary crash visible in the DOM, and TP has the same crash via the ErrorBoundary bridge, the agent can correlate them by matching error messages. No direct TP-to-VG communication needed - the agent is the integration layer.

### What's NOT needed

- TP doesn't need to know ViewGraph's capture format
- No direct TP-to-VG communication channel
- No shared state or database
- The agent correlates by matching error messages across tools

### Decision tree (already in SKILL.md)

```
Backend error? -> TracePulse
Browser error? -> Chrome DevTools MCP
Visual bug?   -> ViewGraph
```
