# TracePulse Threat Model — STRIDE (AWS-Labs 9-Phase)

| Field | Value |
|-------|-------|
| **Framework** | AWS-Labs threat-modeling MCP server (STRIDE, 9-phase) |
| **Scope** | Full codebase, TracePulse v0.9.31 |
| **Date** | 2026-07-17 |
| **Deployment model** | Local-first: CLI + stdio MCP server on the developer's own workstation. No cloud backend, no customer data. |
| **Threats identified** | 14 (5 High, 4 Medium, 5 Low) across all six STRIDE categories |
| **Actors (relevant)** | 5 of 10 (content-injection attacker, supply chain, over-privileged agent, script kiddie, local insider) |
| **Machine-readable export** | `.threatmodel/tracepulse-v0.9.31-threat-model.json` (Threat Composer schema) + `.md` — *gitignored, local only* |
| **Run tracker** | TRP-41 (epic TRP-40) |
| **Related reports** | [SECURITY_LOG](SECURITY_LOG.md), SRR-001…SRR-006, SRR-007 |

> This is the canonical trust-boundary + STRIDE frame for TracePulse. It is deliberately run **first** in the
> pre-release review so the security-lens sweep can prioritise against real trust boundaries and cut false
> positives. Individual findings cross-reference their prior `SRR-###` IDs where one already exists.

---

## 1. Executive summary

TracePulse is a **local-first developer-observability tool** shipped as an npm package. It runs as a CLI and,
primarily, as a **Model Context Protocol (MCP) server that an LLM coding agent drives over stdio**. Its job is
to execute a developer's build/test/run commands, capture and parse the (untrusted) output, redact secrets,
correlate errors, and hand structured insight back to the agent.

That purpose defines the threat surface. There is **no remote network exposure by default** and **no customer
data**; the assets at stake are the **developer's own workstation, secrets, and source**. The three dominant
risk themes are:

1. **Agent-driven command execution** (Elevation of Privilege). Three tools spawn with `shell: true` at full
   user privilege. `run_and_watch` is allowlist-gated; **`start_server` and `verify_mcp` are not** (metachar
   denylist only), and the `run_and_watch` allowlist is a *prefix* match that includes `bash`/`sh`/`npx`.
2. **Secret leakage back to the agent** (Information Disclosure). `run_and_watch` returns `raw_output`
   **un-redacted**, and the local store is written at default file permissions.
3. **Prompt injection via ingested content** (Tampering). Untrusted program output is surfaced to the agent by
   design, so crafted output can steer the agent's tool calls — a shared-responsibility residual.

Two threats are already **adequately closed by existing code** (ReDoS — bounded by a 10 KB parse cap; and the
loopback-only bind + optional API key for listeners). Everything else has a planned mitigation.

**A note on framing (see §6.5).** The command-execution risk is *not* that agents run `bash`/`npx` — that is the
product's core function, and routing all agent shell through TracePulse's instrumented chokepoint is intentional
(the friction gradient, TRP-21). On the *authorization* axis, that routing loses almost nothing: the agent decides
the command either way. The safety that actually matters — **env-scrub, output-redaction, cwd-confinement, audit**
— was never in a command gate, and raw Bash never provided it. So the fixes below **add net-new containment and
sanitization at the chokepoint** rather than restrict what agents may run. The design lives in **TRP-53 (Safe Agent
Command Execution)**; near-term fixes and other findings are tracked as **TRP-54…TRP-67**.

---

## 2. Business context & assumptions

**System criticality** Medium · **Data sensitivity** Confidential (developer secrets/source) · **Auth** None
(local stdio) · **Regulatory** None · **Financial impact** Low.

Key scoping assumptions (full list in the export, `A001`–`A011`):

- **A001** The LLM agent (MCP client) is **semi-trusted**: it acts for the developer, but its context can be
  poisoned by untrusted content, so its tool-call arguments are treated as potentially adversarial.
- **A002** TracePulse runs at the developer's **full OS privilege with no sandbox**; any RCE = workstation compromise.
- **A004** Process/build/test output and source files are **untrusted input**.
- **A005** Distributed via **public npm**; the 2-dep runtime surface + publish pipeline is a trust boundary.
- **A007** The persisted store relies solely on **OS file permissions** (no encryption-at-rest).

