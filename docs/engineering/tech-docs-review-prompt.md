# Tech Docs Accessibility Review Prompt

Use this prompt to review technical documentation for non-technical audiences. Paste it into any AI agent along with the page content.

---

## The Prompt

```
Review this documentation page for accessibility to non-technical users who are experimenting with AI coding tools for the first time. They may be designers, product managers, or developers who are new to MCP, CLI tools, and config files.

Score each section 1-5 on these criteria:

**Clarity (can they follow the steps?)**
- Are instructions numbered and sequential?
- Is each step one action, not three?
- Would someone who has never opened a terminal know what to do?

**Jargon (do they need a CS degree?)**
- Flag every term that needs explanation: MCP, CLI, stdin, stdout, stderr, spawn, symlink, shebang, ESM, CJS, env vars, PATH, npm, npx, global install
- For each flagged term: is it explained on first use, or assumed?
- Could a simpler word replace it without losing meaning?

**Anxiety (will they feel lost?)**
- Are there "what if this doesn't work?" escape hatches at each step?
- Is the happy path obvious and the error path gentle?
- Do warnings explain WHY, not just WHAT?

**Completeness (can they finish without outside help?)**
- Can they go from zero to working without leaving this page?
- Are prerequisites stated upfront, not discovered mid-flow?
- Are copy-paste blocks complete (not fragments they need to assemble)?

For each issue found, provide:
1. The problematic text (quote it)
2. Why it's a problem for a non-technical reader
3. A rewritten version

End with an overall score (1-5) and the top 3 changes that would have the most impact.
```

---

## When to use

- Before publishing any getting-started or installation page
- After major rewrites of user-facing docs
- When adding a new integration or setup path
- Quarterly review of existing docs

## How to use

1. Copy the prompt above
2. Paste it into any AI agent (Claude, ChatGPT, Kiro, etc.)
3. Follow it with the page content (copy from GitBook or the markdown file)
4. Review the findings and apply fixes
5. Re-run on the fixed version to verify

## Calibration

A score of 4+ on all four criteria means the page is ready for non-technical users. Below 3 on any criterion means the page needs work before publishing.

| Score | Meaning |
|-------|---------|
| 5 | A designer could follow this with zero help |
| 4 | Minor jargon but steps are clear |
| 3 | Technical reader would be fine, non-technical would struggle |
| 2 | Assumes significant prior knowledge |
| 1 | Only makes sense if you already know how it works |
