# Future Research & Ideas

**Date:** 2026-04-27
**Status:** Parked — items to research when relevant phases begin

---

## Parked for Future Research

### 1. Performance Benchmarking (Phase 2+)

**Why parked:** Premature optimization. 500 events is small. Benchmark when real users report issues.

**What to measure:**
- Pipeline throughput: lines/second before event loop saturation (redactor runs 12 regex patterns, parser tries 6 parsers, fingerprinter does SHA-256)
- Ring buffer query performance: O(n log n) sort on every `get_errors` call — measurable at 500 events?
- Memory footprint: 500 RuntimeEvents with stack traces — actual heap usage
- Regex performance per parser: which patterns are slowest on real-world input

**How to measure:**
- `vitest bench` for microbenchmarks
- `node --prof` for CPU profiling
- `process.memoryUsage()` snapshots before/after buffer fill

### 2. MCP Server-Initiated Notifications (Phase 5)

**Why parked:** Depends on MCP protocol evolution. Phase 5 is weeks away.

**Current state (April 2026):**
- MCP spec `2025-11-25` does not have server-initiated tool notifications
- 5 SEPs are open proposing new annotation types (trust, sensitivity, unsafeOutput, secret, trusted)
- A Tool Annotations Interest Group is forming (Microsoft, OpenAI, AWS, Cloudflare, Anthropic)
- Our Phase 5 design uses polling fallback until push is available

**What to track:**
- MCP spec revisions for notification support
- `@modelcontextprotocol/sdk` changelog for new notification APIs
- How Chrome DevTools MCP and other servers handle proactive updates

### 3. Multi-Line Stack Trace Accumulator (Phase 1 P1)

**Why parked:** Medium effort, needs careful design. Current parsers handle multi-line when passed as a single string, but the pipeline processes line-by-line.

**Design considerations:**
- Buffer consecutive lines that look like continuation (indented, `at `, `File "`, `Caused by:`)
- Flush buffer on: new error pattern, blank line, timeout (100ms), or non-continuation line
- Risk: holding lines in buffer delays delivery to the agent
- Reference: Logstash multiline codec, Fluent Bit multiline parser, Splunk LINE_BREAKER

### 4. Real Agent Testing Matrix

**Why parked:** Need a working build first. Test after Phase 1 is published to npm.

**Agents to test with:**
- Claude Code (Anthropic) — most popular MCP client
- Cursor — large user base, MCP support
- Kiro CLI — our own environment
- Windsurf — growing MCP adoption
- Cline — open source, good for debugging integration issues
- Gemini CLI — Google's agent

**What to validate per agent:**
- Does the agent discover TracePulse tools automatically?
- Does it call `get_errors` after code changes without being told?
- How does it handle `isError: true` responses?
- Does the SKILL.md improve tool usage?
- What's the actual token consumption per tool call?

### 5. Windows Support (Phase 3+)

**Why parked:** Linux/macOS first. Windows has different process management.

**Key issues:**
- `process.kill(-pid)` (process group kill) doesn't work on Windows
- SIGTERM is not a real signal on Windows — `TerminateProcess` is SIGKILL equivalent
- `fs.watch` behavior differs on Windows (uses ReadDirectoryChangesW)
- Need `taskkill /pid ${pid} /T /F` for process tree kill

### 6. Custom Parser Configuration

**Why parked:** CLI args for MVP. Config file for Phase 3 multi-service.

**Design options:**
- `tracepulse.config.json` with custom regex patterns
- `--parsers=node,python` CLI flag to enable/disable parsers
- User-defined parser plugins (JS modules implementing ErrorParser interface)

---

## Research Completed & Integrated

### Token Economics & Tool Design (Integrated into Phase 1)

**Key findings from research:**

1. **Tool definition token cost matters.** Pydantic's research showed a 44% reduction in token usage by simplifying tool schemas (418 → 233 tokens). Our tool definitions should be concise.

2. **Progressive disclosure is critical.** The pattern `status → errors → context` matches how agents naturally triage. Cheapest call first, drill down only when needed. This is already our design (Decision 7).

3. **Context window pressure is real.** Claude Code with Opus 4.5 shows ~58% free space with moderate tool use. Each MCP server's tool definitions consume ~1-3K tokens. Our 4 tools should stay under 1K total.

4. **Agents don't always know to call tools.** Anthropic's MCP tool search feature (2026) helps, but many agents still need explicit guidance. The SKILL.md we created addresses this.

5. **Token budget for responses:** Default limits of 20 errors / 50 logs are reasonable. The Pydantic article recommends returning formatted markdown over raw JSON for readability — but our consumers are agents, not humans, so structured JSON is correct.

