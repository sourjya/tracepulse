# Catch Your First Error (60 seconds)

## Setup

TracePulse is running with your dev server. The agent has access to the tools.

## Step 1: Introduce a bug

Edit any backend file and introduce an error. For example, in a Python file:

```python
# Add a typo
def get_users():
    return db.query(Userr)  # Userr doesn't exist
```

## Step 2: Ask the agent

```
Check for backend errors
```

The agent calls `get_errors()` and sees:

```json
{
  "errors": [{
    "message": "NameError: name 'Userr' is not defined",
    "signal_score": 75,
    "context": {
      "file": "src/routes/users.py",
      "line": 42,
      "error_type": "NameError",
      "framework": "python"
    }
  }],
  "session_started_at": 1714300000000,
  "oldest_event_at": 1714300005000
}
```

## Step 3: Fix and verify

Fix the typo, then ask:

```
Verify my fix worked
```

The agent calls `verify_fix(10)`:

```json
{
  "verdict": "PASS",
  "summary": "Fix verified: zero new errors in 10s, no build errors."
}
```

## What just happened

1. Your dev server printed a Python traceback to stderr
2. TracePulse parsed it with the Python parser, extracted file:line
3. Signal scorer gave it 75/100 (error + stack trace + user code)
4. The agent read the structured error and knew exactly where to look
5. After your fix, `verify_fix` confirmed zero new errors

No log reading. No copy-paste. The agent saw the error and the fix in real time.
