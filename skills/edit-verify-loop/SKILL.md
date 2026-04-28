# Edit-Verify Loop

Structured workflow for the edit → verify feedback cycle using TracePulse.

## When to Use

Use this skill after making code changes to verify they work correctly without introducing new errors.

## Workflow

### Step 1: Edit Code
Make your code change in the target file.

### Step 2: Watch for Errors
```
watch_for_errors(duration_seconds: 15)
```
Block for 15 seconds to collect any new errors after hot-reload. Check `hot_reload_detected` in the response to confirm the server reloaded.

### Step 3: Check Results

**If `hot_reload_detected: false`:**
- The dev server may not support hot-reload, or the file change wasn't detected
- Try `watch_for_errors(30)` with a longer duration
- Check `get_runtime_status()` to verify the server is still running

**If errors found:**
- Review each error's message and file location
- Go to Step 4 (Fix)

**If no errors:**
- Fix is clean — go to Step 6 (Confirm)

### Step 4: Fix Errors
Edit the code to address the reported errors.

### Step 5: Re-Watch
```
watch_for_errors(duration_seconds: 10)
```
Shorter duration for subsequent checks since the server is already warm.

### Step 6: Confirm Clean
```
get_build_errors()
```
Verify no TypeScript, ESLint, or build tool errors remain.

```
get_errors(limit: 5)
```
Quick check that no new errors appeared.

## Decision Tree

- **Errors found + hot-reload detected**: Fix the errors, re-watch
- **Errors found + no hot-reload**: Server may need manual restart
- **No errors + hot-reload detected**: Fix is clean ✓
- **No errors + no hot-reload**: Inconclusive — check server status