**Sources:**
- [Pydantic: Engineering MCP Tools for Token Efficiency](https://pydantic.dev/articles/engineering-mcp-tools-for-token-efficiency)
- [Daily Dose of DS: How We Cut Claude Code Token Usage 2.8x](https://blog.dailydoseofds.com/p/how-we-cut-our-claude-code-token)
- [async-let: Do MCP Servers Really Eat Half Your Context Window?](https://www.async-let.com/posts/claude-code-mcp-token-reporting)
- [l6e.ai: Give your agent a budget](https://l6e.ai/)

### MCP Tool Annotations (Integrated into Phase 1)

**Key findings:**

The `ToolAnnotations` interface (MCP spec `2025-03-26`) provides behavioral hints:

```typescript
interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;    // default: false
  destructiveHint?: boolean; // default: true
  idempotentHint?: boolean;  // default: false
  openWorldHint?: boolean;   // default: true
}
```

**TracePulse tool annotations:**

| Tool | readOnlyHint | destructiveHint | idempotentHint | openWorldHint |
|------|-------------|-----------------|----------------|---------------|
| `get_runtime_status` | `true` | `false` | `true` | `false` |
| `get_errors` | `true` | `false` | `true` | `false` |
| `get_server_logs` | `true` | `false` | `true` | `false` |
| `clear_errors` | `false` | `true` | `true` | `false` |

Rationale:
- All read tools are `readOnlyHint: true` — agents can auto-approve without confirmation
- `clear_errors` is `destructiveHint: true` — agents should confirm before clearing
- All tools are `idempotentHint: true` — safe to retry on failure
- All tools are `openWorldHint: false` — they only read from the local ring buffer, no external data

**Sources:**
- [MCP Blog: Tool Annotations as Risk Vocabulary](https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/)
- [MCP Spec: ToolAnnotations](https://modelcontextprotocol.io/specification/2025-11-25/schema#toolannotations)
- [Stacklok: Tool annotations are becoming the risk vocabulary](https://stacklok.com/blog/tool-annotations-are-becoming-the-risk-vocabulary-for-agentic-systems-that-matters-more-than-it-might-seem/)

### Agent Skills / SKILL.md (Integrated into Phase 1)

**Key findings:**

A skill is a folder with a `SKILL.md` file. The format is:
- YAML frontmatter with `name` and `description`
- Markdown body with workflow patterns, tool reference, and troubleshooting

Chrome DevTools MCP ships 6 skills. The core skill teaches:
1. Core concepts (browser lifecycle, page selection, element interaction)
2. Workflow patterns (before interacting, efficient data retrieval, tool selection)
3. Troubleshooting

**What we created:** `skills/tracepulse/SKILL.md` with:
- Core concepts (signal scoring, progressive disclosure)
- Workflow patterns (after code change, debugging session, server crash)
- Tool reference with token costs
- Key response fields to look at
- What TracePulse does NOT do (boundary with other tools)

**Sources:**
- [Chrome DevTools MCP skills/](https://github.com/ChromeDevTools/chrome-devtools-mcp/tree/main/skills)
- [Agent Skills 101: a practical guide](https://blog.serghei.pl/posts/agent-skills-101/)
- [How to build self-improving coding agents](https://ericmjl.github.io/blog/2026/1/18/how-to-build-self-improving-coding-agents-part-2/)
- [Progressive Disclosure Might Replace MCP](https://www.mcpjam.com/blog/claude-agent-skills)

### Dev Server Output Patterns (Integrated into Phase 2 spec)

**Key findings from research:**

| Framework | Startup Pattern | Hot-Reload Pattern | Error Output |
|-----------|----------------|-------------------|--------------|
| **Next.js** | `▲ Next.js 15.x` / `✓ Ready in Xms` | `○ Compiling ...` / `✓ Compiled in Xms` | stderr: full stack trace with file:line. ANSI colored. |
| **Vite** | `VITE vX.X.X ready in X ms` / `➜ Local: http://...` | `X:XX:XX [vite] hmr update /path` | stderr: `[vite] Internal server error: ...` with stack. ANSI colored. |
| **Django** | `Watching for file changes with StatReloader` / `Starting development server at http://...` | `Watching for file changes with StatReloader` (restarts) | stderr: full Python traceback. `Exception in thread django-main-thread:` |
| **Rails** | `=> Booting Puma` / `* Listening on http://...` | File change triggers full restart | stderr: Ruby exception with backtrace |
| **Spring Boot** | `Started Application in X.X seconds` | DevTools restart: `Restarting...` | stderr: Java exception with `at` frames and `Caused by:` chains |
| **Go (net/http)** | Custom (no standard message) | No hot-reload (manual restart) | stderr: `goroutine N [running]:` panic output |

**Key observations:**
1. **All frameworks use ANSI colors** — our ANSI stripping (Pitfall 4.4) is critical
2. **Most errors go to stderr** — our stderr capture is correct
3. **Hot-reload patterns are framework-specific** — Phase 2's pattern registry needs these exact strings
4. **Python/Django needs PYTHONUNBUFFERED** — our spawner fix is correct
5. **Go has no hot-reload** — `watch_for_errors` should handle "no restart detected" gracefully

### npx Cold Start (Noted, not blocking)

**Key findings:**
- npx cold start for a ~550KB bundle: typically 2-5 seconds (download + install + start)
- MCP clients typically have 30-60 second timeout for server startup
- Gemini CLI users reported 8-12 second startup with slow MCP servers
- Zed users reported 32+ seconds waiting for MCP server initialization
- Our bundle is small (547KB) with one dependency (@modelcontextprotocol/sdk) — should be fast
- Not a blocker, but worth measuring after npm publish
