# Audit All Endpoints

Systematically verify every API endpoint is healthy. Inspired by CyberAgent's automated Storybook audit pattern.

## When to Use

After a major refactor, dependency upgrade, or when you need confidence that the entire API surface is clean.

## Workflow

1. **Find all routes** - read the routes file, OpenAPI spec, Django urls.py, or Express router
2. **For each endpoint:**
   - Chrome DevTools MCP: `navigate_page(url: "http://localhost:8000/api/endpoint")`
   - TracePulse: `get_errors(message_contains: "/api/endpoint")`
   - If errors: TracePulse: `get_error_context(fingerprint)` for details
3. **Report findings** - list clean endpoints vs erroring endpoints with error details

## Example Prompt

```
Audit all API endpoints in this project. Find the routes file, then for each endpoint:
1. Make a request using Chrome DevTools MCP
2. Check TracePulse get_errors for any backend errors
3. Report which endpoints are clean and which have errors
```

## Expected Output

```
API Audit Results:
- GET /api/users - CLEAN
- GET /api/users/:id - CLEAN
- POST /api/users - ERROR: ValidationError at users.py:42 (signal: 65)
- GET /api/products - CLEAN
- POST /api/export - ERROR: PermissionError at export.py:18 (signal: 72)

2 errors found across 5 endpoints. Highest priority: POST /api/export (signal: 72)
```
