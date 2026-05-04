#!/bin/bash
# TracePulse Integration Test Suite
# Tests the full server lifecycle: start -> errors flow -> verify -> stop
# Run after: npm install -g tracepulse
# Usage: bash scripts/test-integration.sh

set -uo pipefail

PASS=0; FAIL=0; TOTAL=0

# Resolve tracepulse CLI
TP_DIR=$(npm root -g 2>/dev/null)/tracepulse
if [ -f "$TP_DIR/dist/cli.js" ]; then
  TP="node $TP_DIR/dist/cli.js"
else
  TP="tracepulse"
fi

INIT='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'

check() {
  local name="$1" expect="$2" log="$3"
  ((TOTAL++))
  if grep -q "$expect" "$log" 2>/dev/null; then
    echo "  ✓ $name"; ((PASS++))
  else
    echo "  ✗ $name (expected '$expect')"; ((FAIL++))
    echo "    output: $(head -5 "$log" 2>/dev/null)"
  fi
}

check_not() {
  local name="$1" reject="$2" log="$3"
  ((TOTAL++))
  if grep -q "$reject" "$log" 2>/dev/null; then
    echo "  ✗ $name (found '$reject' but shouldn't)"; ((FAIL++))
  else
    echo "  ✓ $name"; ((PASS++))
  fi
}

tool_call() {
  # Send init + tool call, capture stdout and stderr
  local dir="$1" tool="$2" args="$3"
  local call="{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"$tool\",\"arguments\":$args}}"
  printf "%s\n%s\n" "$INIT" "$call" | timeout 8 bash -c "cd '$dir' && exec $TP $4" 2>"$dir/err.log" >"$dir/out.log" || true
}

tool_call_standalone() {
  local dir="$1" tool="$2" args="$3"
  tool_call "$dir" "$tool" "$args" ""
}

tool_call_start() {
  local dir="$1" tool="$2" args="$3" cmd="$4"
  tool_call "$dir" "$tool" "$args" "start '$cmd'"
}

echo "TracePulse Integration Tests"
echo "=============================="
echo "Using: $TP"
echo ""

# ── I1: get_errors returns empty on clean server ──
echo "I1: Clean server has no errors"
D=$(mktemp -d)
echo '{"name":"test","scripts":{"dev":"node -e \"require(\\\"http\\\").createServer((q,r)=>{r.end(\\\"ok\\\")}).listen(0)\""}}' > "$D/package.json"
tool_call_start "$D" "get_errors" '{"limit":5}' "node -e \"require('http').createServer((q,r)=>{r.end('ok')}).listen(0)\""
check "returns errors array" "errors" "$D/out.log"
rm -rf "$D"

# ── I2: get_project_health in standalone shows layers ──
echo "I2: Standalone get_project_health"
D=$(mktemp -d)
echo '{"name":"test","scripts":{"dev":"echo hi"}}' > "$D/package.json"
echo "DATABASE_URL=postgres://localhost/db" > "$D/.env"
tool_call_standalone "$D" "get_project_health" '{}'
check "layers present" "layers" "$D/out.log"
check "server not connected" "not_started" "$D/out.log"
check "suggests npm run dev" "npm run dev" "$D/out.log"
check "detects node stack" "node" "$D/out.log"
check "detects infra" "infra" "$D/out.log"
rm -rf "$D"

# ── I3: run_and_watch parses test output ──
echo "I3: run_and_watch parses commands"
D=$(mktemp -d)
RUNCALL='{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"run_and_watch","arguments":{"command":"node --version","timeout_seconds":5}}}'
printf "%s\n%s\n" "$INIT" "$RUNCALL" | timeout 10 bash -c "cd '$D' && exec $TP" 2>/dev/null >"$D/out.log" || true
check "run_and_watch returns result" "exit_code" "$D/out.log"
rm -rf "$D"

# ── I4: run_and_watch rejects bad commands ──
echo "I4: run_and_watch allowlist"
D=$(mktemp -d)
BADCALL='{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"run_and_watch","arguments":{"command":"rm -rf /","timeout_seconds":5}}}'
printf "%s\n%s\n" "$INIT" "$BADCALL" | timeout 10 bash -c "cd '$D' && exec $TP" 2>/dev/null >"$D/out.log" || true
check "rejects dangerous command" "not allowed" "$D/out.log"
rm -rf "$D"

