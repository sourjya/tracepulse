## Kiro Steering File Integration

### Context

Kiro projects have steering files (`.kiro/steering/`) that describe the project:
- `tech.md` - frameworks, libraries, test runners, build tools
- `structure.md` - file organization, naming conventions
- `product.md` - product purpose, target users

Source: [Kiro Steering Docs](https://kiro.dev/docs/steering/)

### What TracePulse Should Read

On startup, scan for `.kiro/steering/tech.md` and extract:
- **Language/framework** - prioritize matching parsers
- **Test runner** - customize run_and_watch suggestions in diagnostics
- **Database** - pre-populate migration framework detection
- **Build tool** - customize get_build_errors behavior

### Implementation

Low effort - read file on startup, regex extract key fields, store as project hints. No new tools. Enhances existing tools with project-aware defaults.

### Example

If `tech.md` says "Python 3.12, FastAPI, PostgreSQL, pytest, alembic":
- Parser priority: Python, structlog, HTTP access log first
- `get_migration_status()` defaults to alembic without scanning for files
- Empty `get_errors()` suggests: "Server not started? Try `run_and_watch('uvicorn main:app --reload')`"
- `run_and_watch` suggestions use pytest, not jest
