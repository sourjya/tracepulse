# M15: Tool Schema Optimization - Spec (Updated)

Source: [MCP Tooling Research](../../docs/research/mcp-tooling-research--the-case-for-rearchitecting-tracepulse-and-viewgraph.md)
Implementation Guide: [Tool Clustering Guide](../../docs/engineering/designs/tool-clustering-guide.md)

## Problem

30 tool schemas at ~200 tokens each = ~6,000 tokens overhead per turn. Over a 25-turn session: ~150,000 non-productive tokens.

## Solution: 7 Gateway Clusters

Collapse 30 tools into 7 gateway tools. Schema overhead drops from ~6,000 to ~1,400 tokens at session start. Sub-tools load on demand.

### Cluster Config

| Gateway | Description | Tools |
|---------|-------------|-------|
| `tp_health` | Runtime and project health checks. Use first. | get_runtime_status, get_health_summary, get_project_health |
| `tp_triage` | Error discovery and trends. Use when errors suspected. | get_errors, get_build_errors, get_new_errors, get_error_trends |
| `tp_watch` | Post-fix verification and event waiting. Use after code change. | verify_fix, watch_for_errors, wait_for_build, wait_for_event |
| `tp_investigate` | Deep error context, timelines, logs. Use after triage. | get_error_context, get_timeline, get_server_logs |
| `tp_correlate` | Cross-reference errors with diffs, clusters, signals. | correlate_with_diff, get_correlated_errors, get_error_clusters |
| `tp_infra` | Infrastructure status, service discovery, ports. | get_infra_status, get_infra_detail, check_port, list_services |
| `tp_manage` | Management: clear, restart, audit, migrations, baselines. | clear_errors, restart_server, get_audit_trail, get_migration_status, get_perf_baseline |

Note: `run_and_watch` and `get_requests` remain as standalone tools (not clustered) because they're high-frequency and benefit from direct access.

### Architecture

Uses the same `gateway.js` from ViewGraph - zero product-specific code. The gateway:
1. Wraps `server.tool()` with a proxy that captures tool registrations into a registry
2. Registers 7 gateway tools on the real server from cluster-config.json
3. Agent discovers sub-tools via gateway's discovery mode (no `action` param)
4. Agent dispatches sub-tool calls through gateway with `action` param

### Activation

Opt-in via CLI flag or env var (backward compatible):
```
tracepulse start --clustered "npm run dev"
TP_TOOL_MODE=clustered tracepulse start "npm run dev"
```

Flat mode (default) registers all 30 tools as today. No breaking change.

### Destructive Action Guard

`tp_manage` contains `clear_errors` and `restart_server`. Gateway requires `confirm: true` before dispatching:
```
tp_manage(action: "clear_errors")           -> "Destructive. Re-call with confirm=true."
tp_manage(action: "clear_errors", confirm: true) -> dispatched
```

### Shared Parameter Deduplication

These params repeat across 5+ tools:

| Param | Appears in |
|---|---|
| `since` | get_errors, get_new_errors, get_error_trends, get_timeline, get_server_logs |
| `limit` | get_errors, get_build_errors, get_error_clusters, get_server_logs |
| `source` | get_errors, get_error_context, get_correlated_errors |

Extract to `src/constants/common-params.ts` as shared Zod constants. Independent of clustering - applies in flat mode too. Additional 20-40% schema reduction.

### Token Impact

| Mode | Tools visible | Schema tokens (start) | 25-turn total |
|---|---|---|---|
| Flat (current) | 30 | ~6,000 | ~150,000 |
| Clustered | 7 gateways + 2 standalone | ~1,800 | ~45,000 + on-demand |
| Clustered + compression | 9 | ~1,200 | ~30,000 + on-demand |

On-demand: ~800-1,200 tokens per cluster fetched. Typical session touches 2-3 clusters. Net saving: **85-90% reduction.**

## Files Required

| File | Action |
|---|---|
| `src/clusters/gateway.ts` | Port from ViewGraph (zero changes needed) |
| `src/clusters/cluster-config.json` | Create with 7-cluster config |
| `src/constants/common-params.ts` | Shared Zod param definitions |
| `src/mcp/server.ts` | Add proxy wiring, --clustered flag |
| `src/cli.ts` | Add --clustered CLI flag |

## Testing Checklist

- [ ] Flat mode (default): all 30 tools register normally, no gateways
- [ ] Clustered mode: exactly 9 tools visible (7 gateways + run_and_watch + get_requests)
- [ ] Gateway discovery (no action): returns correct sub-tool listing
- [ ] Gateway dispatch (with action): sub-tool handler receives correct params
- [ ] tp_manage destructive guard: clear_errors without confirm=true returns warning
- [ ] Single-tool cluster edge case: z.literal() path works
- [ ] Unregistered tool in config: skipped cleanly
- [ ] 25-turn session: schema tokens don't re-accumulate