---

## 3. Trust zones & boundaries

### Trust zones

| Zone | Trust | Contents |
|------|-------|----------|
| **TZ006** Semi-Trusted Agent Boundary | Low | LLM coding agent (MCP client) + stdio transport |
| **TZ003** TracePulse Core Process | Medium | MCP server, command-tool handlers, ingestion pipeline + redactor, parsers, config scanner |
| **TZ005** Command Execution | Low | Spawned child processes (`shell:true`, full user privilege, no sandbox) |
| **TZ002** Local Network Listeners | Low | Opt-in REST (127.0.0.1:9800) + dormant frontend collector |
| **TZ004** Local Persistence & Config | Medium | `.tracepulse/` store + `.env` read source (OS-perm protected) |
| **TZ001** Untrusted Content & Network Ingress | Untrusted | Source/deps/child-output, browser POST bodies, LAN clients |

### Boundaries & their controls

| Boundary | Crossing | Controls in place | Gap |
|----------|----------|-------------------|-----|
| **Agent ↔ Core** (TB005) | MCP tool call over stdio; result return | stdio-local only; per-tool Zod schemas; redaction on `errors[]` | `raw_output` returned **un-redacted** (TM-03); no channel auth |
| **Command Execution** (TB006) | `spawn(shell:true)`; output ingestion | run_and_watch allowlist + metachar denylist + cwd guard; 10 KB truncation; redaction | `verify_mcp`/`start_server` have **no allowlist** (TM-01); allowlist prefix bypass (TM-02) |
| **Local Network** (TB007) | client → loopback listeners; outbound probes | loopback bind; optional API key; rate limits; SSRF hostname allowlist | REST auth **off by default** (TM-08); origin check bypassable (TM-09) |
| **Persistence & Config** (TB008) | core → disk; `.env` read | default umask; `.tracepulse` gitignored; stored msg redacted+truncated; creds dropped from scan | files **world-readable** per umask (TM-05) |

---

## 4. Threat actors (relevant)

| # | Actor | Cap. | Why relevant |
|---|-------|------|--------------|
| 1 | **External Attacker** (via injected content) | Med | Plants payloads in source/deps/logs → prompt injection, secret exfil, ReDoS, SSRF. No workstation access needed. |
| 2 | **Compromised Dependency / Supply Chain** | High | A bad npm dep or publish-pipeline compromise runs in every consumer's dev env. |
| 3 | **Privileged User** (the agent itself) | High | Wields command-exec authority; destructive/over-broad calls, accidental or injected. |
| 4 | **Script Kiddie** | Low | Opportunistic abuse of an unauthenticated local listener. |
| 5 | **Insider** (same-host process/user) | Med | Local read of the store/config or the tool's listener. |

