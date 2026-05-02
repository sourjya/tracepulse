# Docs: Tool Reference Deep-Linking

## Problem

90+ inline tool references like `run_and_watch` across 19 gitbook pages don't link to the command's documentation. Users can't click through to see parameters, examples, or usage guidance.

## Solution

1. Restructure `gitbook/features/mcp-tools.md` to have an anchored subsection per tool (at least for the 15 most-referenced tools)
2. Convert inline backtick references to links: `` `run_and_watch` `` becomes `[run_and_watch](../features/mcp-tools.md#run_and_watch)`

## Scope

### Phase 1: Restructure mcp-tools.md
Add `### tool_name` headers for the top 15 tools. Each gets: one-line description, parameters table, example call, example response.

Top 15 by reference count:
1. `get_errors` - 25+ references
2. `verify_fix` - 20+ references
3. `run_and_watch` - 18+ references
4. `get_project_health` - 15+ references
5. `get_build_errors` - 12+ references
6. `watch_for_errors` - 10+ references
7. `get_error_context` - 8+ references
8. `verify_build` - 7+ references
9. `check_drift` - 5+ references
10. `correlate_with_diff` - 5+ references
11. `get_error_clusters` - 5+ references
12. `clear_errors` - 5+ references
13. `get_infra_status` - 4+ references
14. `get_migration_status` - 4+ references
15. `get_session_insights` - 3+ references

### Phase 2: Link inline references
Find-and-replace across 19 pages. Each inline tool reference becomes a markdown link to the anchored section.

## Effort
- Phase 1: 3-4 hours (restructure mcp-tools.md with 15 tool sections)
- Phase 2: 2-3 hours (link 90+ references across 19 pages)
- Total: ~1 day
