# Audit All API Endpoints

Systematically verify every API endpoint is healthy. Inspired by CyberAgent's automated Storybook audit.

## The Pattern

1. Find all routes in the project
2. For each endpoint: make a request, check for errors
3. Report clean vs erroring endpoints

## Example Prompt

```
Audit all API endpoints. Find the routes file, then for each endpoint:
1. Make a request using Chrome DevTools MCP
2. Check TracePulse get_errors(message_contains: "/api/endpoint") for backend errors
3. Report which endpoints are clean and which have errors
```

## Expected Output

```
API Audit Results:
- GET /api/users       — CLEAN
- GET /api/users/:id   — CLEAN
- POST /api/users      — ERROR: ValidationError at users.py:42 (signal: 65)
- GET /api/products    — CLEAN
- POST /api/export     — ERROR: PermissionError at export.py:18 (signal: 72)

2 errors found across 5 endpoints.
Highest priority: POST /api/export (signal: 72)
```

## Tools Used

| Step | Tool |
|------|------|
| Make HTTP request | Chrome DevTools MCP: `navigate_page` |
| Check for backend errors | TracePulse: `get_errors(message_contains: "/api/...")` |
| Get error details | TracePulse: `get_error_context(fingerprint)` |
| Check git correlation | TracePulse: `correlate_with_diff()` |
