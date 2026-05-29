---
description: "Full project health check: server, infra, errors, build"
---

# @tp-health

Quick project health assessment.

1. Call `get_project_health()` for composite status
2. If server is not running: suggest `start_server` with the appropriate command
3. If errors exist: list top 3 by signal score with one-line summaries
4. If infrastructure issues: report which services are unreachable
5. If build errors: report count and first error
6. One-paragraph summary: healthy / degraded / broken, with next action
