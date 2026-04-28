# GitHub Issue from Error

Create a GitHub issue from a TracePulse error using the GitHub MCP server.

## When to Use

When TracePulse finds a high-signal error that needs tracking in the project's issue tracker.

## Prerequisites

GitHub MCP server must be configured alongside TracePulse.

## Workflow

### Step 1: Find the error
```
get_errors(limit: 1)
```
Pick the highest-signal error.

### Step 2: Get full context
```
get_error_context(fingerprint: "<fingerprint>")
```

### Step 3: Create the issue
Using GitHub MCP:
```
create_issue(
  title: "[TracePulse] <error_type>: <message truncated to 80 chars>",
  body: "## Error Details\n\n- **File:** <context.file>:<context.line>\n- **Type:** <context.error_type>\n- **Signal Score:** <signal_score>/100\n- **Occurrences:** <occurrence_count>\n\n## Stack Trace\n\n```\n<stack_trace>\n```\n\n## Surrounding Logs\n\n<surrounding_logs summary>\n\n---\n*Created by TracePulse*",
  labels: ["bug", "tracepulse"]
)
```

## Example Issue

**Title:** [TracePulse] TypeError: Cannot read property 'id' of undefined

**Body:**
```
## Error Details

- **File:** src/routes/users.ts:42
- **Type:** TypeError
- **Signal Score:** 75/100
- **Occurrences:** 3

## Stack Trace

TypeError: Cannot read property 'id' of undefined
    at getUser (src/routes/users.ts:42:15)
    at Layer.handle (node_modules/express/lib/router/layer.js:95:5)

---
*Created by TracePulse*
```
