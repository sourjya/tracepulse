# How It Works

```
Raw Log Line → ANSI Strip → Secret Redact → Hot-Reload Check
  → Multi-Line Accumulate → Parser Registry (18 parsers)
  → Normalize → Signal Score → Fingerprint → Ring Buffer
  → MCP Tools (18 tools) → AI Agent
```

Every line your dev server prints goes through this pipeline before the agent sees it. The agent never reads raw logs.

See [Data Pipeline](pipeline.md) for details on each stage.