# ── I5: check_port works ──
echo "I5: check_port"
D=$(mktemp -d)
tool_call_standalone "$D" "check_port" '{"port":18923}'
check "returns port status" "available" "$D/out.log"
rm -rf "$D"

# ── I6: check_drift runs without crash ──
echo "I6: check_drift"
D=$(mktemp -d)
echo "SECRET_KEY=abc" > "$D/.env.example"
tool_call_standalone "$D" "check_drift" '{}'
check "returns drift result" "env" "$D/out.log"
rm -rf "$D"

# ── I7: get_session_summary works ──
echo "I7: get_session_summary"
D=$(mktemp -d)
tool_call_standalone "$D" "get_session_summary" '{}'
check "returns session data" "errors" "$D/out.log"
rm -rf "$D"

# ── I8: get_session_insights includes recommendations ──
echo "I8: get_session_insights"
D=$(mktemp -d)
tool_call_standalone "$D" "get_session_insights" '{}'
check "returns recommendations" "recommendations" "$D/out.log"
rm -rf "$D"

# ── I9: acknowledge_error works ──
echo "I9: acknowledge_error"
D=$(mktemp -d)
tool_call_standalone "$D" "acknowledge_error" '{"fingerprint":"test-fp-123"}'
check "acknowledges error" "acknowledged" "$D/out.log"
rm -rf "$D"

# ── I10: get_bug_patterns without history ──
echo "I10: get_bug_patterns (no history)"
D=$(mktemp -d)
tool_call_standalone "$D" "get_bug_patterns" '{}'
check "returns patterns" "patterns" "$D/out.log"
rm -rf "$D"

# ── I11: Attach mode reads log file ──
echo "I11: Attach mode reads errors"
D=$(mktemp -d)
cat > "$D/server.log" << 'EOF'
[2026-05-04 12:00:00] INFO: Server started on port 8000
Traceback (most recent call last):
  File "app.py", line 42, in handler
    return data["missing_key"]
KeyError: 'missing_key'
[2026-05-04 12:00:01] INFO: Request completed
EOF
ATTACH_ERRORS='{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_errors","arguments":{"limit":5}}}'
printf "%s\n%s\n" "$INIT" "$ATTACH_ERRORS" | timeout 8 bash -c "cd '$D' && exec $TP attach --log-file ./server.log" 2>"$D/err.log" >"$D/out.log" || true
check "attach mode parses errors" "errors" "$D/out.log"
rm -rf "$D"

# ── I12: Persistence directory created ──
echo "I12: Persistence"
D=$(mktemp -d)
# Run standalone - check that it loads (even if 0 fingerprints)
printf "%s\n" "$INIT" | timeout 5 bash -c "cd '$D' && exec $TP" 2>"$D/err1.log" >"$D/out1.log" || true
check "loads fingerprints on startup" "Loaded" "$D/err1.log"
rm -rf "$D"

# ── I13: Clustered mode (requires v0.9.12+ with --clustered standalone fix) ──
echo "I13: Clustered mode"
D=$(mktemp -d)
CLUSTER_CALL='{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"tp_health","arguments":{}}}'
printf "%s\n%s\n" "$INIT" "$CLUSTER_CALL" | timeout 5 bash -c "cd '$D' && exec $TP standalone --clustered" 2>"$D/err.log" >"$D/out.log" || true
check "clustered mode starts" "Clustered mode" "$D/err.log"
check "tp_health gateway responds" "available_tools" "$D/out.log"
rm -rf "$D"

# ── I14: start_server pre-validation ──
echo "I14: start_server validation"
D=$(mktemp -d)
tool_call_standalone "$D" "start_server" '{"command":"PYTHONPATH=src python app.py"}'
check "rejects shell syntax" "invalid" "$D/out.log"
check "provides fix" "env" "$D/out.log"
rm -rf "$D"

echo ""
echo "=============================="
echo "$PASS/$TOTAL passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && echo "All tests passed!" && exit 0
echo "Some tests failed." && exit 1
