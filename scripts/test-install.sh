#!/bin/bash
# TracePulse Installation Test Suite
# Run after: npm install -g tracepulse
# Usage: bash scripts/test-install.sh

set -uo pipefail

PASS=0; FAIL=0; TOTAL=0

INIT='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
HEALTH='{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_project_health","arguments":{}}}'

# Resolve tracepulse CLI - use node + dist/cli.js for reliability
TP_DIR=$(npm root -g 2>/dev/null)/tracepulse
if [ -f "$TP_DIR/dist/cli.js" ]; then
  TP="node $TP_DIR/dist/cli.js"
else
  TP="tracepulse"
fi

check() {
  local name="$1" expect="$2" log="$3"
  ((TOTAL++))
  if grep -q "$expect" "$log" 2>/dev/null; then
    echo "  ✓ $name"; ((PASS++))
  else
    echo "  ✗ $name (expected '$expect')"; ((FAIL++))
    echo "    output: $(head -3 "$log" 2>/dev/null)"
  fi
}

run_tp() {
  # Run tracepulse in a temp dir with MCP input on stdin
  local dir="$1"; shift
  printf "%s\n" "$@" | timeout 5 bash -c "cd '$dir' && exec $TP" 2>"$dir/err.log" >"$dir/out.log" || true
}

run_tp_start() {
  # Run tracepulse start with a command
  local dir="$1" cmd="$2"; shift 2
  printf "%s\n" "$@" | timeout 5 bash -c "cd '$dir' && exec $TP start '$cmd'" 2>"$dir/err.log" >"$dir/out.log" || true
}

echo "TracePulse Installation Tests"
echo "=============================="
echo "Using: $TP"
echo ""

# S1: Version
echo "S1: Version check"
timeout 3 bash -c "$TP --version" 2>/tmp/tp-s1.log >/dev/null || true
check "outputs version" "TracePulse v" /tmp/tp-s1.log

# S2: Node.js project
echo "S2: Node.js project"
D=$(mktemp -d)
echo '{"name":"test","scripts":{"dev":"echo hi"}}' > "$D/package.json"
run_tp "$D" "$INIT"
check "detects node stack" "node" "$D/err.log"
check "MCP handshake" "protocolVersion" "$D/out.log"
rm -rf "$D"

# S3: Python project
echo "S3: Python project"
D=$(mktemp -d)
echo "fastapi" > "$D/requirements.txt"
echo "DATABASE_URL=postgres://localhost/db" > "$D/.env"
run_tp "$D" "$INIT"
check "detects python stack" "python" "$D/err.log"
check "detects infra stack" "infra" "$D/err.log"
check "MCP handshake" "protocolVersion" "$D/out.log"
rm -rf "$D"

# S4: Python with start script
echo "S4: Python with start script"
D=$(mktemp -d)
mkdir -p "$D/scripts"
echo "fastapi" > "$D/requirements.txt"
printf '#!/bin/bash\necho starting' > "$D/scripts/start.sh"
run_tp "$D" "$INIT" "$HEALTH"
check "suggests start.sh" "scripts/start.sh" "$D/out.log"
rm -rf "$D"

# S5: Go project
echo "S5: Go project"
D=$(mktemp -d)
echo "module example.com/app" > "$D/go.mod"
run_tp "$D" "$INIT"
check "detects go stack" "go" "$D/err.log"
rm -rf "$D"

# S6: Rust project
echo "S6: Rust project"
D=$(mktemp -d)
printf '[package]\nname = "test"' > "$D/Cargo.toml"
run_tp "$D" "$INIT"
check "detects rust stack" "rust" "$D/err.log"
rm -rf "$D"

# S7: Empty directory
echo "S7: Empty directory"
D=$(mktemp -d)
run_tp "$D" "$INIT"
check "standalone mode" "standalone" "$D/err.log"
check "MCP handshake" "protocolVersion" "$D/out.log"
rm -rf "$D"

# S8: Monorepo
echo "S8: Monorepo (Node + Python)"
D=$(mktemp -d)
mkdir -p "$D/frontend" "$D/backend"
echo '{"name":"mono"}' > "$D/frontend/package.json"
echo "django" > "$D/backend/requirements.txt"
run_tp "$D" "$INIT"
check "detects node" "node" "$D/err.log"
check "detects python" "python" "$D/err.log"
rm -rf "$D"

# S9: Shell syntax diagnostic
echo "S9: Shell syntax diagnostic"
D=$(mktemp -d)
run_tp_start "$D" "PYTHONPATH=src python -m app" "$INIT"
check "detects shell syntax" "shell syntax" "$D/err.log"
rm -rf "$D"

# S10: Start with real command
echo "S10: Start mode"
D=$(mktemp -d)
run_tp_start "$D" "python -m http.server 0" "$INIT"
check "collector starts" "Collector started" "$D/err.log"
rm -rf "$D"

# S11: Full tool call round-trip
echo "S11: Tool call round-trip"
D=$(mktemp -d)
echo '{"name":"test","scripts":{"dev":"echo hi"}}' > "$D/package.json"
TOOL_CALL='{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_project_health","arguments":{}}}'
printf "%s\n%s\n" "$INIT" "$TOOL_CALL" | timeout 5 bash -c "cd '$D' && exec $TP" 2>/dev/null >"$D/out.log" || true
check "get_project_health returns layers" "layers" "$D/out.log"
check "detects node stack in response" "node" "$D/out.log"
rm -rf "$D"

# S12: Persistence creates .tracepulse/
echo "S12: Persistence"
D=$(mktemp -d)
run_tp "$D" "$INIT"
# Standalone with persist=true should create .tracepulse/ on shutdown
check "persistence dir hint" "fingerprints" "$D/err.log"
rm -rf "$D"

# S13: Attach mode with temp log file
echo "S13: Attach mode"
D=$(mktemp -d)
echo '[2026-05-04] ERROR: test error message' > "$D/test.log"
ATTACH_INIT='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
printf "%s\n" "$ATTACH_INIT" | timeout 5 bash -c "cd '$D' && exec $TP attach --log-file ./test.log" 2>"$D/err.log" >"$D/out.log" || true
check "attach mode starts" "protocolVersion" "$D/out.log"
rm -rf "$D"

# S14: Uninstall leaves no broken state
echo "S14: Uninstall/reinstall"
npm uninstall -g tracepulse >/dev/null 2>&1
# Verify command is gone
if command -v tracepulse >/dev/null 2>&1; then
  echo "  ✗ tracepulse still on PATH after uninstall"; ((FAIL++)); ((TOTAL++))
else
  echo "  ✓ tracepulse removed from PATH"; ((PASS++)); ((TOTAL++))
fi
# Reinstall
npm install -g tracepulse >/dev/null 2>&1
timeout 3 bash -c "$TP --version" 2>/tmp/tp-reinstall.log >/dev/null || true
check "reinstall works" "TracePulse v" /tmp/tp-reinstall.log

echo ""
echo "=============================="
echo "$PASS/$TOTAL passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && echo "All tests passed!" && exit 0
echo "Some tests failed." && exit 1
