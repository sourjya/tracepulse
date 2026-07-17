---
description: "Investigate and fix the latest backend error"
---

# @tp-debug

Structured debugging workflow using TracePulse.

1. Call `get_errors(limit: 5)` to see recent errors sorted by signal score
2. If no errors: call `get_health_summary()` and report "No errors detected"
3. For the highest-signal error:
   a. Call `get_prompt_context(fingerprint)` for full context (stack + logs + file)
   b. Read the source file at the error location
   c. Identify the root cause
   d. Fix the code
   e. Call `verify_loop(claim: "Fixed <error description>", fingerprint: "<fp>")` to confirm
4. If verification fails, read the new error and iterate
5. Summary: what broke, why, what you fixed, verification result
