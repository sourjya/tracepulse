# TracePulse: MCP Tool Clustering Implementation Guide

Source: User-provided implementation guide based on ViewGraph's gateway.js pattern.

## Overview

TracePulse exposes 30 MCP tools. At ~200 tokens per tool schema, every session message carries ~6,000 tokens of schema overhead. Tool clustering collapses 30 tools into 7 gateway tools + 2 standalone. Schema overhead drops from ~6,000 to ~1,800 tokens.

## Architecture

The same `gateway.js` from ViewGraph is fully portable. It depends only on the MCP SDK's `server.tool()` signature, Zod schemas, and a `cluster-config.json` file.

### How it works

1. `createToolProxy(server, { clustered: true })` wraps the server
2. All 30 `register*()` calls run against the proxy - tools captured into registry, NOT registered on the real server
3. `registerGateways(server, registry)` registers 7 gateway tools on the real server
4. Agent discovers sub-tools via gateway's discovery mode (no action param)
5. Agent dispatches sub-tool calls through gateway with `action` param

### Wiring

```typescript
const { proxy, registry } = createToolProxy(server, { clustered });

// All existing register calls unchanged - target proxy instead of server
registerGetErrors(proxy);
registerGetBuildErrors(proxy);
// ... all 30 register calls ...

if (clustered) {
  const count = registerGateways(server, registry);
  process.stderr.write(`[tracepulse] clustered mode: ${count} gateways registered\n`);
}
```

No changes to any individual tool file.

## Destructive Action Guard

`tp_manage` contains `clear_errors` and `restart_server`. The gateway checks for `confirm: true` before dispatching:

```typescript
const destructive = ['clear_errors', 'restart_server'];
if (destructive.includes(params.action) && !params.confirm) {
  return {
    content: [{ type: 'text',
      text: `"${params.action}" is a destructive operation. Re-call with confirm=true.`
    }]
  };
}
```

## Shared Parameter Deduplication

| Param | Appears in | Savings |
|---|---|---|
| `since` | 5 tools | ~100 tokens |
| `limit` | 4 tools | ~80 tokens |
| `source` | 3 tools | ~60 tokens |
| `service` | 3 tools | ~60 tokens |
| `status_code_min` | 2 tools | ~40 tokens |

Total: ~340 tokens saved from dedup alone (20-40% additional reduction).

## Token Impact

| Mode | Tools visible | Schema tokens | 25-turn total |
|---|---|---|---|
| Flat (current) | 30 | ~6,000 | ~150,000 |
| Clustered | 9 (7 gateways + 2 standalone) | ~1,800 | ~45,000 + on-demand |
| Clustered + compression | 9 | ~1,200 | ~30,000 + on-demand |

Net saving: 85-90% reduction in schema token consumption.
