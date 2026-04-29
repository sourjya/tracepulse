# Server Management

Use TracePulse to manage and monitor your dev server across any language.

## Language-Specific Commands

### Node.js / TypeScript
```
tracepulse start "npm run dev"

# Agent can run:
run_and_watch("npm test")              # Run tests
run_and_watch("npx tsc --noEmit")      # Type check
run_and_watch("npm audit")             # Security scan
run_and_watch("npm outdated")          # Check outdated deps
restart_server()                       # Restart dev server
```

### Python / Django / FastAPI
```
tracepulse start "uvicorn app:app --reload"

# Agent can run:
run_and_watch("pytest")                # Run tests
run_and_watch("alembic current")       # Migration status
run_and_watch("alembic upgrade head")  # Run migrations
run_and_watch("pip audit")             # Security scan
run_and_watch("python manage.py check")# Django system checks
restart_server()                       # Restart dev server
```

### Go
```
tracepulse start "go run main.go"

# Agent can run:
run_and_watch("go test ./...")         # Run tests
run_and_watch("go vet ./...")          # Static analysis
run_and_watch("go build ./...")        # Build check
restart_server()                       # Restart dev server
```

### Rust
```
tracepulse start "cargo run"

# Agent can run:
run_and_watch("cargo test")            # Run tests
run_and_watch("cargo clippy")          # Lint
run_and_watch("cargo build")           # Build check
restart_server()                       # Restart dev server
```

### Java / Spring Boot
```
tracepulse start "mvn spring-boot:run"

# Agent can run:
run_and_watch("mvn test")              # Run tests
run_and_watch("mvn compile")           # Compile check
restart_server()                       # Restart dev server
```

## Common Workflows

### "Is everything healthy?"
```
get_health_summary()
```

### "Check dependencies"
```
run_and_watch("npm outdated")     # or pip list --outdated
```

### "Security scan"
```
run_and_watch("npm audit")        # or pip audit
```

### "Run migrations"
```
run_and_watch("alembic upgrade head")
verify_fix(10)                    # Confirm server is healthy after migration
```

### "Full project check"
```
get_health_summary()              # Server status
run_and_watch("npm test")         # Tests pass?
run_and_watch("npx tsc --noEmit") # Types clean?
get_build_errors()                # Build clean?
get_errors()                      # Runtime errors?
```
