---
inclusion: always
---

# Project Overrides

Project-specific values that override the generic defaults in the managed steering files.
This is the ONLY steering file you should edit. All other steering files are managed by
kiro-rails and will be overwritten on upgrade.

## Tech Stack

- **Runtime**: Node.js 22+ with TypeScript 5.x
- **Project type**: CLI tool + MCP server (no frontend, no backend API)
- **Package format**: npm package, distributable via `npx`
- **Dependencies**: npm with package.json
- **Build**: tsup (esbuild-based bundler for zero-dependency distribution)
- **MCP SDK**: `@modelcontextprotocol/sdk` for MCP server implementation

## Dev Server Ports

- No dev server - this is a CLI tool / MCP server
- MCP transport: stdio (primary), Streamable HTTP on port 9800 (secondary, Phase 3+)
- Internal log collector HTTP server: port 9801 (for future browser integration, Phase 4+)

## Database Engine

- No database - all state is in-memory (ring buffer) during runtime
- Optional file-based persistence for error fingerprint history (JSON files in `.tracepulse/`)

## Project-Specific Rules

- **NEVER mention context exhaustion, context depth, or remaining context percentage.** The user can see the figure. Do not warn, suggest stopping, or recommend "fresh sessions." Just keep working until told to stop or until you literally cannot produce output. No exceptions.

- This is an MCP server - stdout is reserved for JSON-RPC protocol messages. All debug/diagnostic output goes to stderr.
- VERSION is read from package.json at runtime (src/index.ts). Never hardcode a version string. On version bump, only package.json needs updating.
- **This is a PUBLIC repo.** Never reference private project names (coreiq, planiq, tactiq, labeliq, veritygate, shanti) in any file. Use anonymized names: "Nexus" (full-stack app), "Prism" (library monorepo), or generic descriptions. A pre-commit hook enforces this.
- The tool must work with ANY MCP-compatible agent (Kiro, Claude Code, Cursor, Copilot, Cline, Windsurf). No agent-specific code.
- Zero config for basic usage - `npx tracepulse start "npm run dev"` must work without a config file.
- Every RuntimeEvent must include `signal_score` (0-100) and `signal_strength` (high/medium/low) per Decision 7 in the architecture analysis.
- Error parsers are pluggable - each framework parser is a separate module implementing a common interface.
- Secret redaction runs on ALL log output before it enters the ring buffer. No secrets in MCP responses.
- Process spawning must handle graceful shutdown - SIGINT/SIGTERM forwarded to child process.

## Domain Constants

- Event sources: `server-stdout`, `server-stderr`, `build-error`, `docker-log`
- Signal strength tiers: `high` (score >= 50), `medium` (score 20-49), `low` (score < 20)
- Log levels: `error`, `warn`, `info`, `debug`
- Ring buffer max size: 500 events
- Default watch duration: 15 seconds
- Max message length: 500 chars
- Max stack trace frames: 15
- Max raw log line: 1000 chars

## Code Style Overrides

- Use `node:` prefix for all Node.js built-in imports (`node:child_process`, `node:path`, etc.)
- Prefer `interface` over `type` for object shapes
- Use `readonly` on all interface properties that shouldn't be mutated
- Error classes extend a base `TracePulseError` class
- All MCP tool handlers are pure functions that read from the event buffer - no side effects

## Environment and Tooling

- Package manager: npm
- Linter: eslint with `@typescript-eslint`
- Formatter: prettier
- Test runner: vitest
- Build: tsup
- Node.js version: 22+ (for built-in watch mode, structured clone, etc.)


## Bug Filing Process - MANDATORY

When the user reports a bug, execute this full workflow every time:

1. **File bug doc** - `docs/bugs/BUG-###-short-description.md` with standard fields (ID, Severity, Status, Reported, Description, Reproduction, Root Cause, Fix, Files Changed, Regression Tests)
2. **Create ticket in Tactiq** - POST to `http://localhost:8060/api/v1/tickets` in this project's Tactiq folder with full description
3. **Ask for screenshot** - ask the user: "Do you have a screenshot for this bug? Paste it here and I'll attach it to the ticket." If already provided, rename and attach via API. If not provided, skip.
4. **Add investigation comment** - POST comment with root cause analysis
5. **Fix the bug** - implement the fix
6. **Add solution comment** - POST comment describing the fix
7. **Close the ticket** - PATCH status to "closed"
8. **Update bug doc** - set Status to FIXED, fill in Fixed date and fix description
9. **Add regression test** - test that prevents the bug from recurring
10. **Commit** - single commit with all changes

### Tactiq Folder IDs (for ticket filing)

| Project | Folder ID |
|---------|-----------|
| PlanIQ | `00000000-0000-4000-b000-000000000010` |
| Tactiq | `00000000-0000-4000-b000-000000000020` |
| CoreIQ | `00000000-0000-4000-b000-000000000030` |
| SecurIQ | Engineering folder (check API) |
| PulseIQ | Engineering folder (check API) |
| PilotIQ | Engineering folder (check API) |

### Tactiq API Auth

```bash
TOKEN=$(curl -s -X POST http://localhost:8060/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@chaoslabz.dev","password":"ChaosLabz2026!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")
```



## Bug Filing via Tactiq - MANDATORY

When filing a bug in Tactiq (via tactiq-client), follow this structure exactly:

