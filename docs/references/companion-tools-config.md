# Companion Tools MCP Configuration

Reference configs for the three tools in the agentic debugging stack.
Adapt paths to your machine before using.

## This Machine (sourjya)

- Chrome: `/usr/bin/google-chrome`
- Node: v22.21.1 at `/usr/local/sf/bin/node`
- ViewGraph: `/usr/local/sf/lib/node_modules/@viewgraph/core/server/index.js`
- npx: `/home/sourjya/.nvm/versions/node/v22.16.0/bin/npx`

## Full Stack Config (.mcp.json)

```json
{
  "mcpServers": {
    "tracepulse": {
      "command": "node",
      "args": [
        "/home/sourjya/coding/tracepulse/dist/cli.js",
        "start",
        "npm run dev"
      ],
      "autoApprove": [
        "get_runtime_status",
        "get_errors",
        "get_server_logs",
        "clear_errors"
      ]
    },
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "chrome-devtools-mcp@latest",
        "--headless",
        "--isolated",
        "--executable-path=/usr/bin/google-chrome"
      ],
      "autoApprove": [
        "list_pages",
        "select_page",
        "new_page",
        "close_page",
        "navigate_page",
        "take_snapshot",
        "take_screenshot",
        "click",
        "fill",
        "fill_form",
        "hover",
        "type_text",
        "press_key",
        "evaluate_script",
        "wait_for",
        "emulate",
        "resize_page",
        "list_console_messages",
        "get_console_message",
        "list_network_requests",
        "get_network_request",
        "lighthouse_audit",
        "performance_start_trace",
        "performance_stop_trace",
        "take_memory_snapshot"
      ]
    },
    "viewgraph": {
      "command": "node",
      "args": [
        "/usr/local/sf/lib/node_modules/@viewgraph/core/server/index.js"
      ],
      "env": {
        "VIEWGRAPH_CAPTURES_DIR": ".viewgraph/captures"
      },
      "autoApprove": [
        "list_captures",
        "get_capture",
        "get_latest_capture",
        "get_page_summary",
        "get_elements_by_role",
        "get_interactive_elements",
        "find_missing_testids",
        "audit_accessibility",
        "compare_captures",
        "get_annotations",
        "get_annotation_context",
        "request_capture",
        "get_request_status",
        "get_fidelity_report",
        "audit_layout"
      ]
    }
  }
}
```

## Notes

- **TracePulse** tools are all auto-approved because `get_errors`, `get_server_logs`, and `get_runtime_status` are read-only (`readOnlyHint: true`). `clear_errors` is destructive but idempotent — safe to auto-approve for dev workflows.
- **Chrome DevTools** uses `--headless` for CI/agent use, `--isolated` for clean sessions. Remove `--headless` if you need to see the browser.
- **ViewGraph** `VIEWGRAPH_CAPTURES_DIR` should point to the project's `.viewgraph/captures/` directory. Use a relative path if running from the project root.
- **executable-path**: This machine has Google Chrome at `/usr/bin/google-chrome`. The other machine (sourjyas) uses Snap Chromium at `/snap/bin/chromium`. Adjust per machine.

## The Debugging Stack

```
Agent makes a code change
  │
  ├── TracePulse: "Did the backend crash? Any new errors?"
  │   └── get_runtime_status → get_errors → read source at file:line → fix
  │
  ├── Chrome DevTools MCP: "Does the page work? Console errors? Network failures?"
  │   └── navigate_page → take_snapshot → list_console_messages → list_network_requests
  │
  └── ViewGraph: "Does the UI look right? A11y issues? Layout broken?"
      └── request_capture → get_page_summary → audit_accessibility
```

Backend first (fastest feedback) → browser verification → visual/a11y verification.
