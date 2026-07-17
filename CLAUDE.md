# TracePulse

## Tickets

Every code change gets a ticket first — see the `file-ticket` skill.
Ticket routing for this repo is in `.claude/ticketing.json` (prefix `TRP`).

When work lands as a PR, use the `ship-pr` skill — it cross-links the PR and the
ticket bidirectionally and reads the ticket web base URL from `.claude/ticketing.json`.
