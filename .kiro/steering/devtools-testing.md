---
inclusion: always
description: Rules for using Chrome DevTools MCP as a testing and verification tool during development
---

# Chrome DevTools MCP Testing Rules

Rules for using Chrome DevTools MCP tools during development and testing sessions.

## When to Use Chrome DevTools MCP

- **After code changes**: Verify the result in the browser - take a snapshot or screenshot to confirm the UI updated correctly.
- **Debugging runtime errors**: Check `list_console_messages` for browser-side errors after TracePulse reports backend errors.
- **Network verification**: Use `list_network_requests` and `get_network_request` to inspect API calls, status codes, and response bodies.
- **Accessibility checks**: Run `lighthouse_audit` on pages to catch a11y issues early.
- **Performance profiling**: Use `performance_start_trace` / `performance_stop_trace` when investigating performance issues.
- **Visual confirmation**: Take screenshots to verify visual state when snapshots aren't sufficient.

## Tool Selection Priority

1. **`take_snapshot`** - Prefer over screenshots. Faster, structured, gives element uids for interaction.
2. **`take_screenshot`** - Use when visual appearance matters (layout, colors, images).
3. **`evaluate_script`** - Use for extracting specific data or state that snapshots don't capture.
4. **`wait_for`** - Use before snapshots/screenshots to ensure the page has finished loading or updating.

## Workflow Patterns

### Verify a page loaded correctly
```
navigate_page → url
wait_for → expected text
take_snapshot → confirm content
```

### Check for errors after a change
```
list_console_messages → types=["error", "warn"]
list_network_requests → look for failed requests
take_snapshot → check error states in UI
```

### Test form interactions
```
take_snapshot → get element uids
fill / fill_form → enter data
click → submit
wait_for → result text
take_snapshot → verify outcome
```

### Full-stack debugging with TracePulse
```
TracePulse get_errors() → backend errors
list_console_messages → browser errors
list_network_requests → failed API calls
take_snapshot → UI error state
[fix code]
TracePulse watch_for_errors(15) → verify backend
wait_for + take_snapshot → verify browser
```

## Rules

1. **Always use `wait_for` before taking snapshots** after navigation or actions that trigger page updates. Pages need time to render.
2. **Prefer snapshots over screenshots** for content verification. Screenshots are for visual/layout verification only.
3. **Use `includeSnapshot: true`** on interaction tools (click, fill, etc.) when you need to see the result immediately.
4. **Check console messages after navigation** to catch silent JavaScript errors.
5. **Use `--headless` mode** in CI and automated testing. The project config already sets this.
6. **Save artifacts to files** when needed for comparison - use `filePath` parameter on screenshots, traces, and snapshots.
7. **Use isolated contexts** (`isolatedContext` on `new_page`) when testing requires clean state without shared cookies/storage.
8. **Handle dialogs explicitly** - if a page might show alerts/confirms, use `handle_dialog` or pass `dialogAction` to `evaluate_script`.

## Capability Reference

See `docs/ideas/chrome-devtools-mcp-testing.md` for the full tool inventory and detailed use cases.
