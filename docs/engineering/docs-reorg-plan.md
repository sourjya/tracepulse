# Docs Reorganization Plan

## Current Problems

1. **`docs/research/`** is a dumping ground - 20+ files mixing competitive analysis, architecture research, parser samples, token savings, agent feedback, and ecosystem analysis
2. **`docs/engineering/`** mixes process docs (evolution timeline, tech-docs-review-prompt) with technical designs (designs/ subfolder) and operational guides (installation-matrix, companion-tools-config)
3. **`docs/reviews/`** and **`docs/security/`** are separate but both contain audit reports - should be unified under `docs/audits/`
4. **`docs/marketing/`** has 5 files that are really product positioning docs, not marketing campaigns
5. **`docs/artifacts/`** has screenshots that should be in `.gitbook/assets/` or ignored entirely
6. **ADR numbering conflict** - two ADR-002 files exist (golden-file-testing and browser-error-capture)

## Proposed Structure

```
docs/
├── architecture/           # HOW the system works (unchanged, good)
│   ├── architecture-guide.md
│   ├── tool-responsibility-matrix.md
│   └── diagrams.md
├── decisions/              # ADRs (unchanged, fix numbering)
│   ├── ADR-001-tech-stack.md
│   ├── ADR-002-golden-file-testing.md
│   └── ADR-003-browser-error-capture.md  (renumber)
├── research/               # EXTERNAL research (competitive, market, academic)
│   ├── README.md (index)
│   ├── competitive/        (unchanged)
│   ├── ecosystem/          (unchanged)
│   ├── deep-research-2026.md
│   ├── platform-strategy.md
│   ├── token-savings.md
│   ├── mcp-tooling.md
│   ├── ip-positioning.md
│   └── parser-samples/     (move 3 parser-samples-*.md here)
├── feedback/               # AGENT feedback (move from research/agent-feedback/)
│   ├── agent-feedback-log.md
│   ├── agent-wishlist.md
│   └── session-reports/
├── engineering/            # INTERNAL engineering docs
│   ├── designs/            (unchanged)
│   ├── evolution-timeline.md
│   ├── installation-matrix.md
│   ├── collector-pitfalls.md
│   ├── chokepoint-log.md
│   └── tech-docs-review-prompt.md
├── audits/                 # ALL review reports (merge reviews/ + security/)
│   ├── security/
│   │   ├── SECURITY_LOG.md
│   │   └── SRR-*.md
│   ├── maintainability/
│   │   └── MRR-*.md
│   ├── test-quality/
│   │   └── TQR-*.md
│   ├── dependencies/
│   │   └── DRR-*.md
│   └── code-review/
│       └── CRR-*.md
├── testing/                # Test plans and coverage (unchanged)
├── bugs/                   # Bug reports (unchanged)
├── roadmap/                # Planning (unchanged)
├── changelogs/             # History (unchanged)
├── technical-debt/         # Debt tracking (unchanged)
├── product/                # Rename from marketing/ - positioning, USPs, demos
│   ├── mission-and-positioning.md
│   ├── usps-from-research.md
│   └── demo-designs.md
└── runbooks/               # Operational guides (unchanged)
```

## Key Changes

| Current | Proposed | Reason |
|---------|----------|--------|
| `docs/research/agent-feedback/` | `docs/feedback/` | Agent feedback is operational, not research |
| `docs/reviews/` + `docs/security/` | `docs/audits/` | All audit reports in one place, typed by subfolder |
| `docs/marketing/` | `docs/product/` | It's product positioning, not marketing campaigns |
| `docs/research/parser-samples-*.md` | `docs/research/parser-samples/` | Group related files |
| `docs/artifacts/` | Remove (screenshots in .gitbook/assets/) | Duplicates |
| ADR-002 conflict | Renumber to ADR-003 | Fix collision |

## Files That Reference docs/ Paths

These need updating after the move:
- `docs/roadmap/roadmap.md` - links to reviews, security, decisions
- `docs/research/README.md` - links to all research docs
- `.kiro/steering/review-policy.md` - paths to security/ and reviews/
- `.kiro/steering/documentation-standards.md` - folder structure docs
- `gitbook/` pages that link to docs/ (installation-matrix, etc.)

## Effort

- File moves: 30 minutes
- Link updates: 1-2 hours (grep + sed)
- Verification: 30 minutes (check all links resolve)
- Total: ~3 hours

## Risk

- Broken links in gitbook (published docs)
- Broken references in steering files
- Git history harder to follow (renames)

## Recommendation

Do this as a single atomic commit on a dedicated branch. Run `grep -rn "docs/" --include="*.md"` before and after to verify all links.
