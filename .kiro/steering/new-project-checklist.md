---
inclusion: always
---

# New Project Initialization — MANDATORY

When creating any new project, package, or shared-lib from scratch, ALL of the following steps MUST be completed before moving on to any other work. No exceptions.

## Preferred Method: Nexus MCP Tools (USE FIRST)

**Before doing ANY manual setup, use the Nexus MCP tools.** They automate the entire checklist below in one call:

| What you need | MCP tool to call | What it does |
|---------------|-----------------|--------------|
| New full app (backend + frontend) | `scaffold_project(name, display_name, description)` | Git init, steering, MCP config, DB, ports, GitHub repo — everything |
| New shared lib (TypeScript) | `platform_init_lib(name, description)` | Creates in `shared-libs/`, git, kiro-rails-light steering, package.json |
| Link lib to a project | `platform_link_lib(lib, project)` | Adds file: dependency, runs npm install |
| Build a lib | `platform_build_lib(lib)` | npm install + npm run build |
| Publish a lib | `platform_publish_lib(lib, bump)` | Version bump, build, commit, tag, push |

**These tools are available in ANY Kiro session** that has Nexus's MCP server configured (check `.kiro/settings/mcp.json`).

**Only fall back to the manual checklist below if:**
- Nexus MCP server is not available
- The project type isn't supported by the tools yet (e.g., Python shared lib)
- You need to customize something the tool doesn't handle

## Manual Checklist (fallback only)

### 1. Git Repository
```bash
git init
git branch -m main
```
- Every project is a git repo from the first file.

### 2. Kiro Steering Files
Copy the appropriate steering subset into `.kiro/steering/`:

**For full applications (backend + frontend):**
- Copy all steering files from the kiro-rails set

**For shared-libs / packages:**
- Copy from `/home/sourjya/coding/shared-libs/.kiro-rails-light/` or from an existing shared-lib like `beacon-ts/.kiro/steering/`:
  - `api-design-package-structure.md`
  - `code-quality.md`
  - `pitfalls.md`
  - `testing-standards.md`
  - `versioning-git.md`
- Add a `user-project-overrides.md` with project-specific config

### 3. MCP Settings
Create `.kiro/settings/mcp.json` with dev queue MCP server connection:
```json
{
  "mcpServers": {
    "dev_queue": {
      "command": "uv",
      "args": ["run", "--directory", "/path/to/devqueue-service", "python", "-m", "devqueue.mcp_server"],
      "env": {}
    }
  }
}
```

### 4. Dev Queue Registration
The project must be registered as a tool in the Nexus dev queue so tasks can be assigned to it. The tool name is the project directory name (e.g., `search-select`, `dialog`, `tooltip`).

### 5. Initial Commit
```bash
git add -A
git commit -m "chore: init project skeleton"
```

### 6. User-Project-Overrides
Fill in `user-project-overrides.md` with:
- Tech stack (e.g., "TypeScript library with React peer dep")
- Build tool (e.g., "Vite library mode")
- Test runner (e.g., "Vitest")
- Package manager (e.g., "npm")

## When This Applies

This checklist applies whenever you:
- Create a new directory under `/home/sourjya/coding/` intended as a project
- Create a new package under `/home/sourjya/coding/shared-libs/`
- Bootstrap any new codebase from scratch

## Why This Exists

BUG-003: Projects were created without git, without steering, and without dev queue registration — making them invisible to the platform and unmanageable by Kiro sessions.
