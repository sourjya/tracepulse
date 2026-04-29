# Untracked Ideas - Consolidated from All Docs

Scanned all docs/ on 2026-04-29. Items not in any existing spec or roadmap.

## From architecture-guide.md
- Architecture guide says 5 tools "not yet wired" - **STALE, all are wired now. Needs doc update.**

## From collector-pitfalls-hardening.md
- "Third-party dependencies could still write to stdout - need to audit or add a stdout guard" - **OPEN**
- "Rapid duplicate events could cause unnecessary I/O" in log file tailer - **PARTIALLY HANDLED**
- "No activity for N seconds after file change should suggest restart" for Go/Java servers - **NOT BUILT**

## From feature-architecture-analysis.md
- "Flake classification taxonomy" - tag intermittent errors with likely category - **LOW PRIORITY**
- "Stale errors are noise" - errors from previous session could mislead agent - **ADDRESSED by pinned errors + clear_errors**

## From log-ingestion-flexibility.md
- "Stdin pipe mode" (`tail -f app.log | tracepulse pipe`) - **NOT BUILT, in design doc**
- "Log directory watching" (`--log-dir ./logs/`) - **NOT BUILT, in design doc**
- "Combined start + attach" (`--also-tail worker.log`) - **NOT BUILT, in design doc**

## From CHANGELOG.md
- "Notification dispatcher" for MCP push notifications - **BUILT but not wired to MCP notifications (protocol doesn't support push yet)**

## From engineering/designs/
- CI output parsing (GitHub Actions, GitLab CI) - **NOT BUILT, noted as future direction**

## Items to Add to M12 Spec

### Already in M12
- Why-empty diagnostics, error clustering, worker parsers, audit trail, etc.

### New items to add
1. **Stdout guard** - intercept third-party deps writing to stdout (breaks MCP JSON-RPC)
2. **Inactivity detector** - "no activity for N seconds after file change" suggests restart for non-hot-reload servers (Go, Java, Rust)
3. **Stdin pipe mode** - `tracepulse pipe` reads from stdin, enables `tail -f | tracepulse pipe`
4. **Log directory watching** - `--log-dir ./logs/` auto-discovers and tails all .log files
5. **MCP notifications** - when protocol supports push, wire notification dispatcher
