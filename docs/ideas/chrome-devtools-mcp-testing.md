# Chrome DevTools MCP — Capability Inventory & Testing Use Cases

Reference document for using Chrome DevTools MCP as a testing and verification tool during TracePulse development.

## Tool Inventory

### Page Management

| Tool | Purpose | Key Parameters |
|------|---------|----------------|
| `list_pages` | List all open browser pages | — |
| `select_page` | Switch active page context | `pageId`, `bringToFront` |
| `new_page` | Open a new tab with URL | `url`, `background`, `isolatedContext` |
| `close_page` | Close a page by ID | `pageId` |
| `navigate_page` | Navigate: URL, back, forward, reload | `type`, `url`, `ignoreCache` |
| `resize_page` | Set page dimensions | `width`, `height` |

### DOM & Content

| Tool | Purpose | Key Parameters |
|------|---------|----------------|
| `take_snapshot` | A11y tree text snapshot (preferred over screenshot) | `verbose`, `filePath` |
| `take_screenshot` | Visual screenshot (PNG/JPEG/WebP) | `fullPage`, `uid`, `format`, `quality`, `filePath` |
| `click` | Click an element by uid | `uid`, `dblClick` |
| `hover` | Hover over an element | `uid` |
| `fill` | Type into input/textarea or select option | `uid`, `value` |
| `fill_form` | Fill multiple form elements at once | `elements[]` |
| `type_text` | Type text into focused input | `text`, `submitKey` |
| `press_key` | Press key or key combo | `key` (e.g., "Enter", "Control+A") |
| `drag` | Drag element onto another | `from_uid`, `to_uid` |
| `upload_file` | Upload file through input | `uid`, `filePath` |
| `wait_for` | Wait for text to appear on page | `text[]`, `timeout` |
| `evaluate_script` | Run JavaScript in page context | `function`, `args`, `dialogAction` |
| `handle_dialog` | Accept/dismiss browser dialogs | `action`, `promptText` |

### Network

| Tool | Purpose | Key Parameters |
|------|---------|----------------|
| `list_network_requests` | List all requests since last navigation | `resourceTypes[]`, `pageSize` |
| `get_network_request` | Get request/response details | `reqid`, `requestFilePath`, `responseFilePath` |

### Console

| Tool | Purpose | Key Parameters |
|------|---------|----------------|
| `list_console_messages` | List console messages | `types[]`, `pageSize` |
| `get_console_message` | Get specific console message | `msgid` |

### Performance & Auditing

| Tool | Purpose | Key Parameters |
|------|---------|----------------|
| `lighthouse_audit` | Accessibility, SEO, best practices audit | `device`, `mode`, `outputDirPath` |
| `performance_start_trace` | Start performance trace | `autoStop`, `reload`, `filePath` |
| `performance_stop_trace` | Stop active trace | `filePath` |
| `performance_analyze_insight` | Analyze specific performance insight | `insightSetId`, `insightName` |
| `take_memory_snapshot` | Capture heap snapshot | `filePath` |

### Emulation

| Tool | Purpose | Key Parameters |
|------|---------|----------------|
| `emulate` | Emulate device features | `viewport`, `colorScheme`, `geolocation`, `networkConditions`, `userAgent`, `cpuThrottlingRate` |

---

## Testing Use Cases for TracePulse

### 1. MCP Server Smoke Testing

Verify TracePulse MCP tools respond correctly by running a dev server and checking tool output in a browser-based test harness.

```
navigate_page → dev server URL
wait_for → "listening on port"
take_snapshot → verify page loaded
list_console_messages → check for errors
```

### 2. Build Error Verification

After introducing a deliberate build error, verify the dev server output:

```
navigate_page → localhost:3000 (dev server)
wait_for → error text on page
take_snapshot → capture error overlay
list_console_messages → capture console errors
```

### 3. Hot-Reload Verification

Test that hot-reload detection works by editing a file and watching the page:

```
navigate_page → dev app
evaluate_script → record current state
[edit source file]
wait_for → "compiled successfully" or updated content
take_snapshot → verify new content rendered
```

### 4. Error Overlay Parsing

Many dev servers (Vite, Next.js, CRA) show error overlays in the browser:

```
navigate_page → dev app with error
take_snapshot → capture error overlay DOM
evaluate_script → extract error details from overlay
```

### 5. Network Request Validation

Verify API calls and responses during development:

```
navigate_page → app page that makes API calls
list_network_requests → filter by fetch/xhr
get_network_request → inspect specific request/response
```

### 6. Accessibility Auditing

Run Lighthouse on pages during development:

```
navigate_page → target page
lighthouse_audit → get a11y, SEO, best practices scores
```

### 7. Performance Profiling

Capture performance traces for analysis:

```
navigate_page → target page
performance_start_trace → begin recording
[interact with page]
performance_stop_trace → save trace
performance_analyze_insight → analyze specific metrics
```

### 8. Visual Regression (Screenshots)

Capture screenshots for before/after comparison:

```
navigate_page → target page
take_screenshot → save to file for comparison
```

### 9. Console Error Monitoring

Monitor console for runtime errors during testing:

```
navigate_page → app
[perform actions]
list_console_messages → filter types=["error", "warn"]
get_console_message → get full error details
```

### 10. Form Testing

Automate form interactions:

```
take_snapshot → find form elements by uid
fill_form → fill multiple fields
click → submit button
wait_for → success/error message
take_snapshot → verify result
```

---

## Integration with TracePulse Workflow

The Chrome DevTools MCP complements TracePulse in the debugging stack:

```
TracePulse (backend errors) → Chrome DevTools MCP (browser state) → ViewGraph (visual UI)
```

**Typical agent workflow:**
1. TracePulse `get_errors()` → identifies backend error
2. Chrome DevTools `list_console_messages()` → checks browser-side impact
3. Chrome DevTools `list_network_requests()` → finds failed API call
4. Chrome DevTools `take_snapshot()` → sees error state in UI
5. Agent fixes code
6. TracePulse `watch_for_errors(15)` → verifies fix on backend
7. Chrome DevTools `wait_for()` + `take_snapshot()` → verifies fix in browser

---

## Configuration Reference

Current project config (`.kiro/settings/mcp.json`):

```json
{
  "command": "npx",
  "args": [
    "chrome-devtools-mcp@latest",
    "--headless",
    "--isolated",
    "--executable-path=/usr/bin/google-chrome"
  ]
}
```

Key flags:
- `--headless` — no visible browser window
- `--isolated` — temp user-data-dir, cleaned up on close
- `--executable-path` — explicit Chrome binary path