*Down-scoped as not relevant:* Nation-state, Organized Crime, Hacktivist, Competitor, Disgruntled Employee —
a v0.9, small-user-base, no-backend local dev tool is not their target (generic supply-chain interest is
captured by actor #2).

---

## 5. STRIDE threat register

Severity = worst-case impact; Likelihood per default config. **Status: Open** = needs a code fix (finding
ticket); **Resolved** = adequately handled by an existing control.

| ID | STRIDE | Threat | Sev | Likely | Status | Prior ref |
|----|--------|--------|-----|--------|--------|-----------|
| **TM-01** | Elevation | `verify_mcp` & `start_server` run agent commands with **no allowlist** (metachar denylist only) → RCE | High | Possible | **Open** | SRR-006 M-003, SRR-004 H-004 |
| **TM-02** | Elevation | `run_and_watch` allowlist is a **prefix match incl. `bash`/`sh`/`npx`** → arbitrary exec | High | Possible | **Accepted (by design)** → TRP-53/59 | SRR-003 H-001, SRR-004 M-008 |
| **TM-03** | Info Disclosure | `run_and_watch` returns **`raw_output` un-redacted** to the agent (last 100 lines/32 KB) | High | Likely | **Open** | *new* |
| **TM-04** | Tampering | **Prompt injection**: ingested untrusted output surfaced to the agent steers its tool calls | High | Possible | **Open** | *new (structural)* |
| **TM-11** | Tampering | **Supply-chain** compromise of a dependency or the publish pipeline → RCE in all consumers | High | Unlikely | **Open** | SRR-004 S-001 |
| **TM-05** | Info Disclosure | `.tracepulse/*` written at **default umask** (world-readable); may hold partial secrets | Med | Possible | **Open** | rel. SRR-003 M-005 |
| **TM-06** | Info Disclosure | **Redaction coverage gaps** — a secret in an unknown format bypasses `redact()` | Med | Possible | **Open** | SRR-003 M-004 |
| **TM-08** | Info Disclosure | REST listener **auth off by default** (no `TRACEPULSE_API_KEY`) exposes error/session data on loopback | Med | Possible | **Open** | SRR-006 M-001 |
| **TM-12** | Tampering | `run_and_watch` cwd guard blocks relative escape but **allows absolute paths** outside root | Med | Possible | **Open** | rel. SRR-003 H-002 (rel. fixed) |
| **TM-07** | Denial of Svc | **ReDoS** via crafted output on parser regexes | Low | Unlikely | **Resolved** — 10 KB parse cap | SRR-004 M-009 |
| **TM-09** | Tampering | Frontend collector **origin check bypassable** (absent Origin header); currently dormant | Low | Unlikely | **Open** | SRR-004 H-005 |
| **TM-10** | Info Disclosure | `register_probe` **SSRF** limited to loopback but any port → same-host port recon | Low | Possible | **Open** | rel. SRR-003 M-001 |
| **TM-13** | Repudiation | Local JSONL journal is user-writable → **no tamper-evident** command audit | Low | Possible | **Accepted** (residual) | *new* |
| **TM-14** | Denial of Svc | Unbounded/detached spawns → workstation **resource exhaustion** | Low | Possible | **Open** | TRP-26 |

Every threat has ≥1 linked mitigation (17 total); existing controls are recorded as `mitigationResolved` with
their `file:line`, planned fixes as `mitigationIdentified`.

---

## 6. Remediation — High-severity findings

**TM-01 — Add an allowlist to `verify_mcp` and `start_server`.** Apply `buildAllowlist()` prefix checks (or route
through the `run_and_watch` path) in `verify-mcp.ts` and `start-server-validation.ts`, not just the metachar
denylist. *Cost Low · Effectiveness High.*

**TM-02 — Accepted by design; reframed as a classifier (TRP-59).** `bash`/`sh`/`npx` are *required* by coding
agents, and the allowlist keeps growing toward "everything an agent needs" — so it can never be a security *gate*.
It is reframed as a *classifier* (§6.5): Green = auto/instrumented fast path, Amber = escape hatch that runs but
is confirmed-once, Red = contained. TM-02 is not a vulnerability to fix; the real finding is "the chokepoint does
not yet contain or sanitize," closed by TM-03/env-scrub/TM-12/TM-01. Long-standing as SRR-003 H-001.

**TM-03 — Redact `raw_output`.** Pipe `rawLines` through `redact()` in `run-and-watch.ts:286-295` before
serialising `raw_output`. Today only `errors[]` are redacted. *Cost Low · Effectiveness High.*

**TM-04 — Untrusted-content posture.** Label `errors[]`/`raw_output` as untrusted data in the tool result and
rely on harness guardrails rather than the tool auto-acting; document prompt injection as a structural
shared-responsibility residual. *Cost Medium · Effectiveness Medium.*

**TM-11 — Supply-chain hardening.** Commit a lockfile, publish with **npm provenance**, gate CI on `npm audit`,
keep the 2-dep surface minimal. *Cost Medium · Effectiveness Medium.*

**Medium:** TM-05 `chmod 0600`/`0700` the store on write · TM-06 expand redaction patterns + entropy heuristic ·
TM-08 default-deny (or loudly warn) when `--http` set without an API key · TM-12 constrain absolute cwd within
project root.

---

## 6.5 Safe Agent Command Execution — design direction (TRP-53)

**Premise (accepted).** By design, the agent routes its debug/ad-hoc/dev shell through TracePulse's structured
routes so it gets logging, analysis, and short summaries back instead of sifting GBs of raw output. `init`
deny-hooks raw Bash and auto-approves the TP tools (TRP-21). TracePulse is the command-execution **chokepoint** on
purpose.

**Corrected thesis.** Routing through `run_and_watch` loses ~nothing on *authorization* — per-command allow/deny of
an opaque string is theater against a trusted-but-hijackable agent, and the one conditional loss (the harness's
per-command human confirm) only bites a user who relied on it. The safety that matters was never in the gate:

| Property | Raw Bash via harness | `run_and_watch` today | The opportunity |
|----------|----------------------|-----------------------|-----------------|
| Env scope | full shell env | full `process.env` | **scrub to declared env** |
| Output → agent | un-redacted | un-redacted (`raw_output`) | **redact the courier** |
| Cwd scope | none | relative-only | **confine to project** |
| Audit | none | journaled | already there |

The chokepoint's job is therefore to **add** containment + sanitization that neither path had — net-new safety,
possible only because everything funnels through one instrumented route. **Product story = security story.**

**Layers.** (1) *Govern* — allowlist becomes a **classifier**: Green (recognized dev cmds → auto/instrumented,
95% path), Amber (`bash -c`/`sh -c`/`npx <unknown>`/scripts → run + instrument, **confirm-once then
session-remember** — a thin human-in-the-loop backstop for the injection case only), Red (destructive / external
`curl|sh` / writes outside project → confirm or sandbox). Growing agent needs only grow the Green fast path.
(2) *Contain* — scrub child env (defeats `run_and_watch("bash -c env")` regardless of command) + confine cwd.
(3) *Sanitize* — redact **all** output incl. `raw_output`; label output untrusted. (4) *Optional isolation* —
opt-in sandbox backend for Amber/Red, off by default. (5) *Audit* — tamper-aware record of what ran.

**Sequencing.** Near-term (v0.9.31, no capability loss): env scrub **TRP-55**, redact `raw_output` **TRP-54**, cwd
confine **TRP-57**, guardrail parity **TRP-56**, untrusted-output label **TRP-58**. Spec as a milestone: the tier
classifier + sandbox **TRP-59** (`.kiro/specs/`). Positioning/docs: **TRP-60** (README + GitBook — the instrumented
chokepoint *adds* env/output/cwd/audit safety raw shell never had).

---

## 7. Residual risk

- **Command execution at full user privilege (A002/A009).** Even after TM-01/TM-02, a determined injection retains
  RCE *potential*; hardening reduces likelihood, not impact. Accepted for a local single-user tool — a sandbox is
  out of scope for v0.9.31.
- **Prompt injection (TM-04).** Not fully closable in the tool alone; mitigated by defense-in-depth + the agent
  harness's own guardrails.
- **ReDoS (TM-07).** Reduced to negligible cost by the 10 KB cap; no further action.
- **Repudiation (TM-13).** A user who owns the process can always alter their own local journal; out of scope.
- **Listeners (TM-08/TM-09).** Loopback-only and opt-in; real exposure only if a user enables `--http` without an
  API key on a shared host.

---

## 8. Traceability

- **Machine-readable model** → `.threatmodel/tracepulse-v0.9.31-threat-model.{json,md}` (gitignored).
- **Run tracker** → TRP-41 (under epic TRP-40); the rollup comment there indexes every finding ticket.
- **Finding tickets** (each cross-linked to TRP-41, tagged with its `TM-##`):
  - Design umbrella **TRP-53** (Safe Agent Command Execution) → children **TRP-54** (TM-03), **TRP-55** (env scrub /
    SRR-003 M-003), **TRP-56** (TM-01), **TRP-57** (TM-12), **TRP-58** (TM-04), **TRP-59** (TM-02 classifier),
    **TRP-60** (docs).
  - Standalone: **TRP-61** (TM-05), **TRP-62** (TM-06), **TRP-63** (TM-08), **TRP-64** (TM-09), **TRP-65** (TM-10),
    **TRP-66** (TM-11), **TRP-67** (TM-13, accepted).
  - No ticket: **TM-07** (resolved by 10 KB cap) · **TM-14** (folded into TRP-26).
- **Prior findings** → cross-referenced to `SRR-###` in the register above; standing-open items carried into the
  pre-release fix scope.
- **Next** → the security-lens sweep (SRR-###-T3, AISR) runs against these boundaries; every High+ finding gets an
  adversarial second-pass verification before it earns a fix.
