---
description: "Cross-layer diagnosis: correlate backend, frontend, git, and infra signals"
---

# @tp-diagnose

Deep diagnosis when something is broken but the cause isn't obvious.

1. Call `get_cross_layer_diagnosis(time_window_seconds: 60)`
2. Call `correlate_with_diff()` to link errors to recent code changes
3. If frontend errors exist: call `get_correlated_errors()` to match with backend
4. Present findings:
   - Root cause hypothesis (with confidence: high/medium/low)
   - Which layer originated the failure
   - Which files changed that likely caused it
   - Recommended fix
5. If confident: implement the fix and verify with `verify_loop`
6. If uncertain: present 2-3 hypotheses ranked by likelihood, ask which to pursue
