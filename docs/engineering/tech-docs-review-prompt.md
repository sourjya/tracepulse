# Tech Docs Accessibility Review Prompt

Use this prompt to review technical documentation for non-technical audiences. Paste it into any AI agent along with the page content.

---

## The Prompt

The prompt lives at `.kiro/prompts/review-docs-accessibility.md` and can be invoked via `@review-docs-accessibility` in Kiro CLI.

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
