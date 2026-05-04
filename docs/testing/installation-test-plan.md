# Installation Testing Plan

Manual test matrix for verifying TracePulse installs and starts correctly across environments.

## Test Matrix

### Environment Setup

Each test uses a fresh directory to simulate a new user. Run each scenario independently.

### Scenario 1: Fresh Node.js project
```bash
mkdir /tmp/tp-test-node && cd /tmp/tp-test-node
npm init -y
echo '{"scripts":{"dev":"echo server running && sleep 30"}}' > package.json
echo '{"mcpServers":{"tracepulse":{"command":"tracepulse"}}}' > mcp.json
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}\n' | timeout 5 tracepulse 2>/tmp/tp-test-1.log
echo "STDERR:"; cat /tmp/tp-test-1.log
# EXPECT: MCP handshake succeeds, stderr shows "Stacks detected: node"
```

### Scenario 2: Python project (no venv)
```bash
mkdir /tmp/tp-test-python && cd /tmp/tp-test-python
echo "fastapi\nuvicorn" > requirements.txt
echo "DATABASE_URL=postgres://localhost/db" > .env
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}\n' | timeout 5 tracepulse 2>/tmp/tp-test-2.log
echo "STDERR:"; cat /tmp/tp-test-2.log
# EXPECT: MCP handshake succeeds, stderr shows "Stacks detected: python, infra"
```

### Scenario 3: Python project with start script
```bash
mkdir -p /tmp/tp-test-pyscript/scripts && cd /tmp/tp-test-pyscript
echo "fastapi" > requirements.txt
echo '#!/bin/bash\necho "starting server"' > scripts/start.sh
chmod +x scripts/start.sh
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}\n{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_project_health","arguments":{}}}\n' | timeout 5 tracepulse 2>/tmp/tp-test-3.log
# EXPECT: get_project_health suggests "bash scripts/start.sh"
```

### Scenario 4: Go project
```bash
mkdir /tmp/tp-test-go && cd /tmp/tp-test-go
echo "module example.com/app\ngo 1.22" > go.mod
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}\n' | timeout 5 tracepulse 2>/tmp/tp-test-4.log
echo "STDERR:"; cat /tmp/tp-test-4.log
# EXPECT: "Stacks detected: go"
```

### Scenario 5: Empty directory (fresh project)
```bash
mkdir /tmp/tp-test-empty && cd /tmp/tp-test-empty
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}\n' | timeout 5 tracepulse 2>/tmp/tp-test-5.log
echo "STDERR:"; cat /tmp/tp-test-5.log
# EXPECT: MCP handshake succeeds, standalone mode, no stacks detected
```

### Scenario 6: Monorepo (Node + Python)
```bash
mkdir -p /tmp/tp-test-mono/{frontend,backend} && cd /tmp/tp-test-mono
echo '{"name":"mono","scripts":{"dev":"echo hi"}}' > frontend/package.json
echo "fastapi" > backend/requirements.txt
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}\n' | timeout 5 tracepulse 2>/tmp/tp-test-6.log
echo "STDERR:"; cat /tmp/tp-test-6.log
# EXPECT: "Stacks detected: node, python"
```

### Scenario 7: Start mode with env vars
```bash
mkdir /tmp/tp-test-env && cd /tmp/tp-test-env
echo "fastapi" > requirements.txt
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}\n' | timeout 5 tracepulse start "python -m http.server" 2>/tmp/tp-test-7.log
echo "STDERR:"; cat /tmp/tp-test-7.log
# EXPECT: Server starts (or falls back with diagnostics), MCP handshake succeeds
```

### Scenario 8: Bad command (startup diagnostics)
```bash
mkdir /tmp/tp-test-bad && cd /tmp/tp-test-bad
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}\n' | timeout 5 tracepulse start "PYTHONPATH=src python -m app" 2>/tmp/tp-test-8.log
echo "STDERR:"; cat /tmp/tp-test-8.log
# EXPECT: Startup diagnostics: "PYTHONPATH=src is shell syntax", suggests env field
```

## Automated test script

Run all scenarios at once:

```bash
#!/bin/bash
# Save as test-install.sh, run after npm install -g tracepulse
PASS=0; FAIL=0

check() {
  local name="$1" expect="$2" log="$3"
  if grep -q "$expect" "$log" 2>/dev/null; then
    echo "PASS: $name"; ((PASS++))
  else
    echo "FAIL: $name (expected '$expect')"; ((FAIL++))
    cat "$log"
  fi
}

INIT='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'

# S1: Node project
D=$(mktemp -d); echo '{"scripts":{"dev":"echo hi"}}' > "$D/package.json"
printf "$INIT\n" | timeout 5 sh -c "cd $D && tracepulse" 2>"$D/err.log" >/dev/null
check "S1: Node project" "node" "$D/err.log"

# S2: Python project
D=$(mktemp -d); echo "fastapi" > "$D/requirements.txt"
printf "$INIT\n" | timeout 5 sh -c "cd $D && tracepulse" 2>"$D/err.log" >/dev/null
check "S2: Python project" "python" "$D/err.log"

# S3: Go project
D=$(mktemp -d); echo "module example.com/app" > "$D/go.mod"
printf "$INIT\n" | timeout 5 sh -c "cd $D && tracepulse" 2>"$D/err.log" >/dev/null
check "S3: Go project" "go" "$D/err.log"

# S4: Empty directory
D=$(mktemp -d)
printf "$INIT\n" | timeout 5 sh -c "cd $D && tracepulse" 2>"$D/err.log" >/dev/null
check "S4: Empty directory" "standalone" "$D/err.log"

# S5: Bad command diagnostics
D=$(mktemp -d)
printf "$INIT\n" | timeout 5 sh -c "cd $D && tracepulse start 'PYTHONPATH=src python -m app'" 2>"$D/err.log" >/dev/null
check "S5: Shell syntax diagnostic" "shell syntax" "$D/err.log"

echo "---"
echo "$PASS passed, $FAIL failed"
```

## Platform testing

| Platform | How to test |
|----------|-------------|
| **Linux (native)** | Run test script directly |
| **macOS** | Run test script - verify `realpath` fallback in bin wrapper |
| **Windows** | `npm install -g tracepulse`, verify `tracepulse --version` works in cmd.exe and PowerShell |
| **WSL** | Run test script inside WSL - this is where most Windows devs use TracePulse |
| **Docker** | `docker run -it node:22 sh -c "npm i -g tracepulse && tracepulse --version"` |

## Kiro IDE testing

For each scenario above, also test in Kiro:
1. Create `.kiro/settings/mcp.json` with `{"mcpServers":{"tracepulse":{"command":"tracepulse"}}}`
2. Open Kiro in the project directory
3. Check `/mcp list` - TracePulse should show "running" with 39 tools
4. Ask "check project health" - agent should call `get_project_health` and report detected stacks
