---
description: Review technical documentation for accessibility to non-technical users
---

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

Target: 4+ on all four criteria before publishing.
