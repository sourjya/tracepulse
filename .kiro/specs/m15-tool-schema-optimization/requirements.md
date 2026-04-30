# M15: Tool Schema Optimization - Spec

Source: [MCP Tooling Research](../../docs/research/mcp-tooling-research--the-case-for-rearchitecting-tracepulse-and-viewgraph.md)

## Problem

TracePulse's 30 tool schemas are injected into agent context on every message at ~200 tokens/tool = ~6,000 tokens overhead per turn. Over a 25-turn session, that's ~150,000 tokens of schema overhead alone. Research (Speakeasy, arXiv 2603.20313) shows 90%+ reduction is achievable.

## Requirements

### R1: Tool Clustering with Progressive Disclosure
Group 30 tools into 4-5 semantic clusters. Only the cluster entry points load at session start. Individual tools load on demand.

| Cluster | Entry Tool | Contains |
|---------|-----------|----------|
| health | `get_project_health` | get_runtime_status, get_health_summary, check_port, get_infra_status, get_infra_detail |
| errors | `get_errors` | get_build_errors, get_error_context, get_error_clusters, get_new_errors, get_error_trends, get_correlated_errors |
| verify | `verify_fix` | watch_for_errors, wait_for_build, wait_for_event, clear_errors, restart_server |
| execute | `run_and_watch` | get_requests, get_migration_status, get_perf_baseline |
| meta | `get_audit_trail` | list_services, correlate_with_diff, register_probe, list_probes |

Session start: 5 tool schemas (~1,000 tokens) instead of 30 (~6,000 tokens). 83% reduction.

### R2: Tool Description Compression
Apply "tool smell" remediation (arXiv 2602.14878):
- Remove redundant phrases ("Use this tool to...")
- Compress parameter descriptions to essential info
- Remove examples from schema (move to SKILL.md)
- Target: 25-35% reduction per schema

### R3: Token Audit in get_audit_trail
Extend audit trail to track estimated token cost per tool call:
- Schema tokens (fixed per tool)
- Response tokens (measured per call)
- Cumulative session total
- "Tokens saved vs manual" estimate

### R4: Updated Marketing Metrics
- Track and surface: tokens saved per session, estimated cost savings, carbon equivalent
- Add to get_audit_trail response as optional `efficiency_summary` field

## Out of Scope
- MCP SEP-1576 JSON $ref deduplication (depends on protocol spec adoption)
- Semantic embedding-based cluster pre-warming (over-engineered for current scale)

## Design

### Progressive Disclosure Implementation

Option A: **Dynamic toolsets** (Speakeasy pattern) - 2 meta-tools (`list_available_tools`, `invoke_tool`) replace all 30. Agent discovers tools on demand.

Option B: **Cluster registration** - register 5 cluster tools at startup. Each cluster tool's handler returns the full schemas of its member tools when called with `action: "list"`.

Option C: **Lazy registration** - register all 30 but with minimal descriptions. Full descriptions loaded via a `get_tool_help(tool_name)` tool.

**Recommendation:** Option B. It preserves tool discoverability (agents see 5 real tools, not 2 meta-tools) while cutting schema overhead by 83%. Option A is more aggressive but hurts discoverability.