### Ticket Fields
- `title`: Short summary of the bug (max 80 chars). NO "BUG-###" prefix - Tactiq has its own alias numbering.
- `description`: Reproduction steps ONLY (numbered list). NO root cause. NO fix. NO screenshot paths.
- `priority`: low/medium/high/urgent (based on user impact)
- `severity`: minor/moderate/major/critical (based on system impact)
- `folder_id`: `8ea5c3e6-e6d6-4490-a2a0-a6d58f6e46d4` (tracepulse folder, alias TRP)
- Bugs: `fcf33b16-8e2c-46cd-b12c-9fc13e4b34d1`
- Feature Requests: `cf99b66e-ed23-443d-828f-8c1a09994517`
- Route bugs to Bugs folder, feature asks to Feature Requests folder

### Comment Thread (in order, NEVER skip)
1. **Investigation comment**: `"**Investigation:**\n" + root_cause`
2. **Resolution comment** (SEPARATE from investigation - never combine): `"**Fix:**\n" + fix_description + files_changed + commit_hash`
3. Close the ticket after fix is verified with reason param: short fix summary
**ENFORCEMENT: Steps 1-4 MUST complete before step 5 (fixing). If you find yourself writing code before filing the ticket and adding the investigation comment, STOP and go back to step 1. No exceptions.**
**ZERO TOLERANCE: This applies to ALL changes - bugs, features, UI tweaks, one-liners. There is no change too small for a ticket. If it changes code, it gets a ticket FIRST. The user will reject work done without a ticket.**

### Attachments
- Screenshot MUST be attached as a file via `client.attach_file(ticket_id, path)`
- If `attach_file()` fails (500, auth error, filename rejected), do ALL of these:
  1. Log the failure in the commit message ("attachment upload blocked by: <error>")
  2. Add the screenshot path as a comment: `"**Screenshot:** \`docs/artifacts/filename.png\`"`
  3. Note in the bug doc that attachment is pending
- NEVER silently skip the attachment step. If it fails, document WHY it failed.
- NEVER put file paths in the description field

### Anti-Patterns (BANNED)
```python
# WRONG - everything dumped into description
await client.create_ticket(
    description="Button not visible. Root cause: CSS. Fix: minHeight. Screenshot: path.png"
)

# CORRECT - structured across fields and comments
ticket = await client.create_ticket(
    description="1. Navigate to /login\n2. Enter credentials\n3. Expected: Blue button\n4. Actual: No button"
)
await client.add_comment(ticket["id"], "**Investigation:**\n:where(button) reset overrides bg-blue-600")
await client.add_comment(ticket["id"], "**Fix:**\nAdded inline backgroundColor. Commit: abc123")
```

### Linking - check EVERY time

Before creating or closing a ticket, ask yourself:
- Is this the same root cause as another open/recent ticket? LINK IT.
- Did you mention another ticket alias in your investigation? LINK IT.
- Is this a regression of a previously fixed ticket? LINK IT.
- Does the fix touch the same file/component as another ticket? LINK IT.

**If you reference another ticket in text, you MUST also pass it in `related_links`.**
Linking is BIDIRECTIONAL. Both tickets must reference each other.

### Formatting in Tickets

All ticket descriptions and comments support markdown. Use it:
- Code snippets: wrap in backticks (inline `code`) or fenced blocks
- File paths: wrap in backticks
- Error messages: wrap in code blocks
- Steps: use numbered lists

**Never put raw code in plain text.** If it looks like code, wrap it.

### Reference
Full guide: /home/sourjya/coding/shared-libs/tactiq-client/docs/INTEGRATION-GUIDE.md

## Feature Request Workflow - MANDATORY

When building a new feature (from user request or self-identified need):

**SEQUENCE IS NON-NEGOTIABLE.**

1. **File ticket in Tactiq** - POST to correct sub-folder (Feature Requests). Title = short description.
2. **Add proposed solution comment** - POST comment with approach, options considered, recommendation.
3. **Write spec** - `.kiro/specs/{feature-name}/requirements.md` (+ design.md if complex). Include ticket reference.
4. **Add to roadmap** - `docs/roadmap/roadmap.md` with milestone number, spec link, ticket reference.
5. **Link ticket to spec** - POST comment on ticket: spec path, roadmap entry, branch name.
6. **Build** - feature branch, implement per spec.
7. **Close ticket** - PATCH status to "closed" with reason: "Implemented in commit {hash}".

**Traceability chain:** Ticket (the ask) -> Spec (the design) -> Roadmap (the plan) -> Commit (the delivery). All linked.


### Data Integrity in Tickets - NEVER TRUNCATE

When filing tickets, comments, or descriptions:
- NEVER truncate UUIDs (write full `31784e66-e4c3-473a-98e2-edac494bb619`)
- NEVER truncate URLs (write full `http://localhost:8020/tickets/PLN-17`)
- NEVER truncate file paths (write full `frontend/src/shared/components/Pagination.tsx`)
- NEVER truncate commit hashes (write full `b1780a1` minimum 7 chars)
- NEVER truncate CRNs (write full `crn:chaoslabz:tactiq:local:default:ticket/PLN-17`)
- NEVER use "..." to shorten any reference data

Truncated references are useless for traceability. If it is a reference, write it in full.


**REOPEN vs NEW TICKET:**
- If a bug persists immediately after a fix attempt: REOPEN the same ticket, add a comment explaining recurrence, then fix again.
- If a related bug is reported after a time gap (different session, different context): create a NEW ticket and link via related_links.
